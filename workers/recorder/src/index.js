import "cross-fetch/polyfill.js";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mime from "mime-types";

/* ========= ENV ========= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET = process.env.REC_BUCKET || "live-recordings";
const TMP_DIR = process.env.TMP_DIR || "/tmp";
const WORKER_ID =
  process.env.WORKER_ID || `wrk-${crypto.randomBytes(4).toString("hex")}`;

const LOOP_DELAY_IDLE_MS = Number(process.env.LOOP_DELAY_IDLE_MS || 4000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 2000);
const GRACEFUL_STOP_MS = Number(process.env.GRACEFUL_STOP_MS || 8000);
const DEFAULT_MAX_SECONDS = Number(process.env.DEFAULT_MAX_SECONDS || 3600);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ==== util: bucket ==== */
async function ensureBucketExists() {
  try {
    const { data, error } = await supa.storage.getBucket(BUCKET);
    if (error || !data) {
      // tente création
      const { error: createErr } = await supa.storage.createBucket(BUCKET, {
        public: false,
      });
      if (createErr) {
        console.warn(
          `[worker] createBucket failed (${BUCKET}): ${createErr.message}`
        );
      } else {
        console.log(`[worker] bucket created: ${BUCKET}`);
      }
    }
  } catch (e) {
    console.warn("[worker] ensureBucketExists error:", e?.message || e);
  }
}

/* ========= DB helpers ========= */
async function leaseJob() {
  const { data: jobs, error } = await supa
    .from("live_recordings")
    .select(
      "id,user_id,link_id,m3u8,max_seconds,status,claimed_by,claimed_at,started_at,pid"
    )
    .eq("status", "queued")
    .is("claimed_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error("select queued failed: " + error.message);
  if (!jobs || !jobs.length) return null;

  const job = jobs[0];

  const { data: upd, error: updErr } = await supa
    .from("live_recordings")
    .update({
      claimed_by: WORKER_ID,
      claimed_at: new Date().toISOString(),
      status: "recording",
      started_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", job.id)
    .is("claimed_at", null)
    .select()
    .maybeSingle();

  if (updErr) throw new Error("claim failed: " + updErr.message);
  if (!upd) return null;
  return upd;
}

async function setJobPid(id, pid) {
  await supa.from("live_recordings").update({ pid }).eq("id", id);
}

async function updateJob(id, patch) {
  const { error } = await supa
    .from("live_recordings")
    .update(patch)
    .eq("id", id);
  if (error) console.error("[updateJob] failed:", error.message);
}

async function uploadToStorage(localFile, remotePath) {
  const fileBuffer = await fs.promises.readFile(localFile);
  const contentType = mime.lookup(remotePath) || "application/octet-stream";
  const { data, error } = await supa.storage
    .from(BUCKET)
    .upload(remotePath, fileBuffer, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });
  if (error) throw new Error("storage upload failed: " + error.message);
  return data;
}

/* ========= FFMPEG ========= */
function runFfmpegCapture(m3u8, maxSeconds, outFile, onSpawn) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-loglevel",
      "error",
      "-rw_timeout",
      "15000000", // 15s read timeout
      "-i",
      m3u8,
      "-c",
      "copy",
      "-t",
      String(maxSeconds > 0 ? maxSeconds : DEFAULT_MAX_SECONDS),
      outFile,
    ];

    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (typeof onSpawn === "function") onSpawn(child.pid);

    let stderr = "";
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(`[ffmpeg] ${s}`);
    });
    child.stdout.on("data", (d) => {
      process.stdout.write(`[ffmpeg] ${d.toString()}`);
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

/* ========= Record one ========= */
async function recordOne(job) {
  console.log(`[${WORKER_ID}] start recording job ${job.id}`);

  const ext = ".mp4";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const remotePath = `${job.user_id}/${job.id}/${ts}.mp4`;
  const localPath = path.join(TMP_DIR, `${job.id}-${ts}${ext}`);

  let ffmpegClosed = false;
  let exitCode = -1;
  let stopping = false;

  const ffmpegPromise = runFfmpegCapture(
    job.m3u8,
    Number(job.max_seconds || DEFAULT_MAX_SECONDS),
    localPath,
    async (pid) => {
      await setJobPid(job.id, pid);
    }
  );

  // poll: watcher status=stopping → SIGINT
  const poll = setInterval(async () => {
    try {
      const { data: row } = await supa
        .from("live_recordings")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (!row) return;
      if (row.status === "stopping" && !stopping) {
        stopping = true;
        console.log(`[${WORKER_ID}] stopping requested for job ${job.id}`);
        try {
          const { data: got } = await supa
            .from("live_recordings")
            .select("pid")
            .eq("id", job.id)
            .maybeSingle();
          const pid = got?.pid;
          if (pid) {
            process.kill(pid, "SIGINT");
            setTimeout(() => {
              // on laisse ffmpeg flush; pas de SIGKILL pour préserver le mp4
            }, GRACEFUL_STOP_MS);
          }
        } catch (e) {
          console.warn(`[${WORKER_ID}] kill(SIGINT) failed:`, e?.message || e);
        }
      }
    } catch (e) {
      console.warn("poll error", e);
    }
  }, POLL_INTERVAL_MS);

  try {
    const res = await ffmpegPromise;
    ffmpegClosed = true;
    exitCode = res.code;
  } catch (e) {
    ffmpegClosed = true;
    console.error(`[${WORKER_ID}] ffmpeg promise error:`, e?.message || e);
  } finally {
    clearInterval(poll);
  }

  // upload si fichier > 0
  try {
    const stat = await fs.promises.stat(localPath).catch(() => null);
    const bytes = stat ? stat.size : 0;

    if (bytes > 0) {
      await uploadToStorage(localPath, remotePath);
      await updateJob(job.id, {
        status: "completed",
        file_path: remotePath,
        bytes,
        ended_at: new Date().toISOString(),
      });
      console.log(
        `[${WORKER_ID}] uploaded ${job.id} -> ${remotePath} (${bytes} bytes)`
      );
    } else {
      await updateJob(job.id, {
        status: stopping ? "cancelled" : "error",
        error: stopping ? "Cancelled: no data written" : "No data written",
        ended_at: new Date().toISOString(),
      });
      console.warn(
        `[${WORKER_ID}] ${job.id} empty file → ${
          stopping ? "cancelled" : "error"
        }`
      );
    }
  } finally {
    fs.promises.unlink(localPath).catch(() => {});
    await setJobPid(job.id, null);
  }
}

/* ========= Loop ========= */
function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function loop() {
  console.log(`[${WORKER_ID}] recorder started`);
  await ensureBucketExists();
  for (;;) {
    try {
      const job = await leaseJob();
      if (!job) {
        await wait(LOOP_DELAY_IDLE_MS);
        continue;
      }
      await recordOne(job);
    } catch (e) {
      console.error("loop error:", e?.message || e);
      await wait(POLL_INTERVAL_MS);
    }
  }
}

loop().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});
