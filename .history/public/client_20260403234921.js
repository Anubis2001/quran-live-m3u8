// Debug mode flag
// Role-based access control
let authToken = null;
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

async function fetchWithError(url, options = {}) {
  debug('Fetching:', url, options);
  
  // Add authorization header if we have a token
  if (authToken) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  // Set content type for JSON requests
  if (!options.headers) {
    options.headers = {};
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include' // Include cookies
    });
    
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
            <button onclick="showRenameModal('${stream.name}')" 
              class="btn-action bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white px-4 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all font-medium flex items-center gap-2"
              title="Rename Stream">
              <i class="fas fa-edit"></i>
              <span class="hidden sm:inline">Rename</span>
            </button>
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
document.addEventListener('DOMContentLoaded', async function() {
  debug('DOM loaded, initializing dashboard...');
  
  // Check authentication first
  await checkAuthStatus();
  
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

// ========== Authentication & Session Management ==========

let authToken = null;
let currentUser = null;
let userRole = null; // 'admin' or 'user'
const selectedStreams = new Set();

// Check authentication status on page load
async function checkAuthStatus() {
  const token = getCookie('sessionToken');
  
  if (!token) {
    // Not authenticated - show as guest (view-only mode)
    currentUser = null;
    userRole = 'guest';
    updateUIForRole();
    return;
  }
  
  try {
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    
    if (data.success) {
      authToken = token;
      currentUser = data.user.username;
      userRole = data.user.role;
      updateUIForRole();
    } else {
      // Invalid token - clear it
      clearCookie('sessionToken');
      currentUser = null;
      userRole = 'guest';
      updateUIForRole();
    }
  } catch (err) {
    console.error('Auth check failed:', err);
    currentUser = null;
    userRole = 'guest';
    updateUIForRole();
  }
}

// Update UI based on user role
function updateUIForRole() {
  const loginBtn = document.getElementById('loginBtn');
  const loginStatus = document.getElementById('loginStatus');
  const userRoleEl = document.getElementById('userRole');
  const uploadSection = document.getElementById('uploadSection');
  const bulkActions = document.getElementById('bulkActions');
  const adminUsersLink = document.getElementById('adminUsersLink');
  
  if (!currentUser || userRole === 'guest') {
    // Not logged in - show login button, hide admin features
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (loginStatus) loginStatus.classList.add('hidden');
    if (uploadSection) uploadSection.classList.add('hidden');
    if (bulkActions) bulkActions.classList.add('hidden');
    if (adminUsersLink) adminUsersLink.classList.add('hidden');
  } else if (userRole === 'admin') {
    // Admin - show everything
    if (loginBtn) loginBtn.classList.add('hidden');
    if (loginStatus) loginStatus.classList.remove('hidden');
    if (userRoleEl) userRoleEl.textContent = `👑 ${currentUser} (Admin)`;
    if (uploadSection) uploadSection.classList.remove('hidden');
    if (bulkActions) bulkActions.classList.remove('hidden');
    if (adminUsersLink) adminUsersLink.classList.remove('hidden');
  } else if (userRole === 'user') {
    // Regular user - view only
    if (loginBtn) loginBtn.classList.add('hidden');
    if (loginStatus) loginStatus.classList.remove('hidden');
    if (userRoleEl) userRoleEl.textContent = `👤 ${currentUser} (Viewer)`;
    if (uploadSection) uploadSection.classList.add('hidden');
    if (bulkActions) bulkActions.classList.add('hidden');
    if (adminUsersLink) adminUsersLink.classList.add('hidden');
  }
}

// Show login modal
function showLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.remove('hidden');
}

// Hide login modal
function hideLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.add('hidden');
}

