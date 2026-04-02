function showError(message, isSuccess = false) {
  const container = document.getElementById("errorContainer");
  const text = document.getElementById("errorText");
  
  // Update styling based on message type
  if (isSuccess || message.toLowerCase().includes('success')) {
    container.className = 'bg-green-200 text-green-800 border border-green-400 px-4 py-3 rounded mb-4';
    container.querySelector('strong').textContent = 'Success:';
  } else {
    container.className = 'bg-red-200 text-red-800 border border-red-400 px-4 py-3 rounded mb-4';
    container.querySelector('strong').textContent = 'Error:';
  }
  
  text.textContent = message;
  container.classList.remove('hidden');
  setTimeout(() => container.classList.add('hidden'), 8000);
}

async function fetchWithError(url, options) {
  try {
    const response = await fetch(url, options);
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
    showError(err.message || "Unknown error happened");
    throw err;
  }
}

async function refresh() {
  try {
    const res = await fetchWithError("/api/streams");
    const streams = await res.json();

    const list = document.getElementById("list");
    list.innerHTML = "";

    if (streams.length === 0) {
      list.innerHTML = '<li class="text-center text-gray-500 py-8">No streams available</li>';
      document.getElementById("bulkActions").classList.add("hidden");
      return;
    }

    // Show bulk actions if there are streams
    document.getElementById("bulkActions").classList.remove("hidden");

    streams.forEach(stream => {
      const isChecked = selectedStreams.has(stream.name);
      
      const li = document.createElement("li");
      li.className = "bg-white border rounded-lg p-4 hover:shadow-md transition-shadow";
      li.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 flex-1">
            <input type="checkbox" data-stream="${stream.name}" 
              class="stream-checkbox w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
              ${isChecked ? 'checked' : ''}>
            <div class="flex-1">
              <h3 class="font-semibold text-lg text-gray-800">${stream.name}</h3>
              <p class="text-sm text-gray-600 mt-1">
                <i class="fas fa-${stream.status === 'running' ? 'circle text-green-500' : stream.status === 'failed' ? 'exclamation-triangle text-red-500' : 'stop-circle text-gray-500'}"></i>
                Status: <span class="font-medium ${stream.status === 'running' ? 'text-green-600' : stream.status === 'failed' ? 'text-red-600' : 'text-gray-600'}">${stream.status}</span>
              </p>
              <a href="${stream.url || `/streams/${stream.name}/stream.m3u8`}" target="_blank" 
                class="inline-block mt-2 text-blue-600 hover:text-blue-800 text-sm">
                <i class="fas fa-play-circle"></i> ${stream.url || `/streams/${stream.name}/stream.m3u8`}
              </a>
            </div>
          </div>
          <div class="flex gap-2">
            ${stream.status !== 'running' ? `
              <button onclick="startStream('${stream.name}')" 
                class="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 transition-colors"
                title="Start Stream">
                <i class="fas fa-play"></i>
              </button>
            ` : `
              <button onclick="stopStream('${stream.name}')" 
                class="bg-yellow-600 text-white px-3 py-2 rounded hover:bg-yellow-700 transition-colors"
                title="Stop Stream">
                <i class="fas fa-pause"></i>
              </button>
            `}
            <button onclick="deleteStream('${stream.name}')" 
              class="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 transition-colors"
              title="Delete Stream">
              <i class="fas fa-trash"></i>
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
        updateSelectAllCheckbox();
      });
    });

    // Update select all checkbox state
    updateSelectAllCheckbox();

  } catch (err) {
    console.error("Refresh failed:", err);
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
document.getElementById('selectAll').addEventListener('change', async (e) => {
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
});

// Apply bulk action
document.getElementById('applyBulkAction').addEventListener('click', async () => {
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

document.getElementById("uploadForm").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  
  // Add visual feedback that upload is in progress
  const submitButton = e.target.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  
  try {
    const res = await fetchWithError("/api/upload", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    console.log("Upload success:", data.streamUrl);
    
    // Show success message
    showError(data.message || "Stream uploaded successfully!");
    
    refresh();
    e.target.reset();
  } catch (err) {
    console.error("Upload failed:", err);
    // Error already shown by fetchWithError
  } finally {
    // Restore button state
    submitButton.disabled = false;
    submitButton.innerHTML = originalText;
  }
});

// Then update stopStream, startStream, deleteStream:
async function stopStream(name) {
  try {
    await fetchWithError(`/api/streams/${name}/stop`, { method: "POST" });
    refresh();
  } catch {}
}

async function startStream(name) {
  try {
    await fetchWithError(`/api/streams/${name}/start`, { method: "POST" });
    refresh();
  } catch {}
}

async function deleteStream(name) {
  try {
    await fetchWithError(`/api/streams/${name}`, { method: "DELETE" });
    refresh();
  } catch {}
}