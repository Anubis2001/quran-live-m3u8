async function refresh() {
  const res = await fetch("/api/streams");
  const streams = await res.json();
  const list = document.getElementById("list");
  list.innerHTML = "";

  streams.forEach(name => {
    const item = document.createElement("li");
    item.innerHTML = `
      ${name}
      <button onclick="stop('${name}')">Stop</button>
      <button onclick="start('${name}')">Start</button>
      <button onclick="del('${name}')">Delete</button><br />
      <small>/streams/${name}/stream.m3u8</small>
    `;
    list.appendChild(item);
  });
}

async function stop(name) {
  await fetch(`/api/streams/${name}/stop`, { method: "POST" });
  refresh();
}

async function start(name) {
  await fetch(`/api/streams/${name}/start`, { method: "POST" });
  refresh();
}

async function del(name) {
  await fetch(`/api/streams/${name}`, { method: "DELETE" });
  refresh();
}

document.getElementById("upload").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await fetch("/api/upload", { method: "POST", body: fd });
  refresh();
};

refresh();