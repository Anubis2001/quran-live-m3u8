function showError(message) {
  const container = document.getElementById("errorContainer");
  const text = document.getElementById("errorText");
  text.textContent = message;
  container.classList.remove("hidden");
  setTimeout(() => container.classList.add("hidden"), 8000);
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
    streamsList = streams;

    const list = document.getElementById("list");
    list.innerHTML = "";
    // … rest of your UI rendering code …
  } catch (err) {
    console.error("Refresh failed:", err);
  }
}

document.getElementById("uploadForm").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await fetchWithError("/api/upload", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    console.log("Upload success:", data.streamUrl);
    refresh();
    e.target.reset();
  } catch (err) {
    console.error("Upload failed:", err);
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