const express = require("express");
const basicAuth = require("express-basic-auth");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ADMIN AUTH
app.use(basicAuth({
  users: { "admin": "@!JKF3eWd12" },
  challenge: true
}));

// FILE UPLOAD
const upload = multer({ dest: "uploads/" });

// STORE RUNNING STREAM PROCESSES
const runningStreams = {}; // { name: { process: childProc } }

// SERVE HLS STREAMS
app.use("/streams", express.static(path.join(__dirname, "streams")));

// DASHBOARD PAGE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

// GET RUNNING STREAMS LIST
app.get("/api/streams", (req, res) => {
  res.json(Object.keys(runningStreams));
});

// UPLOAD & CREATE STREAM
app.post("/api/upload", upload.single("audio"), (req, res) => {
  const name = req.body.name.trim().replace(/[^a-z0-9\-]/gi, "_");
  const file = req.file;
  if (!file) return res.status(400).send("No audio uploaded");

  const outDir = path.join(__dirname, "streams", name);
  fs.mkdirSync(outDir, { recursive: true });

  const filePath = path.join(outDir, file.originalname);
  fs.renameSync(file.path, filePath);

  // START STREAM
  startStream(name, filePath);

  res.json({
    message: "Stream started",
    playlist: `/streams/${name}/stream.m3u8`
  });
});

// START STREAM ROUTE
app.post("/api/streams/:name/start", (req, res) => {
  const name = req.params.name;
  const folder = path.join(__dirname, "streams", name);
  const files = fs.readdirSync(folder).filter(f => f.endsWith(".mp3"));
  if (!files.length) return res.status(404).send("No audio file found");

  startStream(name, path.join(folder, files[0]));
  res.send("Started");
});

// STOP STREAM
app.post("/api/streams/:name/stop", (req, res) => {
  const name = req.params.name;
  stopStream(name);
  res.send("Stopped");
});

// DELETE STREAM (stop + remove files)
app.delete("/api/streams/:name", (req, res) => {
  const name = req.params.name;
  stopStream(name);

  const folder = path.join(__dirname, "streams", name);
  fs.rmSync(folder, { recursive: true, force: true });

  res.send("Deleted");
});

function startStream(name, filePath) {
  if (runningStreams[name]) return; // already running

  const outDir = path.join(__dirname, "streams", name);

  const args = [
    "-re",
    "-stream_loop", "-1",
    "-i", filePath,
    "-c:a", "copy",
    "-hls_time", "4",
    "-hls_list_size", "5",
    "-hls_flags", "delete_segments",
    "-hls_segment_filename", `${outDir}/seg_%03d.ts`,
    `${outDir}/stream.m3u8`
  ];

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: "ignore",
    detached: true
  });

  ffmpeg.unref(); // let it run independently
  runningStreams[name] = { process: ffmpeg };
}

function stopStream(name) {
  const entry = runningStreams[name];
  if (entry) {
    entry.process.kill(); 
    delete runningStreams[name];
  }
}

// START SERVER
app.listen(8300, () => console.log("Running on http://localhost:8300"));