// Debug mode flag
// Role-based access control
let currentUser = null;
let userRole = null; // 'admin' or 'user'
const selectedStreams = new Set();

// Debug logging (basic level - console only)
function debug(...args) {
  console.log('[DEBUG]', new Date().toLocaleTimeString(), ...args);
}

// Verbose logging (file level only)
function logVerbose(message) {
  // This would be sent to the logging service in production
  // For now, we keep it in console but could be extended
  if (currentUser && currentUser === 'admin') {
    console.log('[VERBOSE]', message);
  }
}

function showError(message, isSuccess = false) {
  const container = document.getElementById("errorContainer");
  const text = document.getElementById("errorText");
  
  if (!container || !text) return;
  
  // Update styling based on message type
  if (isSuccess || message.toLowerCase().includes('success')) {
    container.querySelector('div').className = 'bg-green-100 text-green-800 border-l-4 border-green-500 px-4 py-3 rounded shadow-lg';
    container.querySelector('strong').innerHTML = '<i class="fas fa-check-circle mr-2"></i>Success:';
  } else {
    container.querySelector('div').className = 'bg-red-100 text-red-800 border-l-4 border-red-500 px-4 py-3 rounded shadow-lg';
    container.querySelector('strong').innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>Error:';
  }
  
  text.textContent = message;
  container.classList.remove('hidden');
  
  // Auto-hide after 8 seconds
  setTimeout(() => container.classList.add('hidden'), 8000);
}

async function fetchWithError(url, options) {
  debug('Fetching:', url, options);
  try {
    const response = await fetch(url, options);
    debug('Response status:', response.status, response.statusText);
    if (!response.ok) {
      let errorMsg = `Error ${response.status}`;
      try {
        const data = await response.json();
        if (data.error || data.message) {
          errorMsg = data.error || data.message;
        }
      } catch {}
      throw new Error(errorMsg);
    }
    return response;
  } catch (err) {
    debug('Fetch error:', err.message);
    showError(err.message || "Unknown error happened");
    throw err;
  }
}

