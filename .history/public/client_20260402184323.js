let streamsList = [];

// Refresh UI
async function refresh() {
  const res = await fetch("/api/streams");
  const streams = await res.json();
  streamsList = streams; // store for bulk actions

  const list = document.getElementById("list");
  list.innerHTML = "";

  streams.forEach(s => {
    const { name, status } = s;
    const streamUrl = `${location.protocol}//${location.host}/streams/${name}/stream.m3u8`;

    // Determine badge color
    let badgeColor = "bg-yellow-500";
    if (status === "running") badgeColor = "bg-green-500";
    if (status === "failed") badgeColor = "bg-red-500";

    const li = document.createElement("li");
    li.className = "bg-gray-50 border rounded p-4 flex justify-between items-center";

    li.innerHTML = `
      <div class="flex items-center gap-3">
        <input type="checkbox" class="bulk-check" value="${name}" onchange="toggleBulkUI()" />
        <div>
          <div class="text-lg font-semibold text-indigo-700">${name}</div>
          <span class="inline-block text-white px-2 py-1 rounded ${badgeColor} text-sm">${status}</span><br>
          <a href="${streamUrl}" target="_blank" class="text-blue-600 hover:underline">${streamUrl}</a>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="stopStream('${name}')" class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">
          <i class="fas fa-stop"></i> Stop
        </button>
        <button onclick="startStream('${name}')" class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">
          <i class="fas fa-play"></i> Start
        </button>
        <button onclick="deleteStream('${name}')" class="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    `;

    list.appendChild(li);
  });

  toggleBulkUI();
}

// Update bulk actions visibility
function toggleBulkUI() {
  const checked = document.querySelectorAll(".bulk-check:checked");
  const bulkBar = document.getElementById("bulkActions");
  if (streamsList.length > 1 && checked.length > 0) {
    bulkBar.classList.remove("hidden");
  } else {
    bulkBar.classList.add("hidden");
  }
}

// Apply selected bulk action
async function applyBulkAction() {
  const action = document.getElementById("bulkActionSelect").value;
  const checked = [...document.querySelectorAll(".bulk-check:checked")].map(cb => cb.value);

  if (!action || checked.length === 0) return;

  for (const name of checked) {
    if (action === "start") await fetch(`/api/streams/${name}/start`, { method: "POST" });
    if (action === "stop") await fetch(`/api/streams/${name}/stop`, { method: "POST" });
    if (action === "delete") await fetch(`/api/streams/${name}`, { method: "DELETE" });
  }

  refresh();
}

// Individual actions
async function stopStream(name) {
  await fetch(`/api/streams/${name}/stop`, { method: "POST" });
  refresh();
}
async function startStream(name) {
  await fetch(`/api/streams/${name}/start`, { method: "POST" });
  refresh();
}
async function deleteStream(name) {
  await fetch(`/api/streams/${name}`, { method: "DELETE" });
  refresh();
}

document.getElementById("uploadForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await fetch('/api/upload', { method: 'POST', body: fd });
  refresh();
};

refresh();