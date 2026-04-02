let streamsList = [];

async function refresh() {
  const res = await fetch("/api/streams");
  const streams = await res.json();
  streamsList = streams;

  const list = document.getElementById("list");
  list.innerHTML = "";

  streams.forEach(s => {
    const url = `${location.protocol}//${location.host}/streams/${s.name}/stream.m3u8`;
    let color = "bg-yellow-500";
    if (s.status === "running") color = "bg-green-500";
    if (s.status === "failed") color = "bg-red-500";

    const li = document.createElement("li");
    li.className = "bg-gray-50 border rounded p-4 flex justify-between items-center";

    li.innerHTML = `
      <div class="flex items-center gap-3">
        <input type="checkbox" class="bulk-check" value="${s.name}" onchange="toggleBulkUI()" />
        <div>
          <div class="text-indigo-700 font-semibold">${s.name}</div>
          <span class="inline-block text-white px-2 py-1 rounded ${color} text-sm">${s.status}</span><br>
          <a href="${url}" target="_blank" class="text-blue-600 hover:underline">${url}</a>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="stopStream('${s.name}')" class="bg-red-500 text-white px-3 py-1 rounded">Stop</button>
        <button onclick="startStream('${s.name}')" class="bg-green-500 text-white px-3 py-1 rounded">Start</button>
        <button onclick="deleteStream('${s.name}')" class="bg-gray-600 text-white px-3 py-1 rounded">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  toggleBulkUI();
}

function toggleBulkUI() {
  const checked = document.querySelectorAll(".bulk-check:checked").length;
  const bar = document.getElementById("bulkActions");
  bar.classList.toggle("hidden", !(streamsList.length > 1 && checked > 0));
}

async function applyBulkAction() {
  const act = document.getElementById("bulkActionSelect").value;
  const checked = [...document.querySelectorAll(".bulk-check:checked")].map(cb => cb.value);
  if (!act || !checked.length) return;
  for (const name of checked) {
    if (act === "start") await fetch(`/api/streams/${name}/start`, { method: "POST" });
    if (act === "stop") await fetch(`/api/streams/${name}/stop`, { method: "POST" });
    if (act === "delete") await fetch(`/api/streams/${name}`, { method: "DELETE" });
  }
  refresh();
}

async function stopStream(n) { await fetch(`/api/streams/${n}/stop`, { method: "POST" }); refresh(); }
async function startStream(n) { await fetch(`/api/streams/${n}/start`, { method: "POST" }); refresh(); }
async function deleteStream(n) { await fetch(`/api/streams/${n}`, { method: "DELETE" }); refresh(); }

document.getElementById("uploadForm")?.addEventListener("submit", async e => {
  e.preventDefault(); 
  await fetch("/api/upload", { method: "POST", body: new FormData(e.target) });
  refresh();
});

refresh();