// Handle login
async function handleLogin(username, password) {
  try {
    // Test credentials by making a POST request to the auth test endpoint
    // This endpoint requires admin authentication, so it will fail with wrong credentials
    const credentials = btoa(`${username}:${password}`);
    
    const response = await fetch('/api/streams/test-auth', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    // Check for authentication failure
    if (response.status === 401) {
      showError('Invalid username or password');
      return;
    }
    
    if (response.status === 403) {
      // User authenticated but doesn't have admin role
      showError('Access denied. Admin credentials required.');
      return;
    }
    
    if (response.ok) {
      const data = await response.json();
      
      // Credentials are valid!
      currentUser = username;
      userRole = username === 'admin' ? 'admin' : 'user';
      
      // Store in session
      sessionStorage.setItem('user', username);
      sessionStorage.setItem('role', userRole);
      
      // Update UI
      hideLoginModal();
      updateUIForRole();
      showError(`Welcome back, ${username}!`, true);
      
      // Refresh to show updated UI
      refresh();
    } else {
      showError('Invalid username or password');
    }
  } catch (err) {
    console.error('Login failed:', err);
    showError('Login failed. Please try again.');
  }
}

// Handle logout
async function logout() {
  try {
    if (authToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    // Clear local state
    authToken = null;
    currentUser = null;
    userRole = null;
    clearCookie('sessionToken');
    updateUIForRole();
    showError('Logged out successfully', true);
  }
}

// Helper functions for cookie management
function getCookie(name) {
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name) return value;
  }
  return null;
}

function clearCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Strict`;
}

// Initialize login form handler
document.addEventListener('DOMContentLoaded', function() {
  checkAuthStatus();
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value.trim();
      
      if (username && password) {
        await handleLogin(username, password);
      }
    });
  }
});

// ========== Stream Rename Functionality ==========

let currentStreamToRename = null;

// Show rename modal
function showRenameModal(streamName) {
  currentStreamToRename = streamName;
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('renameModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'renameModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center hidden';
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 animate-fade-in">
        <h3 class="text-xl font-bold mb-4 text-gray-900">
          <i class="fas fa-edit text-purple-600 mr-2"></i>Rename Stream
        </h3>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Current Name:</label>
          <div id="currentStreamName" class="px-3 py-2 bg-gray-100 rounded-lg text-gray-900 font-mono"></div>
        </div>
        <div class="mb-6">
          <label for="newStreamName" class="block text-sm font-medium text-gray-700 mb-2">
            New Name (Arabic supported):
          </label>
          <input type="text" id="newStreamName" 
            class="w-full border-2 border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 px-3 py-2 rounded-lg transition-all outline-none"
            placeholder="Enter new name..."
            dir="auto">
          <p class="text-xs text-gray-500 mt-1">Supports Arabic, English, numbers, spaces, hyphens, and underscores</p>
        </div>
        <div class="flex gap-3 justify-end">
          <button onclick="hideRenameModal()" 
            class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-all font-medium">
            <i class="fas fa-times mr-1"></i>Cancel
          </button>
          <button onclick="handleRename()" 
            class="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all font-medium shadow-md">
            <i class="fas fa-check mr-1"></i>Rename
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  // Update modal content
  document.getElementById('currentStreamName').textContent = streamName;
  document.getElementById('newStreamName').value = streamName;
  
  // Show modal
  modal.classList.remove('hidden');
  
  // Focus on input and select all text
  setTimeout(() => {
    const input = document.getElementById('newStreamName');
    input.focus();
    input.select();
  }, 100);
}

// Hide rename modal
function hideRenameModal() {
  const modal = document.getElementById('renameModal');
  if (modal) {
    modal.classList.add('hidden');
  }
  currentStreamToRename = null;
}

// Handle rename submission
async function handleRename() {
  if (!currentStreamToRename) return;
  
  const newNameInput = document.getElementById('newStreamName');
  const newName = newNameInput.value.trim();
  
  if (!newName) {
    showError('Please enter a new stream name');
    return;
  }
  
  // Validate name format (allow Arabic and Unicode)
  if (!/^\p{L}[\p{L}\p{N}\s_-]*$/u.test(newName)) {
    showError('Invalid name. Must start with a letter and can contain letters, numbers, spaces, hyphens, and underscores.');
    return;
  }
  
  try {
    const credentials = currentUser ? btoa(`${currentUser}:${getPasswordForUser(currentUser)}`) : null;
    
    const response = await fetch(`/api/streams/${encodeURIComponent(currentStreamToRename)}/rename`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(credentials && { 'Authorization': `Basic ${credentials}` })
      },
      body: JSON.stringify({ newName })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showError(`Stream renamed successfully!`, true);
      hideRenameModal();
      await refresh();
    } else {
      showError(data.error || data.message || 'Failed to rename stream');
    }
  } catch (err) {
    console.error('Rename failed:', err);
    showError('Failed to rename stream');
  }
}

// Helper to get password (in production, this should not be in client-side code)
function getPasswordForUser(username) {
  // This is just for demo - in production use proper session management
  return username === 'admin' ? '@!JKF3eWd12' : 'user123';
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideRenameModal();
  }
});