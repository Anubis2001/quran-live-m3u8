/**
 * YouTube Audio HLS Streaming - Usage Examples
 * 
 * This demonstrates how to stream audio from YouTube videos as HLS playlists
 */

const axios = require('axios');

const SERVER_URL = 'http://localhost:8300';
const AUTH_HEADER = {
  'Authorization': 'Basic YWRtaW46QCFKS0YzZVdkMTI='
};

/**
 * Start a YouTube audio stream
 * @param {string} name - Stream name (will be used in URL)
 * @param {string} youtubeUrl - YouTube video URL
 * @param {string} [cookiesPath] - Optional path to cookies.txt file for authentication
 */
async function startYoutubeStream(name, youtubeUrl, cookiesPath) {
  try {
    console.log(`\n🎵 Starting YouTube stream: ${name}`);
    console.log(`URL: ${youtubeUrl}`);
    if (cookiesPath) {
      console.log(`Cookies: ${cookiesPath}`);
    }
    console.log();
    
    const requestBody = { url: youtubeUrl };
    if (cookiesPath) {
      requestBody.cookies = cookiesPath;
    }
    
    const response = await axios.post(
      `${SERVER_URL}/api/streams/youtube/${name}`,
      requestBody,
      { headers: AUTH_HEADER }
    );
    
    console.log('✅ Stream started successfully!');
    console.log('Stream Name:', response.data.name);
    console.log('Stream URL:', response.data.streamUrl);
    if (response.data.authenticated) {
      console.log('🍪 Authentication: Enabled (using cookies.txt)');
    }
    console.log('\n📻 Listen to your stream at:');
    console.log(response.data.streamUrl);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error starting stream:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * List all active streams
 */
async function listStreams() {
  try {
    const response = await axios.get(`${SERVER_URL}/api/streams`);
    console.log('\n📋 Active Streams:');
    console.log('================');
    response.data.forEach(stream => {
      console.log(`\nName: ${stream.name}`);
      console.log(`Status: ${stream.status}`);
      console.log(`URL: ${stream.url}`);
      console.log(`Created: ${stream.createdAt}`);
    });
    return response.data;
  } catch (error) {
    console.error('Error listing streams:', error.message);
    throw error;
  }
}

/**
 * Stop a stream
 */
async function stopStream(name) {
  try {
    console.log(`\n⏹️ Stopping stream: ${name}`);
    await axios.post(`${SERVER_URL}/api/streams/${name}/stop`, null, {
      headers: AUTH_HEADER
    });
    console.log('✅ Stream stopped');
  } catch (error) {
    console.error('Error stopping stream:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// EXAMPLE USAGE
// ============================================

async function main() {
  console.log('========================================');
  console.log('YouTube Audio HLS Streaming Examples');
  console.log('========================================\n');
  
  // Example 1: Start streaming from a YouTube video
  console.log('Example 1: Start Quran Recitation Stream');
  console.log('----------------------------------------');
  try {
    await startYoutubeStream(
      'quran-surah-rahman',
      'https://www.youtube.com/watch?v=EXAMPLE_VIDEO_ID'
    );
  } catch (e) {
    console.log('Note: Replace EXAMPLE_VIDEO_ID with actual YouTube video ID');
  }
  
  // Example 2: Start another stream
  console.log('\n\nExample 2: Start Islamic Lecture Stream');
  console.log('----------------------------------------');
  try {
    await startYoutubeStream(
      'islamic-lecture',
      'https://www.youtube.com/watch?v=ANOTHER_VIDEO_ID'
    );
  } catch (e) {
    console.log('Note: Replace with actual YouTube URL');
  }
  
  // Example 3: List all streams
  console.log('\n\nExample 3: List All Active Streams');
  console.log('-----------------------------------');
  await listStreams();
  
  // Example 4: Stop a stream
  console.log('\n\nExample 4: Stop a Stream');
  console.log('------------------------');
  await stopStream('quran-surah-rahman');
  
  // Example 5: Multiple listeners can access the same stream
  console.log('\n\nMulti-Listener Support');
  console.log('----------------------');
  console.log('Once a stream is started, multiple listeners can tune in:');
  console.log('Listener 1: http://10.0.20.99:8300/streams/quran-surah-rahman/stream.m3u8');
  console.log('Listener 2: http://10.0.20.99:8300/streams/quran-surah-rahman/stream.m3u8');
  console.log('Listener 3: http://10.0.20.99:8300/streams/quran-surah-rahman/stream.m3u8');
  console.log('All listeners stay synchronized!');
}

// Run examples if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  startYoutubeStream,
  listStreams,
  stopStream
};
