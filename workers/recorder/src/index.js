import "cross-fetch/polyfill.js";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mime from "mime-types";

// ====== ENV ======
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// bucket & dossier
const BUCKET = process.env.REC_BUCKET || "live-recordings";
const TMP_DIR = process.env.TMP_DIR || "/tmp";
const WORKER_ID =
  process.env.WORKER_ID || `wrk-${crypto.randomBytes(4).toString("hex")}`;
const LOOP_DELAY_IDLE_MS = Number(process.env.LOOP_DELAY_IDLE_MS || 4000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 1000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ====== Helpers ======
async function leaseJob() {
  // 1) Pick a queued, unclaimed job atomically
  const { data: jobs, error } = await supa
    .from("live_recordings")
    .select("id,user_id,link_id,m3u8,max_seconds,status,claimed_by,claimed_at")
    .eq("status", "queued")
    .is("claimed_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error("select queued failed: " + error.message);
  if (!jobs || !jobs.length) return null;

  const job = jobs[0];

  // try claim
  const { data: upd, error: updErr } = await supa
    .from("live_recordings")
    .update({
      claimed_by: WORKER_ID,
      claimed_at: new Date().toISOString(),
      status: "recording",
    })
    .eq("id", job.id)
    .is("claimed_at", null) // ensures no one else claimed
    .select()
    .maybeSingle();

  if (updErr) throw new Error("claim failed: " + updErr.message);
  if (!upd) return null; // lost the race
  return upd;
}

function runFfmpegCapture(m3u8, maxSeconds, outFile) {
  return new Promise((resolve, reject) => {
    // Copy direct (pas de transcodage), coupe au bout de maxSeconds
    const args = [
      "-y",
      "-loglevel",
      "error",
      "-i",
      m3u8,
      "-c",
      "copy",
      "-t",
      String(maxSeconds || 3600),
      outFile,
    ];
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) resolve({ code, stderr });
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}

async function uploadToStorage(localFile, remotePath) {
  const fileBuffer = await fs.promises.readFile(localFile);
  const contentType = mime.lookup(remotePath) || "application/octet-stream";
  const { data, error } = await supa.storage
    .from(BUCKET)
    .upload(remotePath, fileBuffer, {
      contentType,
      upsert: true,
    });
  if (error) throw new Error("storage upload failed: " + error.message);
  return data;
}

async function finalizeJob(job, ok, filePath, bytes, errMsg) {
  const patch = ok
    ? {
        status: "completed",
        file_path: filePath,
        bytes,
        ended_at: new Date().toISOString(),
      }
    : { status: "error", ended_at: new Date().toISOString() };

  if (!ok && errMsg) patch.error = errMsg; // si tu as une colonne error (optionnel)

  const { error } = await supa
    .from("live_recordings")
    .update(patch)
    .eq("id", job.id);

  if (error) console.error("finalize failed:", error.message);
}

async function loop() {
  console.log(`[${WORKER_ID}] recorder started`);
  for (;;) {
    try {
      const job = await leaseJob();
      if (!job) {
        await wait(LOOP_DELAY_IDLE_MS);
        continue;
      }
      console.log(`[${WORKER_ID}] recording job ${job.id}`);

      // prépare nom de fichier
      const ext = ".mp4"; // on sort en mp4 (copy)
      const remotePath = `${job.user_id}/${job.id}${ext}`;
      const localPath = path.join(TMP_DIR, `${job.id}${ext}`);

      try {
        await runFfmpegCapture(job.m3u8, job.max_seconds || 3600, localPath);
        const stat = await fs.promises.stat(localPath).catch(() => null);
        const bytes = stat ? stat.size : null;

        await uploadToStorage(localPath, remotePath);
        await finalizeJob(job, true, remotePath, bytes, null);
        console.log(
          `[${WORKER_ID}] completed ${job.id} -> ${remotePath} (${bytes} bytes)`
        );
      } catch (e) {
        console.error(`[${WORKER_ID}] error job ${job.id}:`, e?.message || e);
        await finalizeJob(job, false, null, null, String(e?.message || e));
      } finally {
        // cleanup
        fs.promises.unlink(localPath).catch(() => {});
      }
    } catch (e) {
      console.error("loop error", e?.message || e);
      await wait(POLL_INTERVAL_MS);
    }
  }
}

function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

loop().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});
