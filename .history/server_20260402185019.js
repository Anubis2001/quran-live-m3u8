const express = require("express");
const basicAuth = require("express-basic-auth");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// make sure uploads folder exists
if (!fs.existsSync(path.join(__dirname, "uploads"))) {
  fs.mkdirSync(path.join(__dirname, "uploads"));
}

// PUBLIC: serve .m3u8 and .ts files without auth
app.use("/streams", express.static(path.join(__dirname, "streams")));

// ADMIN AUTH only for dashboard and API
app.use(
  ["/", "/api", "/api/{*rest}"],
  basicAuth({
    users: { admin: "@!JKF3eWd12" },
    challenge: true,
  })
);

const upload = multer({ dest: "uploads/" });
const runningStreams = {};

// restore streams after a restart
function restoreStreams() {
  const base = path.join(__dirname, "streams");
  if (!fs.existsSync(base)) return;
  fs.readdirSync(base).forEach(name => {
    const folder = path.join(base, name);
    if (!fs.lstatSync(folder).isDirectory()) return;
    const mp3 = fs.readdirSync(folder).find(f => f.endsWith(".mp3"));
    if (mp3) startStream(name, path.join(folder, mp3));
  });
}

// list streams with status
app.get("/api/streams", (req, res) => {
  const list = Object.keys(runningStreams).map(name => {
    const entry = runningStreams[name];
    const alive = entry.process.exitCode === null;
    return { name, status: alive ? "running" : entry.failed ? "failed" : "stopped" };
  });
  res.json(list);
});

// upload & start stream
app.post("/api/upload", upload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio received" });

  const raw = req.body.name || "";
  const name = raw.trim().replace(/[^a-z0-9\\-]/gi, "_");
  const streamDir = path.join(__dirname, "streams", name);
  fs.mkdirSync(streamDir, { recursive: true });

  const finalPath = path.join(streamDir, req.file.originalname);
  fs.renameSync(req.file.path, finalPath);

  startStream(name, finalPath);

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({ streamUrl: `${baseUrl}/streams/${name}/stream.m3u8` });
});

// start one
app.post("/api/streams/:name/start", (req, res) => {
  const folder = path.join(__dirname, "streams", req.params.name);
  const mp3 = fs.existsSync(folder)
    ? fs.readdirSync(folder).find(f => f.endsWith(".mp3"))
    : null;
  if (!mp3) return res.status(404).send("Not found or no mp3");
  startStream(req.params.name, path.join(folder, mp3));
  res.send("Started");
});

// stop one
app.post("/api/streams/:name/stop", (req, res) => {
  stopStream(req.params.name);
  res.send("Stopped");
});

// delete one
app.delete("/api/streams/:name", (req, res) => {
  const name = req.params.name;
  stopStream(name);
  const folder = path.join(__dirname, "streams", name);
  fs.rmSync(folder, { recursive: true, force: true });
  res.send("Deleted");
});

// FFmpeg HLS loop
function startStream(name, filePath) {
  if (runningStreams[name] && runningStreams[name].process.exitCode === null) return;

  const dir = path.dirname(filePath);
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-re",
      "-stream_loop", "-1",
      "-i", filePath,
      "-c:a", "copy",
      "-hls_time", "4",
      "-hls_list_size", "5",
      "-hls_flags", "delete_segments",
      "-hls_segment_filename",
      `${dir}/seg_%03d.ts`,
      `${dir}/stream.m3u8`,
    ],
    { detached: true, stdio: "ignore" }
  );

  ffmpeg.unref();
  runningStreams[name] = { process: ffmpeg, failed: false };
  ffmpeg.on("exit", code => {
    if (code !== 0) runningStreams[name].failed = true;
  });
}

function stopStream(name) {
  const ent = runningStreams[name];
  if (ent) {
    try { ent.process.kill(); } catch {}
    delete runningStreams[name];
  }
}

restoreStreams();
const PORT = process.env.PORT || 8300;
app.listen(PORT, () => console.log("Server running on port " + PORT));