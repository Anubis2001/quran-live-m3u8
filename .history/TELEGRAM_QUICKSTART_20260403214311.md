# Telegram Bot - Quick Start Guide

## 🚀 3-Minute Setup

### Step 1: Create Your Bot (1 minute)
1. Open Telegram → Search `@BotFather`
2. Send `/newbot`
3. Choose a name and username
4. **Copy the token** you receive

### Step 2: Get Your User ID (30 seconds)
1. Search `@userinfobot` in Telegram
2. Send any message
3. **Copy your user ID** (the number)

### Step 3: Configure (30 seconds)
Edit `.env` file:
```env
TELEGRAM_BOT_TOKEN=paste_your_token_here
TELEGRAM_ADMIN_IDS=paste_your_user_id_here
```

### Step 4: Install & Run (1 minute)
```bash
npm install
npm start
```

### Step 5: Test It!
1. Open your bot in Telegram
2. Send `/start`
3. Upload an audio file
4. Enter a stream name
5. Done! 🎉

---

## 📱 How to Use

### Upload Audio
1. Click 📎 attachment in Telegram
2. Select audio file
3. Enter stream name when prompted
4. Stream is live!

### Check Status
Send `/status` to see all active streams

### Get Help
Send `/help` for full instructions

---

## 🔒 Security
- ✅ Only admins can upload
- ✅ Files validated before processing
- ✅ Stream names sanitized
- ✅ No public access

---

## 🎯 Supported Formats

**Audio:** MP3, M4A, WAV, FLAC, OGG, AAC, WMA  
**Video:** MP4, AVI, MKV, MOV, WMV (audio extracted automatically)

---

## 💡 Pro Tips
- Use descriptive stream names (e.g., `quran_surah_baqarah`)
- Large files may take time to process
- Video files are converted to audio automatically
- Multiple admins can be added (comma-separated IDs)

---

## ❓ Troubleshooting

**Bot doesn't respond?**
- Check token is correct in `.env`
- Verify your user ID
- Make sure server is running

**"Access denied"?**
- Add your user ID to `TELEGRAM_ADMIN_IDS`

**Stream URL doesn't work?**
- Update `TELEGRAM_STREAM_BASE_URL` in `.env`

---

For complete documentation, see `TELEGRAM_BOT_SETUP.md`
