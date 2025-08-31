import { createClient } from "@supabase/supabase-js";
import { execa } from "execa";
import os from "os";
import fs from "fs/promises";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "recordings";
const DEFAULT_MAX = parseInt(
  process.env.RECORD_MAX_SECONDS_DEFAULT || "3600",
  10
);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

function buildFilePath(job, ext) {
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  return `${job.link_id}/${date}-${job.id}${ext}`;
}

async function takeOneJob() {
  const { data: jobs } = await supa
    .from("live_recordings")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!jobs || !jobs.length) return;

  const job = jobs[0];

  await supa
    .from("live_recordings")
    .update({ status: "recording", started_at: new Date().toISOString() })
    .eq("id", job.id);

  const maxSec = job.max_seconds || DEFAULT_MAX;

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rec-"));
  const outMp4 = path.join(tmp, `${job.id}.mp4`);

  try {
    const args = [
      "-y",
      "-i",
      job.m3u8,
      "-t",
      String(maxSec),
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "+faststart",
      outMp4,
    ];
    console.log("[rec]", job.id, "ffmpeg", args.join(" "));
    await execa(FFMPEG, args, { stdio: "inherit" });

    const stat = await fs.stat(outMp4);
    const file = await fs.readFile(outMp4);
    const filePath = buildFilePath(job, ".mp4");

    const { error: upErr } = await supa.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: "video/mp4", upsert: true });
    if (upErr) throw upErr;

    await supa
      .from("live_recordings")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        bytes: stat.size,
        file_path: filePath,
      })
      .eq("id", job.id);

    console.log("[rec]", job.id, "completed", filePath);
  } catch (e) {
    console.error("[rec]", job.id, "error", e?.message || e);
    await supa
      .from("live_recordings")
      .update({
        status: "error",
        ended_at: new Date().toISOString(),
        error: e?.message || String(e),
      })
      .eq("id", job.id);
  } finally {
    try {
      await fs.unlink(outMp4);
    } catch {}
    try {
      await fs.rmdir(tmp);
    } catch {}
  }
}

async function loop() {
  while (true) {
    try {
      await takeOneJob();
    } catch (e) {
      console.error("[loop]", e);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

loop();
