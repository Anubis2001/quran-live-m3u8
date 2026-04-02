# Cookies.txt Authentication Guide for YouTube Streaming

## Overview
The YouTube streaming feature now supports authentication via cookies.txt files, enabling you to download:
- Age-restricted videos
- Private/unlisted videos (if you have access)
- Videos that require login to view
- Premium content with YouTube Premium subscription

## What is cookies.txt?
A cookies.txt file is a Netscape-format HTTP cookie file that contains your YouTube session data, including authentication tokens.

## How to Get Your YouTube Cookies

### Method 1: Using a Browser Extension (Recommended)

**For Chrome/Chromium:**
1. Install "Get cookies.txt" extension from Chrome Web Store
2. Go to youtube.com and log in to your account
3. Click the extension icon
4. Click "Export" to download cookies.txt
5. Save the file to a secure location on your server (e.g., `/root/cookies.txt`)

**For Firefox:**
1. Install "cookies.txt" add-on from Firefox Add-ons
2. Navigate to youtube.com and sign in
3. Click the extension button
4. Export cookies in Netscape format
5. Save to your server

### Method 2: Using yt-dlp (Command Line)

If you already have browser cookies or use yt-dlp:

```bash
# Extract cookies from browser and save to file
yt-dlp --extract-from-browser chrome --cookies /root/cookies.txt \
  "https://www.youtube.com/watch?v=SOME_VIDEO"
```

Or manually copy your browser's cookies database and convert it.

## Uploading cookies.txt to Server

```bash
# Using SCP (from your local machine)
scp /path/to/local/cookies.txt root@10.0.20.99:/root/cookies.txt

# Or using SFTP
sftp root@10.0.20.99
put /path/to/local/cookies.txt /root/cookies.txt
```

## File Permissions (Important!)

Secure your cookies file with proper permissions:

```bash
# Set restrictive permissions (readable only by owner)
chmod 600 /root/cookies.txt

# Verify permissions
ls -la /root/cookies.txt
# Should show: -rw------- 1 root root ...
```

## Using Cookies with YouTube Streaming

### Method 1: Web Interface

1. Open: `http://10.0.20.99:8300/youtube-streamer.html`
2. Enter Stream Name (e.g., `private-quran-stream`)
3. Enter YouTube URL
4. Enter Cookies Path: `/root/cookies.txt`
5. Click "Start Stream"

### Method 2: API Call

```bash
curl -X POST 'http://10.0.20.99:8300/api/streams/youtube/my-stream' \
  -H 'Authorization: Basic YWRtaW46QCFKS0YzZVdkMTI=' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "cookies": "/root/cookies.txt"
  }'
```

### Method 3: Node.js Script

```javascript
const { startYoutubeStream } = require('./youtube-stream-example');

await startYoutubeStream(
  'authenticated-stream',
  'https://www.youtube.com/watch?v=VIDEO_ID',
  '/root/cookies.txt'  // Optional cookies path
);
```

## Example Usage Scenarios

### Scenario 1: Public Video (No Cookies Needed)
```bash
curl -X POST 'http://10.0.20.99:8300/api/streams/youtube/public-video' \
  -H 'Authorization: Basic YWRtaW46QCFKS0YzZVdkMTI=' \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### Scenario 2: Age-Restricted Video (Requires Cookies)
```bash
curl -X POST 'http://10.0.20.99:8300/api/streams/youtube/restricted-video' \
  -H 'Authorization: Basic YWRtaW46QCFKS0YzZVdkMTI=' \
  -d '{
    "url": "https://www.youtube.com/watch?v=AGE_RESTRICTED_ID",
    "cookies": "/root/cookies.txt"
  }'
```

### Scenario 3: Private Video You Have Access To
```bash
curl -X POST 'http://10.0.20.99:8300/api/streams/youtube/private-video' \
  -H 'Authorization: Basic YWRtaW46QCFKS0YzZVdkMTI=' \
  -d '{
    "url": "https://www.youtube.com/watch?v=PRIVATE_VIDEO_ID",
    "cookies": "/root/cookies.txt"
  }'
```

## Troubleshooting

### Error: "Cookies file not found"
- Verify the file exists: `ls -la /root/cookies.txt`
- Check the path is absolute (starts with `/`)
- Ensure file permissions allow reading

### Error: "Invalid cookies format"
- The file must be in Netscape HTTP Cookie format
- First line should be: `# Netscape HTTP Cookie File` or start with `#`
- Re-export cookies using the methods above

### Error: "Authentication failed" or video still unavailable
- Your cookies may have expired
- Log out and log back into YouTube in your browser
- Export fresh cookies.txt
- Upload the new file to the server

### yt-dlp says "Sign in to confirm your age"
This means cookies aren't working. Try:
1. Clear browser cache and re-login to YouTube
2. Export cookies again
3. Make sure you're exporting from the correct browser profile
4. Verify cookies file contains YouTube authentication data:
   ```bash
   grep youtube.com /root/cookies.txt | head -20
   ```

## Security Best Practices

⚠️ **IMPORTANT**: Your cookies.txt file contains sensitive authentication data!

1. **Never share your cookies.txt publicly**
2. **Set restrictive permissions**: `chmod 600 /root/cookies.txt`
3. **Store in a secure location**: Use `/root/` or another protected directory
4. **Rotate regularly**: Re-export cookies every few weeks
5. **Monitor usage**: Check logs for unauthorized access attempts
6. **Use dedicated account**: Consider creating a separate YouTube account for streaming

## Validating Your Cookies File

Before using, verify your cookies.txt is valid:

```bash
# Check file format
head -5 /root/cookies.txt

# Should show something like:
# Netscape HTTP Cookie File
# This file was generated by a browser extension

# Count YouTube-related cookies
grep -c "youtube.com" /root/cookies.txt
# Should return a number > 0

# Test with yt-dlp (dry run)
yt-dlp --cookies /root/cookies.txt --simulate \
  "https://www.youtube.com/watch?v=SOME_VIDEO"
```

## Supported Downloaders

The system automatically detects and uses:
- **yt-dlp** (recommended, actively maintained)
- **youtube-dl** (legacy support)

Both support the `--cookies` flag for authentication.

## Additional Resources

- yt-dlp documentation: https://github.com/yt-dlp/yt-dlp
- Netscape cookie format: https://curl.haxx.se/docs/http-cookies.html
- Get cookies.txt extension: https://chrome.google.com/webstore/detail/get-cookiestxt

## Support

If you encounter issues with cookies authentication:
1. Check server logs: `tail -f /tmp/node-app.log`
2. Verify FFmpeg logs in stream directory
3. Test cookies locally first with yt-dlp
4. Ensure cookies.txt is properly formatted
