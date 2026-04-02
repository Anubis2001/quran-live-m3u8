const express = require("express");
const basicAuth = require("express-basic-auth");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// 1) Serve public HLS (no auth)
app.use("/streams", express.static(path.join(__dirname, "streams")));

// 2) Apply auth to dashboard & API (named wildcard for Express 5)
app.use(
  ["/", "/api", "/api/{*rest}"],
  basicAuth({
    users: { admin: "@!JKF3eWd12" },
    challenge: true,
  })
);

// File upload
const upload = multer({ dest: "uploads/" });

// Track running ffmpeg processes
const runningStreams = {};

// Serve the dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

// Return stream list with statuses
app.get("/api/streams", (req, res) => {
  const list = Object.keys(runningStreams).map((name) => {
    const entry = runningStreams[name];
    const isRunning = entry.process.exitCode === null;
    const status = isRunning ? "running" : entry.failed ? "failed" : "stopped";
    return { name, status };
  });
  res.json(list);
});

// Upload & start stream
app.post("/api/upload", upload.single("audio"), (req, res) => {
  const raw = req.body.name || "";
  const name = raw.trim().replace(/[^a-z0-9\\-]/gi, "_");
  const file = req.file;
  if (!file) return res.status(400).send("No audio uploaded");

  const outDir = path.join(__dirname, "streams", name);
  fs.mkdirSync(outDir, { recursive: true });

  const filePath = path.join(outDir, file.originalname);
  fs.renameSync(file.path, filePath);

  startStream(name, filePath);

  res.json({
    message: "Stream created",
    streamUrl: `http://localhost:8300/streams/${name}/stream.m3u8`,
  });
});

// Start stream
app.post("/api/streams/:name/start", (req, res) => {
  const name = req.params.name;
  const folder = path.join(__dirname, "streams", name);
  if (!fs.existsSync(folder)) return res.status(404).send("Not found");

  const mp3 = fs.readdirSync(folder).find((f) => f.endsWith(".mp3"));
  if (!mp3) return res.status(404).send("No MP3 file found");

  startStream(name, path.join(folder, mp3));
  res.send("Started");
});

// Stop stream
app.post("/api/streams/:name/stop", (req, res) => {
  stopStream(req.params.name);
  res.send("Stopped");
});

// Delete stream
app.delete("/api/streams/:name", (req, res) => {
  const name = req.params.name;
  stopStream(name);
  const folder = path.join(__dirname, "streams", name);
  fs.rmSync(folder, { recursive: true, force: true });
  res.send("Deleted");
});

// Launch FFmpeg HLS loop
function startStream(name, filePath) {
  if (runningStreams[name] && runningStreams[name].process.exitCode === null)
    return; // already running

  const outDir = path.dirname(filePath);
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-re",
      "-stream_loop",
      "-1",
      "-i",
      filePath,
      "-c:a",
      "copy",
      "-hls_time",
      "4",
      "-hls_list_size",
      "5",
      "-hls_flags",
      "delete_segments",
      `-hls_segment_filename`,
      `${outDir}/seg_%03d.ts`,
      `${outDir}/stream.m3u8`,
    ],
    { detached: true, stdio: "ignore" }
  );

  ffmpeg.unref();
  runningStreams[name] = { process: ffmpeg, failed: false };

  ffmpeg.on("exit", (code) => {
    if (code !== 0) runningStreams[name].failed = true;
  });
}

function stopStream(name) {
  const entry = runningStreams[name];
  if (entry) {
    try {
      entry.process.kill();
    } catch {}
    delete runningStreams[name];
  }
}

const PORT = process.env.PORT || 8300;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});