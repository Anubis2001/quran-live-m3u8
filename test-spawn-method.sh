#!/bin/bash
# HLS Streaming Server - Comprehensive Testing Script
# Run this on the Linux server (10.0.20.99) to test the improved FFmpeg execution

echo "=========================================="
echo "HLS Streaming Server - Improved FFmpeg Test"
echo "Server: 10.0.20.99"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/root/quran-live-m3u8"
STREAMS_DIR="$APP_DIR/streams"
TEST_STREAM="spawn-test-$(date +%s)"

echo -e "${BLUE}=== PRE-TEST VALIDATION ===${NC}"
echo ""

# 1. Check if Node.js is running
echo "1. Checking Node.js application status:"
ps aux | grep -E "node.*server.js" | grep -v grep
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Node.js app is running${NC}"
else
    echo -e "${YELLOW}⚠ Node.js app not running. Starting it...${NC}"
    cd $APP_DIR
    nohup node server.js > /tmp/node-app.log 2>&1 &
    sleep 3
    echo "App started. Check /tmp/node-app.log for details"
fi

# 2. Verify FFmpeg
echo ""
echo "2. FFmpeg verification:"
which ffmpeg && ffmpeg -version | head -n 1

# 3. Create test directory
echo ""
echo "3. Preparing test stream: $TEST_STREAM"
mkdir -p "$STREAMS_DIR/$TEST_STREAM"

# Find an MP3 to use for testing
EXISTING_MP3=$(find "$STREAMS_DIR" -name "*.mp3" -type f | head -n 1)
if [ -n "$EXISTING_MP3" ]; then
    TEST_AUDIO="$STREAMS_DIR/$TEST_STREAM/test.mp3"
    cp "$EXISTING_MP3" "$TEST_AUDIO"
    echo -e "${GREEN}✓ Copied test audio: $TEST_AUDIO${NC}"
    ls -lh "$TEST_AUDIO"
else
    echo -e "${RED}✗ No MP3 file found for testing!${NC}"
    echo "Please upload an MP3 file first or copy one to $STREAMS_DIR"
    exit 1
fi

echo ""
echo -e "${BLUE}=== TESTING IMPROVED SPAWN METHOD ===${NC}"
echo ""

# 4. Start stream via API
echo "4. Starting stream using spawn() method via API:"
echo "Stream name: $TEST_STREAM"
curl -X POST "http://localhost:8300/api/streams/$TEST_STREAM/start" \
  -H "Authorization: Basic YWRtaW46QCFKS0YzZVdkMTI=" \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "5. Monitoring HLS file creation (checking every 2 seconds for 20 seconds):"
for i in {1..10}; do
    echo ""
    echo "--- Check #$i at $(date +%H:%M:%S) ---"
    
    # Check for m3u8
    M3U8_FILE="$STREAMS_DIR/$TEST_STREAM/stream.m3u8"
    if [ -f "$M3U8_FILE" ]; then
        echo -e "${GREEN}✓ M3U8 file created!${NC}"
        ls -lh "$M3U8_FILE"
        echo "Content preview:"
        head -n 10 "$M3U8_FILE"
        
        # Check for ts segments
        TS_COUNT=$(ls "$STREAMS_DIR/$TEST_STREAM"/seg_*.ts 2>/dev/null | wc -l)
        echo -e "${GREEN}✓ Found $TS_COUNT TS segment(s)${NC}"
        
        if [ $TS_COUNT -gt 0 ]; then
            ls -lh "$STREAMS_DIR/$TEST_STREAM"/seg_*.ts
            echo ""
            echo -e "${GREEN}🎉 SUCCESS! HLS streaming is working with spawn() method!${NC}"
            break
        fi
    else
        echo -e "${YELLOW}⏳ M3U8 not yet created...${NC}"
    fi
    
    # Show directory contents
    echo "Directory contents:"
    ls -la "$STREAMS_DIR/$TEST_STREAM/"
    
    sleep 2
done

echo ""
echo -e "${BLUE}=== PROCESS VERIFICATION ===${NC}"
echo ""

# 6. Check FFmpeg process
echo "6. FFmpeg process status:"
ps aux | grep ffmpeg | grep -v grep | grep "$TEST_STREAM"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ FFmpeg process is running${NC}"
else
    echo -e "${YELLOW}⚠ FFmpeg process not found${NC}"
fi

# 7. Check log files
echo ""
echo "7. Log file analysis:"
LOG_FILE="$STREAMS_DIR/$TEST_STREAM/ffmpeg.log"
if [ -f "$LOG_FILE" ]; then
    echo -e "${GREEN}✓ Log file exists${NC}"
    echo "Last 20 lines:"
    tail -n 20 "$LOG_FILE"
    
    # Check for errors
    if grep -qi "error\|invalid" "$LOG_FILE"; then
        echo -e "${YELLOW}⚠ Potential errors found in log${NC}"
    else
        echo -e "${GREEN}✓ No obvious errors in log${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Log file not created${NC}"
fi

echo ""
echo -e "${BLUE}=== FINAL STATUS CHECK ===${NC}"
echo ""

# 8. Final verification
FINAL_M3U8="$STREAMS_DIR/$TEST_STREAM/stream.m3u8"
FINAL_TS_COUNT=$(ls "$STREAMS_DIR/$TEST_STREAM"/seg_*.ts 2>/dev/null | wc -l)

if [ -f "$FINAL_M3U8" ] && [ $FINAL_TS_COUNT -gt 0 ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}TEST PASSED!${NC}"
    echo -e "${GREEN}Spawn() method is working correctly!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "Stream URL: http://10.0.20.99:8300/streams/$TEST_STREAM/stream.m3u8"
    echo ""
    echo "Files created:"
    ls -lh "$STREAMS_DIR/$TEST_STREAM/"
else
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}TEST FAILED!${NC}"
    echo -e "${RED}HLS files were NOT created.${NC}"
    echo -e "${RED}=========================================${NC}"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check Node.js logs: cat /tmp/node-app.log"
    echo "2. Check FFmpeg log: cat $LOG_FILE (if exists)"
    echo "3. Verify permissions: ls -la $STREAMS_DIR"
    echo "4. Test FFmpeg manually:"
    echo "   cd $STREAMS_DIR/$TEST_STREAM && ffmpeg -re -stream_loop -1 -i $TEST_AUDIO -vn -c:a copy -hls_time 3 -hls_list_size 6 -hls_flags delete_segments+round_durations -hls_segment_filename 'seg_%03d.ts' -hls_segment_type mpegts stream.m3u8"
fi

echo ""
echo "Test completed at $(date)"
