const express = require("express");
const basicAuth = require("express-basic-auth");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// 1) Publicly serve HLS streams (no auth)
app.use("/streams", express.static(path.join(__dirname, "streams")));

// 2) Protect only dashboard & API with auth
app.use([
  "/",
  "/api",
  "/api/*"
], basicAuth({
  users: { "admin": "@!JKF3eWd12" },
  challenge: true
}));

// Upload middleware
const upload = multer({ dest: "uploads/" });

// Store running ffmpeg processes
const runningStreams = {};

// Serve dashboard page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

// List running streams
app.get("/api/streams", (req, res) => {
  res.json(Object.keys(runningStreams));
});

// Upload & create stream
app.post("/api/upload", upload.single("audio"), (req, res) => {
  const nameRaw = req.body.name || "";
  const name = nameRaw.trim().replace(/[^a-z0-9\\-]/gi, "_");
  const file = req.file;
  if (!file) return res.status(400).send("No audio uploaded");

  // Create output folder
  const outDir = path.join(__dirname, "streams", name);
  fs.mkdirSync(outDir, { recursive: true });

  // Move uploaded file into stream folder
  const filePath = path.join(outDir, file.originalname);
  fs.renameSync(file.path, filePath);

  // Start stream
  startStream(name, filePath);

  res.json({
    message: "Stream started",
    streamUrl: `http://localhost:8300/streams/${name}/stream.m3u8`
  });
});

// Start stream
app.post("/api/streams/:name/start", (req, res) => {
  const name = req.params.name;
  const folder = path.join(__dirname, "streams", name);
  if (!fs.existsSync(folder)) return res.status(404).send("Not found");

  const files = fs.readdirSync(folder).filter(f => f.endsWith(".mp3"));
  if (!files.length) return res.status(404).send("No MP3 file found");

  startStream(name, path.join(folder, files[0]));
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

// Start ffmpeg HLS loop in background
function startStream(name, filePath) {
  if (runningStreams[name]) return;

  const d = path.dirname(filePath);

  const ffmpeg = spawn("ffmpeg", [
    "-re",
    "-stream_loop", "-1",
    "-i", filePath,
    "-c:a", "copy",
    "-hls_time", "4",
    "-hls_list_size", "5",
    "-hls_flags", "delete_segments",
    "-hls_segment_filename", `${d}/seg_%03d.ts`,
    `${d}/stream.m3u8`
  ], { detached: true, stdio: "ignore" });

  ffmpeg.unref();
  runningStreams[name] = ffmpeg;
}

function stopStream(name) {
  const entry = runningStreams[name];
  if (entry) {
    entry.kill();
    delete runningStreams[name];
  }
}

// Start server
app.listen(8300, () => {
  console.log("Server running on http://0.0.0.0:8300");
});