async function refresh() {
  debug('Refreshing streams list...');
  try {
    const res = await fetchWithError("/api/streams");
    const streams = await res.json();
    debug('Received streams:', streams.length);

    const list = document.getElementById("list");
    const streamCount = document.getElementById("streamCount");
    
    // Update stream count badge
    if (streamCount) {
      streamCount.textContent = streams.length;
    }

    list.innerHTML = "";

    if (streams.length === 0) {
      debug('No streams available');
      list.innerHTML = `
        <li class="text-center py-12">
          <i class="fas fa-broadcast-tower text-6xl text-gray-300 mb-4"></i>
          <p class="text-gray-500 text-lg">No streams available</p>
          <p class="text-gray-400 text-sm mt-2">Upload an MP3 file to create your first stream</p>
        </li>
      `;
      if (document.getElementById("bulkActions")) {
        document.getElementById("bulkActions").classList.add("hidden");
      }
      return;
    }

    // Show bulk actions if there are streams
    if (document.getElementById("bulkActions")) {
      document.getElementById("bulkActions").classList.remove("hidden");
    }

    streams.forEach(stream => {
      const isChecked = selectedStreams.has(stream.name);
      const isRunning = stream.status === 'running';
      const isFailed = stream.status === 'failed';
      
      const li = document.createElement("li");
      li.className = "stream-card bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-blue-300 transition-all";
      li.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <!-- Left side: Checkbox + Stream Info -->
          <div class="flex items-start gap-3 flex-1">
            <input type="checkbox" data-stream="${stream.name}" 
              class="stream-checkbox w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-2 border-gray-300 mt-1"
              ${isChecked ? 'checked' : ''}>
            
            <div class="flex-1 min-w-0">
              <!-- Stream Name & Status -->
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <h3 class="font-bold text-xl text-gray-900 truncate">
                  ${stream.name}
                </h3>
                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                  isRunning ? 'bg-green-100 text-green-700' : 
                  isFailed ? 'bg-red-100 text-red-700' : 
                  'bg-gray-100 text-gray-700'
                }">
                  <i class="fas fa-${isRunning ? 'circle status-running' : isFailed ? 'exclamation-triangle' : 'stop-circle'} mr-1"></i>
                  ${stream.status.toUpperCase()}
                </span>
              </div>
              
              <!-- Stream URL - Always Visible -->
              <div class="mb-3">
                <button onclick="copyStreamUrl('${stream.url || `/streams/${stream.name}/stream.m3u8`}', this)" 
                  class="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200 px-4 py-2 rounded-lg text-blue-700 transition-all group cursor-pointer w-full sm:w-auto text-left sm:text-center"
                  title="Click to copy URL to clipboard">
                  <i class="fas fa-copy text-blue-600 group-hover:text-blue-800"></i>
                  <span class="font-mono text-sm break-all flex-1">${stream.url || `/streams/${stream.name}/stream.m3u8`}</span>
                  <i class="fas fa-check-circle text-green-600 hidden check-icon"></i>
                </button>
              </div>
              
              <!-- Additional Info -->
              <div class="flex items-center gap-4 text-xs text-gray-500">
                <span class="flex items-center gap-1">
                  <i class="fas fa-clock"></i>
                  Created: ${stream.createdAt ? new Date(stream.createdAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          
          <!-- Right side: Action Buttons -->
          <div class="flex gap-2 flex-shrink-0 flex-wrap">
            ${!isRunning ? `
              <button onclick="startStream('${stream.name}')" 
                class="btn-action bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all font-medium flex items-center gap-2"
                title="Start Stream">
                <i class="fas fa-play"></i>
                <span class="hidden sm:inline">Start</span>
              </button>
            ` : `
              <button onclick="stopStream('${stream.name}')" 
                class="btn-action bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all font-medium flex items-center gap-2"
                title="Stop Stream">
                <i class="fas fa-pause"></i>
                <span class="hidden sm:inline">Stop</span>
              </button>
            `}
            <button onclick="deleteStream('${stream.name}')" 
              class="btn-action bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all font-medium flex items-center gap-2"
              title="Delete Stream">
              <i class="fas fa-trash"></i>
              <span class="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>
      `;
      list.appendChild(li);
    });

    // Add checkbox event listeners
    document.querySelectorAll('.stream-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const streamName = e.target.getAttribute('data-stream');
        if (e.target.checked) {
          selectedStreams.add(streamName);
        } else {
          selectedStreams.delete(streamName);
        }
        updateSelectedCount();
        updateSelectAllCheckbox();
      });
    });

    // Update select all checkbox state and count
    updateSelectedCount();
    updateSelectAllCheckbox();

    debug('Streams list rendered successfully');
  } catch (err) {
    console.error("Refresh failed:", err);
    debug('Refresh error details:', err.stack);
  }
}

function updateSelectedCount() {
  const countElement = document.getElementById('count');
  const selectedCountElement = document.getElementById('selectedCount');
  
  if (countElement && selectedCountElement) {
    countElement.textContent = selectedStreams.size;
    if (selectedStreams.size > 0) {
      selectedCountElement.classList.remove('hidden');
    } else {
      selectedCountElement.classList.add('hidden');
    }
  }
}

function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById('selectAll');
  const checkboxes = document.querySelectorAll('.stream-checkbox');
  
  if (checkboxes.length === 0) {
    selectAllCheckbox.checked = false;
    return;
  }
  
  const checkedCount = document.querySelectorAll('.stream-checkbox:checked').length;
  selectAllCheckbox.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
  selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

// Track selected streams for bulk operations
let selectedStreams = new Set();

// Handle select all checkbox
const selectAllCheckbox = document.getElementById('selectAll');
if (selectAllCheckbox) {
  selectAllCheckbox.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll('.stream-checkbox');
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = isChecked;
      const streamName = checkbox.getAttribute('data-stream');
      if (isChecked) {
        selectedStreams.add(streamName);
      } else {
        selectedStreams.delete(streamName);
      }
    });
    updateSelectedCount();
  });
}

// Apply bulk action
const applyBulkButton = document.getElementById('applyBulkAction');
if (applyBulkButton) {
  applyBulkButton.addEventListener('click', async () => {
    const action = document.getElementById('bulkActionSelect').value;
    
    if (!action) {
      showError('Please select an action from the dropdown');
      return;
    }
    
    if (selectedStreams.size === 0) {
      showError('Please select at least one stream');
      return;
    }
    
    const actionNames = { start: 'Starting', stop: 'Stopping', delete: 'Deleting' };
    const actionVerbs = { start: 'start', stop: 'stop', delete: 'delete' };
    
    // Show loading state
    const applyButton = document.getElementById('applyBulkAction');
    const originalText = applyButton.innerHTML;
    applyButton.disabled = true;
    applyButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${actionNames[action]} ${selectedStreams.size} stream(s)...`;
    
    try {
      // Execute action on all selected streams
      const promises = Array.from(selectedStreams).map(name => 
        fetchWithError(`/api/streams/${name}${action === 'delete' ? '' : '/' + action}`, {
          method: action === 'delete' ? 'DELETE' : 'POST'
        }).catch(err => console.error(`Failed to ${actionVerbs[action]} ${name}:`, err))
      );
      
      await Promise.all(promises);
      
      showError(`${actionNames[action].replace('ing', 'ed')} ${selectedStreams.size} stream(s) successfully!`, true);
      selectedStreams.clear();
      await refresh();
    } catch (err) {
      console.error('Bulk action failed:', err);
    } finally {
      applyButton.disabled = false;
      applyButton.innerHTML = originalText;
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  debug('DOM loaded, initializing dashboard...');
  // Check if upload form exists
  const uploadForm = document.getElementById("uploadForm");
  if (uploadForm) {
    debug('Upload form found');
  } else {
    console.error('Upload form NOT found!');
  }
  
  // Initial refresh
  refresh();
});

document.getElementById("uploadForm").addEventListener("submit", async e => {
  debug('========== UPLOAD STARTED ==========');
  e.preventDefault();
  
  const form = e.target;
  const nameInput = form.querySelector('input[name="name"]');
  const fileInput = form.querySelector('input[name="audio"]');
  
  debug('Form data:', {
    name: nameInput?.value,
    fileName: fileInput?.files?.[0]?.name,
    fileSize: fileInput?.files?.[0]?.size
  });
  
  // Validate inputs
  if (!nameInput.value.trim()) {
    debug('Validation failed: empty name');
    showError('Please enter a stream name');
    return;
  }
  
  if (!fileInput.files || !fileInput.files[0]) {
    debug('Validation failed: no file selected');
    showError('Please select an MP3 file');
    return;
  }
  
  const fd = new FormData(form);
  debug('FormData created with entries:', Array.from(fd.keys()));
  
  console.log('Uploading:', nameInput.value, fileInput.files[0].name);
  
  // Add visual feedback that upload is in progress
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  
  try {
    debug('Sending POST request to /api/upload');
    const res = await fetchWithError("/api/upload", {
      method: "POST",
      body: fd,
    });
    
    debug('Upload response received, status:', res.status);
    const data = await res.json();
    debug('Response data:', data);
    console.log("Upload success:", data.streamUrl);
    
    // Show success message
    showError(data.message || "Stream uploaded successfully!", true);
    
    // Wait a moment for FFmpeg to start
    setTimeout(() => {
      debug('Refreshing streams list after upload');
      refresh();
    }, 500);
    
    form.reset();
    debug('========== UPLOAD COMPLETED ==========');
  } catch (err) {
    console.error("Upload failed:", err);
    debug('Upload error details:', err.stack);
    // Error already shown by fetchWithError
  } finally {
    // Restore button state
    submitButton.disabled = false;
    submitButton.innerHTML = originalText;
  }
});

// Then update stopStream, startStream, deleteStream:
async function stopStream(name) {
  debug('Stopping stream:', name);
  try {
    await fetchWithError(`/api/streams/${name}/stop`, { method: "POST" });
    debug('Stream stopped successfully');
    refresh();
  } catch (err) {
    console.error(`Failed to stop ${name}:`, err);
  }
}

async function startStream(name) {
  debug('Starting stream:', name);
  try {
    await fetchWithError(`/api/streams/${name}/start`, { method: "POST" });
    debug('Stream started successfully');
    refresh();
  } catch (err) {
    console.error(`Failed to start ${name}:`, err);
  }
}

async function deleteStream(name) {
  debug('Deleting stream:', name);
  try {
    await fetchWithError(`/api/streams/${name}`, { method: "DELETE" });
    debug('Stream deleted successfully');
    refresh();
  } catch (err) {
    console.error(`Failed to delete ${name}:`, err);
  }
}

// Copy stream URL to clipboard
async function copyStreamUrl(url, buttonElement) {
  debug('Copying URL to clipboard:', url);
  
  try {
    // Use modern Clipboard API
    await navigator.clipboard.writeText(url);
    
    // Visual feedback - change button appearance temporarily
    const originalContent = buttonElement.innerHTML;
    const icon = buttonElement.querySelector('.fa-copy');
    const checkIcon = buttonElement.querySelector('.check-icon');
    
    // Hide copy icon, show check icon
    if (icon) icon.classList.add('hidden');
    if (checkIcon) checkIcon.classList.remove('hidden');
    
    // Change text color briefly
    buttonElement.classList.add('text-green-700');
    buttonElement.classList.remove('text-blue-700');
    
    // Show success message
    showError('URL copied to clipboard!', true);
    
    // Restore after 2 seconds
    setTimeout(() => {
      if (icon) icon.classList.remove('hidden');
      if (checkIcon) checkIcon.classList.add('hidden');
      buttonElement.classList.remove('text-green-700');
      buttonElement.classList.add('text-blue-700');
    }, 2000);
    
    debug('URL copied successfully');
  } catch (err) {
    console.error('Failed to copy URL:', err);
    showError('Failed to copy URL to clipboard');
    
    // Fallback: try old method
    try {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      showError('URL copied to clipboard!', true);
      debug('URL copied using fallback method');
    } catch (fallbackErr) {
      console.error('Fallback copy also failed:', fallbackErr);
      showError('Unable to copy URL');
    }
  }
}