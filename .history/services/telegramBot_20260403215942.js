const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { startStream, loadStreamsMetadata, saveStreamsMetadata } = require('./streamService');

class TelegramBot {
  constructor() {
    this.bot = null;
    this.isRunning = false;
    
    // Load admin IDs from environment or config
    this.adminIds = this.loadAdminIds();
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!this.token) {
      console.log('⚠️  TELEGRAM_BOT_TOKEN not set in .env - Telegram bot will not start');
      return;
    }
    
    if (this.adminIds.length === 0) {
      console.log('⚠️  No admin IDs configured in TELEGRAM_ADMIN_IDS - Telegram bot will not accept commands');
      return;
    }
    
    console.log(`✓ Telegram bot configured for ${this.adminIds.length} admin(s)`);
  }
  
  /**
   * Load admin IDs from environment variable
   */
  loadAdminIds() {
    const adminIdsStr = process.env.TELEGRAM_ADMIN_IDS;
    if (!adminIdsStr) return [];
    
    return adminIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  }
  
  /**
   * Check if user is an admin
   */
  isAdmin(userId) {
    return this.adminIds.includes(userId);
  }
  
  /**
   * Initialize and start the bot
   */
  start() {
    if (!this.token) {
      console.log('⚠️  Cannot start Telegram bot: No token configured');
      return;
    }
    
    if (this.isRunning) {
      console.log('Telegram bot is already running');
      return;
    }
    
    try {
      console.log('\n🤖 Starting Telegram Bot...');
      
      this.bot = new Telegraf(this.token);
      
      // Setup middleware for logging
      this.bot.use((ctx, next) => {
        const userId = ctx.from?.id || 'unknown';
        const username = ctx.from?.username || 'N/A';
        console.log(`[Telegram] Message from @${username} (ID: ${userId}): ${ctx.message?.text || ctx.message?.caption || 'media'}`);
        return next();
      });
      
      // Register command handlers
      this.registerCommands();
      
      // Register message handlers for audio/video files
      this.registerFileHandlers();
      
      // Error handling
      this.bot.catch((err, ctx) => {
        console.error('[Telegram Bot Error]', err);
        if (ctx.chat) {
          ctx.reply('❌ An error occurred while processing your request.');
        }
      });
      
      // Launch the bot with polling (works on all platforms including Windows)
      console.log('🔄 Connecting to Telegram servers...');
      
      // Set a timeout for the launch
      const launchTimeout = setTimeout(() => {
        if (!this.isRunning) {
          console.error('⚠️  Telegram bot connection timeout after 30 seconds');
          console.error('   Possible causes:');
          console.error('   1. Network/firewall blocking Telegram API');
          console.error('   2. Invalid bot token');
          console.error('   3. Telegram servers unreachable');
          console.error('   The bot will continue trying to connect in the background...');
        }
      }, 30000);
      
      this.bot.launch({ dropPendingUpdates: true }).then(() => {
        clearTimeout(launchTimeout);
        this.isRunning = true;
        console.log('✅ Telegram Bot started successfully!');
        console.log(`   Bot username: @${this.bot.botInfo?.username || 'loading...'}`);
        console.log(`   Admins: ${this.adminIds.join(', ')}`);
      }).catch(err => {
        clearTimeout(launchTimeout);
        console.error('❌ Failed to start Telegram bot:', err.message);
        console.error('   Stack:', err.stack);
        this.isRunning = false;
      });
      
    } catch (err) {
      console.error('❌ Error initializing Telegram bot:', err.message);
      this.isRunning = false;
    }
  }
  
  /**
   * Stop the bot
   */
  stop() {
    if (this.bot && this.isRunning) {
      console.log('\n🛑 Stopping Telegram Bot...');
      this.bot.stop('Bot shutdown');
      this.isRunning = false;
      console.log('✓ Telegram Bot stopped');
    }
  }
  
  /**
   * Register bot commands
   */
  registerCommands() {
    // /start command
    this.bot.start((ctx) => {
      const userId = ctx.from.id;
      
      if (!this.isAdmin(userId)) {
        return ctx.reply('🔒 Access denied. This bot is for authorized administrators only.');
      }
      
      const welcomeMessage = 
        `🎵 *Audio Stream Manager*\n\n` +
        `Welcome, Admin!\n\n` +
        `*Available Commands:*\n` +
        `• Send an *audio file* to create a stream\n` +
        `• Send a *video file* to extract audio and create a stream\n` +
        `• /status - View all active streams\n` +
        `• /help - Show this help message\n\n` +
        `Simply upload an audio or video file to get started!`;
      
      ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
    });
    
    // /help command
    this.bot.help((ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('🔒 Access denied.');
      }
      
      const helpMessage = 
        `📖 *How to Use:*\n\n` +
        `1️⃣ Send an audio or video file\n` +
        `2️⃣ The bot will ask for a stream name\n` +
        `3️⃣ Your file will be processed and streamed\n\n` +
        `*Supported Formats:*\n` +
        `• Audio: MP3, M4A, WAV, FLAC, OGG, etc.\n` +
        `• Video: MP4, AVI, MKV, MOV, etc. (audio extracted)\n\n` +
        `*Commands:*\n` +
        `/status - List all streams\n` +
        `/help - Show this help`;
      
      ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    });
    
    // /status command
    this.bot.command('status', (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('🔒 Access denied.');
      }
      
      try {
        const streams = loadStreamsMetadata();
        
        if (streams.length === 0) {
          return ctx.reply('📭 No streams currently active.');
        }
        
        let statusMessage = `📊 *Active Streams (${streams.length})*\n\n`;
        
        streams.forEach((stream, index) => {
          statusMessage += `${index + 1}. *${stream.name}*\n`;
          statusMessage += `   Created: ${new Date(stream.createdAt).toLocaleDateString()}\n\n`;
        });
        
        ctx.reply(statusMessage, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Error getting stream status:', err);
        ctx.reply('❌ Failed to retrieve stream status.');
      }
    });
  }
  
  /**
   * Register handlers for audio and video files
   */
  registerFileHandlers() {
    // Handle audio files
    this.bot.on('audio', async (ctx) => {
      const userId = ctx.from.id;
      
      if (!this.isAdmin(userId)) {
        return ctx.reply('🔒 Access denied. Only administrators can upload files.');
      }
      
      await this.processUpload(ctx, 'audio');
    });
    
    // Handle video files
    this.bot.on('video', async (ctx) => {
      const userId = ctx.from.id;
      
      if (!this.isAdmin(userId)) {
        return ctx.reply('🔒 Access denied. Only administrators can upload files.');
      }
      
      await this.processUpload(ctx, 'video');
    });
    
    // Handle document files (some audio/video may be sent as documents)
    this.bot.on('document', async (ctx) => {
      const userId = ctx.from.id;
      
      if (!this.isAdmin(userId)) {
        return ctx.reply('🔒 Access denied.');
      }
      
      // Check if it's an audio or video file based on MIME type
      const mimeType = ctx.message.document.mime_type || '';
      
      if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
        const fileType = mimeType.startsWith('audio/') ? 'audio' : 'video';
        await this.processUpload(ctx, fileType);
      } else {
        ctx.reply('⚠️ Unsupported file type. Please send audio or video files only.');
      }
    });
  }
  
  /**
   * Process uploaded file
   */
  async processUpload(ctx, fileType) {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'Unknown';
    
    try {
      // Get file info
      const fileObj = fileType === 'audio' 
        ? ctx.message.audio 
        : fileType === 'video'
        ? ctx.message.video
        : ctx.message.document;
      
      if (!fileObj) {
        return ctx.reply('❌ No file detected in message.');
      }
      
      const fileId = fileObj.file_id;
      const fileName = fileObj.file_name || fileObj.title || `upload_${Date.now()}`;
      const fileSize = fileObj.file_size || 0;
      
      // Convert bytes to MB for display
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      
      console.log(`[Telegram] Processing ${fileType} upload: ${fileName} (${fileSizeMB} MB) from @${username}`);
      
      // Send initial confirmation
      ctx.reply(`📥 Received ${fileType} file:
📄 Name: ${fileName}
📦 Size: ${fileSizeMB} MB

⏳ Processing...`);
      
      // Download the file
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const tempDir = path.join(__dirname, '..', 'uploads', 'telegram_temp');
      
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFilePath = path.join(tempDir, fileName);
      
      // Download file using curl (more reliable than node-fetch for large files)
      await this.downloadFile(fileLink.href, tempFilePath);
      
      if (!fs.existsSync(tempFilePath)) {
        throw new Error('Failed to download file');
      }
      
      console.log(`[Telegram] File downloaded to: ${tempFilePath}`);
      
      // If it's a video, extract audio
      let finalAudioPath = tempFilePath;
      
      if (fileType === 'video') {
        ctx.reply('🎬 Extracting audio from video...');
        
        const audioPath = tempFilePath.replace(/\.[^.]+$/, '.mp3');
        const success = await this.extractAudio(tempFilePath, audioPath);
        
        if (!success) {
          fs.unlinkSync(tempFilePath);
          throw new Error('Failed to extract audio from video');
        }
        
        finalAudioPath = audioPath;
        fs.unlinkSync(tempFilePath); // Remove original video
        
        console.log(`[Telegram] Audio extracted: ${finalAudioPath}`);
      }
      
      // Ask user for stream name
      ctx.reply(`✅ File processed successfully!\n\nPlease enter a *stream name* (letters, numbers, hyphens, underscores only):`, {
        parse_mode: 'Markdown'
      });
      
      // Wait for user to provide stream name
      this.waitForStreamName(ctx, finalAudioPath, userId);
      
    } catch (err) {
      console.error('[Telegram] Upload processing error:', err);
      ctx.reply(`❌ Error processing file: ${err.message}`);
    }
  }
  
  /**
   * Wait for user to provide stream name
   */
  waitForStreamName(ctx, audioFilePath, expectedUserId) {
    const handler = async (ctx) => {
      const userId = ctx.from.id;
      
      // Only accept response from the same user
      if (userId !== expectedUserId) {
        return;
      }
      
      const streamName = ctx.message.text?.trim();
      
      if (!streamName) {
        ctx.reply('❌ Please provide a valid stream name.');
        return;
      }
      
      // Validate stream name
      if (!/^[a-zA-Z0-9_-]+$/.test(streamName)) {
        ctx.reply('❌ Invalid name. Use only letters, numbers, hyphens, and underscores.');
        return;
      }
      
      try {
        // Check if stream name already exists
        const streams = loadStreamsMetadata();
        if (streams.some(s => s.name === streamName)) {
          ctx.reply(`❌ Stream name "${streamName}" already exists. Please choose a different name.`);
          return;
        }
        
        // Create stream directory
        const streamDir = path.join(__dirname, '..', 'streams', streamName);
        fs.mkdirSync(streamDir, { recursive: true });
        
        // Move audio file to stream directory
        const ext = path.extname(audioFilePath);
        const finalPath = path.join(streamDir, `audio${ext}`);
        fs.renameSync(audioFilePath, finalPath);
        
        console.log(`[Telegram] Creating stream: ${streamName} at ${finalPath}`);
        
        // Add to metadata
        const streamData = {
          name: streamName,
          filePath: finalPath,
          createdAt: new Date().toISOString(),
          source: 'telegram'
        };
        
        streams.push(streamData);
        saveStreamsMetadata(streams);
        
        // Start FFmpeg stream
        startStream(streamName, finalPath);
        
        // Wait a moment for stream to initialize
        setTimeout(() => {
          const baseUrl = process.env.TELEGRAM_STREAM_BASE_URL || 'http://localhost:8300';
          const streamUrl = `${baseUrl}/streams/${streamName}/stream.m3u8`;
          
          const successMessage = 
            `🎉 *Stream Created Successfully!*\n\n` +
            `*Name:* ${streamName}\n` +
            `*URL:* \`${streamUrl}\`\n\n` +
            `Your stream is now live and ready to use!`;
          
          ctx.reply(successMessage, { parse_mode: 'Markdown' });
        }, 2000);
        
      } catch (err) {
        console.error('[Telegram] Error creating stream:', err);
        ctx.reply(`❌ Failed to create stream: ${err.message}`);
      } finally {
        // Clean up temp file if still exists
        if (fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath);
        }
        
        // Remove this handler
        this.bot.off('text', handler);
      }
    };
    
    this.bot.on('text', handler);
  }
  
  /**
   * Download file from URL
   */
  downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      // Use curl for more reliable downloads with progress
      const curl = spawn('curl', [
        '-L',           // Follow redirects
        '-o', outputPath,
        '--silent',     // Silent mode
        '--show-error', // Show errors
        url
      ]);
      
      let errorOutput = '';
      
      curl.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      curl.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Download failed with code ${code}: ${errorOutput}`));
        }
      });
      
      curl.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Extract audio from video file
   */
  extractAudio(inputPath, outputPath) {
    return new Promise((resolve) => {
      console.log(`[Telegram] Extracting audio: ${inputPath} -> ${outputPath}`);
      
      const ffmpegCmd = `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -ab 192k "${outputPath}" -y`;
      
      exec(ffmpegCmd, (error, stdout, stderr) => {
        if (error) {
          console.error('[Telegram] FFmpeg audio extraction error:', error);
          console.error('stderr:', stderr);
          resolve(false);
        } else {
          console.log('[Telegram] Audio extraction successful');
          resolve(true);
        }
      });
    });
  }
}

// Export singleton instance
module.exports = new TelegramBot();
