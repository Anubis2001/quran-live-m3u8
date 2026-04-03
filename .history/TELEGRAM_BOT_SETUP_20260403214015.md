# Telegram Bot Setup Guide

## Overview
The Telegram bot allows administrators to upload audio files directly through Telegram chat and automatically convert them into HLS streams.

## Prerequisites
- A Telegram account
- Access to Telegram BotFather (@BotFather)

## Step-by-Step Setup

### 1. Create Your Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts:
   - Choose a name for your bot (e.g., "Audio Stream Manager")
   - Choose a username for your bot (must end in 'bot', e.g., "my_audio_stream_bot")
4. **Save the API token** that BotFather gives you

### 2. Get Your Telegram User ID

You need your Telegram user ID to authorize yourself as an admin:

1. Search for `@userinfobot` in Telegram
2. Send any message to the bot
3. It will reply with your user ID (a number like `123456789`)
4. **Save this number**

Alternatively, use `@getidsbot` or visit https://telegram.me/userinfobot

### 3. Configure Environment Variables

Open the `.env` file in your project root and update:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_IDS=123456789,987654321
TELEGRAM_STREAM_BASE_URL=http://your-server-ip:8300
```

Replace:
- `TELEGRAM_BOT_TOKEN`: The token you got from BotFather
- `TELEGRAM_ADMIN_IDS`: Your user ID(s), comma-separated for multiple admins
- `TELEGRAM_STREAM_BASE_URL`: Your server's public URL (or localhost for testing)

### 4. Install Dependencies

Run the following command to install the Telegram bot library:

```bash
npm install telegraf@4.15.3
```

### 5. Start the Server

```bash
npm start
```

You should see:
```
✓ Telegram bot configured for 1 admin(s)
🤖 Starting Telegram Bot...
✅ Telegram Bot started successfully!
   Bot username: @your_bot_name
   Admins: 123456789
```

## Using the Bot

### Basic Commands

1. **Start the bot**: Send `/start` to your bot
2. **View help**: Send `/help`
3. **Check stream status**: Send `/status`

### Uploading Audio Files

1. Open a chat with your bot
2. Click the attachment icon 📎
3. Select an audio file (MP3, M4A, WAV, FLAC, OGG, etc.)
4. The bot will confirm receipt
5. Enter a stream name when prompted (letters, numbers, hyphens, underscores only)
6. Wait for confirmation - your stream is live!

### Uploading Video Files

1. Send a video file to the bot
2. The bot will automatically extract the audio track
3. Enter a stream name when prompted
4. The video's audio is now streaming!

### Example Conversation

```
You: [Sends audio file]
Bot: 📥 Received audio file:
     📄 Name: quran_recitation.mp3
     📦 Size: 45.23 MB
     
     ⏳ Processing...

Bot: ✅ File processed successfully!
     
     Please enter a stream name (letters, numbers, hyphens, underscores only):

You: quran_surah_rahman

Bot: 🎉 Stream Created Successfully!
     
     Name: quran_surah_rahman
     URL: http://your-server-ip:8300/streams/quran_surah_rahman/stream.m3u8
     
     Your stream is now live and ready to use!
```

## Security Features

- ✅ **Admin-only access**: Only authorized user IDs can use the bot
- ✅ **File validation**: Only audio and video files are accepted
- ✅ **Name sanitization**: Stream names are validated to prevent path traversal
- ✅ **Duplicate prevention**: Cannot create streams with existing names

## Troubleshooting

### Bot doesn't respond to messages

1. Check if the bot token is correct in `.env`
2. Verify your user ID in `TELEGRAM_ADMIN_IDS`
3. Make sure you sent `/start` to the bot first
4. Check server logs for errors

### "Access denied" error

- Ensure your Telegram user ID is in `TELEGRAM_ADMIN_IDS`
- User IDs must be separated by commas with no spaces

### Large file uploads fail

- Telegram has a file size limit (typically 20MB for bots, 2GB with local bot API)
- For larger files, consider using the web interface instead

### Stream URL doesn't work

- Verify `TELEGRAM_STREAM_BASE_URL` is set correctly
- If behind a reverse proxy, ensure it's configured properly
- Use your server's public IP or domain, not localhost (unless testing locally)

## Advanced Configuration

### Running Behind a Reverse Proxy

If your server is behind Nginx/Apache, update the base URL:

```env
TELEGRAM_STREAM_BASE_URL=https://your-domain.com
```

### Multiple Administrators

Add multiple user IDs separated by commas:

```env
TELEGRAM_ADMIN_IDS=123456789,987654321,111222333
```

### Custom Download Location

Files are temporarily stored in `uploads/telegram_temp/` before processing. This directory is created automatically.

## Bot Commands Summary

| Command | Description |
|---------|-------------|
| `/start` | Start the bot and see welcome message |
| `/help` | Show help and usage instructions |
| `/status` | List all active streams |
| Send audio/video | Upload a file to create a stream |

## File Format Support

### Audio Formats
- MP3, M4A, WAV, FLAC, OGG, AAC, WMA, and more

### Video Formats (audio extracted)
- MP4, AVI, MKV, MOV, WMV, FLV, WebM, and more

## Monitoring

Check the server console logs for Telegram bot activity:

```
[Telegram] Message from @username (ID: 123456789): /start
[Telegram] Processing audio upload: file.mp3 (45.23 MB) from @username
[Telegram] File downloaded to: uploads/telegram_temp/file.mp3
[Telegram] Creating stream: my_stream at streams/my_stream/audio.mp3
```

## Stopping the Bot

The bot stops automatically when you stop the server:

```bash
npm stop
# or
Ctrl+C
```

You'll see:
```
🛑 Stopping Telegram Bot...
✓ Telegram Bot stopped
```

## Need Help?

If you encounter issues:
1. Check the server console for error messages
2. Verify all environment variables are set correctly
3. Ensure your bot token is valid
4. Test with small files first
