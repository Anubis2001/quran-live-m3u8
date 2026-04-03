require('dotenv').config(); // Load environment variables from .env file

const express = require("express");
const basicAuth = require("express-basic-auth");
const multer = require("multer");
const { spawn, exec, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { createApp } = require("./app");
const { restoreStreams, setupGracefulShutdown } = require("./services/streamService");
const telegramBot = require("./services/telegramBot");

// Initialize the application
const app = createApp();

// Setup graceful shutdown handlers BEFORE restoring streams
setupGracefulShutdown();

// Start Telegram Bot
if (process.env.TELEGRAM_BOT_TOKEN) {
  telegramBot.start();
} else {
  console.log('ℹ️  Telegram bot not started: TELEGRAM_BOT_TOKEN not set in .env');
}

// Start server
const PORT = process.env.PORT || 8300;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Accessible locally at: http://localhost:${PORT}`);
  console.log(`Accessible from network at: http://[your-ip]:${PORT}`);
});

module.exports = app;
