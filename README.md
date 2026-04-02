# Project Structure

This project has been refactored into a modular architecture for better maintainability and separation of concerns.

## Directory Structure

```
quran-live-m3u8/
├── server.js                 # Application entry point
├── app.js                    # Express app configuration and route registration
├── package.json              # Dependencies and scripts
│
├── middleware/               # Express middleware components
│   ├── auth.js              # Authentication middleware (basicAuth)
│   └── staticServing.js     # Static file serving for streams and public content
│
├── routes/                   # API route handlers
│   ├── streams.js           # Stream management routes (/api/streams)
│   ├── upload.js            # File upload routes (/api/upload)
│   └── diagnostics.js       # Debug endpoints (/__debug)
│
├── services/                 # Business logic and core functionality
│   └── streamService.js     # FFmpeg HLS streaming, process management
│
├── public/                   # Static assets served to clients
│   ├── dashboard.html       # Admin dashboard
│   └── client.js            # Client-side JavaScript
│
└── streams/                  # Generated HLS stream files (created at runtime)
    └── [stream-name]/
        ├── stream.m3u8      # HLS playlist
        └── seg_*.ts         # Video segments
```

## Module Responsibilities

### `server.js`
- Application entry point
- Initializes Express app
- Restores previous streams
- Starts HTTP server

### `app.js`
- Creates and configures Express application
- Registers middleware in correct order
- Mounts all route handlers

### Middleware Layer

#### `middleware/auth.js`
- Sets up basic authentication for admin routes
- Protects `/` (dashboard) and `/api/*` routes
- Public routes remain unprotected

#### `middleware/staticServing.js`
- Serves HLS stream files publicly at `/streams/*`
- Handles individual stream file requests with detailed logging
- Serves public folder content (dashboard, client.js)
- Implements CORS headers for external access

### Routes Layer

#### `routes/streams.js`
- `GET /api/streams` - List all streams with status
- `POST /api/streams/:name/start` - Start a stream
- `POST /api/streams/:name/stop` - Stop a stream
- `DELETE /api/streams/:name` - Delete a stream

#### `routes/upload.js`
- `POST /api/upload` - Upload audio file and create new stream

#### `routes/diagnostics.js`
- `GET /__debug/streams` - Inspect streams folder structure
- `GET /__debug/ffmpeg` - Check FFmpeg processes and system info

### Services Layer

#### `services/streamService.js`
Core business logic including:
- **FFmpeg HLS Streaming**: Native command execution using `nohup` + background process
- **Process Management**: Start, stop, delete streams
- **Metadata Persistence**: Load/save streams to `streams.json`
- **Stream Restoration**: Restore streams on application restart
- **File Monitoring**: Track HLS file creation (.m3u8, .ts segments)

## Key Features

### Native FFmpeg Execution
The service uses native Linux command execution for reliable HLS generation:
```bash
cd "${dir}" && nohup ffmpeg \
  -re \
  -stream_loop -1 \
  -i "${filePath}" \
  -c:a copy \
  -hls_time 4 \
  -hls_list_size 5 \
  -hls_flags delete_segments \
  -hls_segment_filename "${outputSegment}" \
  "${outputPlaylist}" \
  > "${dir}/ffmpeg_stdout.log" 2>&1 & echo $!
```

Benefits:
- True background execution (survives terminal close)
- Proper process isolation
- Log file for debugging
- Immediate PID return for process tracking

### Authentication Flow
```
Public Routes (No Auth):
- /streams/* → HLS files
- /public/* → Dashboard assets
- /__debug/* → Diagnostic endpoints

Protected Routes (Requires Auth):
- / → Dashboard HTML
- /api/* → All API endpoints
```

### HLS Streaming Workflow
1. User uploads MP3 via `/api/upload`
2. Server saves file to `streams/[name]/`
3. FFmpeg process started as native background process
4. HLS files generated: `stream.m3u8` + `seg_*.ts`
5. Files served publicly via `/streams/[name]/`

## Running the Application

### Production
```bash
node server.js
```

### Development (with auto-reload)
```bash
npm run dev
```

Server runs on `http://0.0.0.0:8300` by default.

## API Endpoints

### Stream Management
- `GET /api/streams` - List streams
- `POST /api/streams/:name/start` - Start stream
- `POST /api/streams/:name/stop` - Stop stream
- `DELETE /api/streams/:name` - Delete stream

### Upload
- `POST /api/upload` - Upload audio file
  - Form data: `audio` (file), `name` (string)

### Diagnostics
- `GET /__debug/streams` - View stream folder contents
- `GET /__debug/ffmpeg` - View FFmpeg processes and system info

### Public Access (No Auth Required)
- `GET /streams/:name/stream.m3u8` - HLS playlist
- `GET /streams/:name/seg_*.ts` - HLS segments

## Configuration

Environment variables:
- `PORT` - Server port (default: 8300)
- `HOST` - Server host (default: 0.0.0.0)

Authentication credentials:
- Username: `admin`
- Password: `@!JKF3eWd12`

## Dependencies

- **express** - Web framework
- **express-basic-auth** - HTTP basic authentication
- **multer** - File upload handling
- **deasync** - Synchronous operations for process management
