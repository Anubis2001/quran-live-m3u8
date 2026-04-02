async function refresh() {
  try {
    const res = await fetch("/api/streams");
    const streams = await res.json();
    const list = document.getElementById("list");
    list.innerHTML = "";

    streams.forEach(stream => {
      const { name, status } = stream;
      const streamUrl = `http://localhost:8300/streams/${name}/stream.m3u8`;

      // Badge color based on status
      let badgeColor = "bg-yellow-500";
      if (status === "running") badgeColor = "bg-green-500";
      if (status === "failed") badgeColor = "bg-red-500";

      const item = document.createElement("li");
      item.className = "bg-gray-50 border rounded p-4 flex justify-between items-center";

      item.innerHTML = `
        <div>
          <div class="text-lg font-bold text-indigo-700">${name}</div>
          <span class="inline-block text-white px-2 py-1 rounded ${badgeColor} text-sm">
            ${status}
          </span><br>
          <a href="${streamUrl}" target="_blank"
            class="text-blue-600 hover:underline">${streamUrl}</a>
        </div>
        <div class="flex gap-2">
          <button onclick="stopStream('${name}')"
            class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">
            <i class="fas fa-stop"></i> Stop
          </button>
          <button onclick="startStream('${name}')"
            class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">
            <i class="fas fa-play"></i> Start
          </button>
          <button onclick="deleteStream('${name}')"
            class="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (err) {
    console.error("Failed to load streams:", err);
  }
}

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

document.getElementById("upload").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await fetch("/api/upload", { method: "POST", body: fd });
  refresh();
};

// Initial load
refresh();