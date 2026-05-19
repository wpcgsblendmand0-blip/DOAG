const state = {
  currentItem: null,
  queue: [],
  isDownloading: false
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const tabs = $$(".tab");
const singleUrl = $("#singleUrl");
const singlePreview = $("#singlePreview");
const multiUrl = $("#multiUrl");
const queueList = $("#queueList");
const queueCount = $("#queueCount");
const downloadQueueButton = $("#downloadQueueButton");
const toast = $("#toast");

// Limit management
let currentLimit = 100;

function updateLimitDisplay() {
  const format = selectedFormat("queueFormat");
  currentLimit = format === "mp3" ? 100 : 50;
  if (queueCount) queueCount.textContent = `${state.queue.length} / ${currentLimit}`;
  
  if (state.queue.length >= currentLimit) {
    multiUrl.disabled = true;
    multiUrl.placeholder = "Limit reached";
  } else {
    multiUrl.disabled = false;
    multiUrl.placeholder = "Paste link and press Enter...";
  }
}

document.querySelectorAll('input[name="queueFormat"]').forEach(el => {
  el.addEventListener('change', updateLimitDisplay);
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function durationText(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "Unknown";
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function selectedFormat(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "mp3";
}

function parseLinks(text) {
  return text
    .split(/\s+/)
    .map(link => link.trim())
    .filter(Boolean)
    .filter((link, index, list) => list.indexOf(link) === index);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let error = "Request failed.";
    try {
      const body = await response.json();
      error = body.detail || body.error || error;
    } catch {
      error = await response.text();
    }
    throw new Error(error);
  }

  return response;
}

async function fetchMetadata(url) {
  const response = await api("/api/metadata", { url });
  const body = await response.json();
  return body.item;
}

function filenameFromResponse(response, fallback) {
  const header = response.headers.get("content-disposition") || "";
  const utf = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf) return decodeURIComponent(utf[1]);
  const ascii = header.match(/filename="?([^";]+)"?/i);
  return ascii ? ascii[1] : fallback;
}

function browserDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

async function convertAndDownload(item, format) {
  // We only call the API. The server handles saving to DOAG_library... folder.
  // By not calling browserDownload(), we eliminate the "Save As" popup.
  await api("/api/convert", { url: item.url, format });
}

function renderEmpty(status = "Ready", title = "Ready for your link") {
  singlePreview.className = "preview-card empty";
  singlePreview.innerHTML = `
    <div class="empty-state">
      <div class="status-chip">${escapeHtml(status)}</div>
      <h2>${escapeHtml(title)}</h2>
      <p>Paste a link above. I'll automatically fetch the details and clear the input for a faster experience.</p>
    </div>
  `;
}

function renderPreview(item, status = "Fetched") {
  const thumbnail = item.thumbnail
    ? `<img src="${escapeHtml(item.thumbnail)}" alt="">`
    : `<div class="thumb skeleton"></div>`;

  singlePreview.className = "preview-card";
  singlePreview.innerHTML = `
    <div class="thumb">${thumbnail}</div>
    <div class="preview-body">
      <div class="status-chip">${escapeHtml(status)}</div>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.platform)}${item.uploader ? " / " + escapeHtml(item.uploader) : ""} / ${durationText(item.duration)}</p>
      <button class="primary-button" id="singleDownloadButton">Download</button>
    </div>
  `;

  $("#singleDownloadButton").addEventListener("click", downloadSingle);
}

async function previewSingle(url) {
  if (!validateInputUrl(url)) {
    showToast("Enter a valid URL");
    singleUrl.value = "";
    return;
  }
  singleUrl.value = "";
  state.currentItem = null;
  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const waitMsg = isYouTube ? "Fetching from YouTube..." : "Fetching link...";
  renderEmpty("Wait", waitMsg);

  try {
    const response = await api("/api/metadata", { url });
    const body = await response.json();
    
    if (body.exists) {
      renderEmpty("Library", body.message);
      showToast(body.message);
      return;
    }

    state.currentItem = body.item;
    renderPreview(state.currentItem);
  } catch (error) {
    renderEmpty("Error", "Could not fetch link");
    showToast(error.message);
  }
}

async function downloadSingle() {
  if (!state.currentItem || state.isDownloading) return;
  const item = state.currentItem;
  state.isDownloading = true;

  singlePreview.innerHTML = `
    <div class="preview-body" style="width:100%; padding:20px;">
      <div class="status-chip">Process Started</div>
      <h2 style="margin-top:10px">${escapeHtml(item.title)}</h2>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" id="singleProgress" style="width: 5%"></div>
      </div>
      <p style="margin-top:10px; font-size:0.8rem; color:var(--muted)">Saving to your library...</p>
    </div>
  `;

  try {
    const format = selectedFormat("singleFormat");
    await convertAndDownload(item, format);
    const progress = $("#singleProgress");
    if (progress) progress.style.width = "100%";
    
    state.currentItem = null;
    singleUrl.value = "";
    renderEmpty("Ready", "Ready for your link");
    showToast("Successfully saved to library.");
  } catch (error) {
    renderPreview(item, "Failed");
    showToast(error.message);
  } finally {
    state.isDownloading = false;
  }
}

function renderQueue() {
  updateLimitDisplay();
  downloadQueueButton.disabled = state.queue.length === 0 || state.isDownloading;

  if (!state.queue.length) {
    queueList.innerHTML = `<p class="hint">Paste links and press Enter. Each link joins the batch process automatically.</p>`;
    return;
  }

  queueList.innerHTML = state.queue.map((item, index) => {
    const title = item.title || (item.status === "pending" ? "Fetching from YouTube..." : "Processing...");
    const meta = item.platform ? `${item.platform} / ${durationText(item.duration)}` : "Analyzing...";
    const thumb = item.thumbnail
      ? `<img src="${escapeHtml(item.thumbnail)}" class="thumb">`
      : `<div class="thumb skeleton"></div>`;

    return `
      <div class="queue-row ${item.status === "failed" ? "error" : ""} ${item.status === "done" ? "done" : ""}">
        ${thumb}
        <div class="queue-info">
          <h4>${escapeHtml(title)}</h4>
          <p>${escapeHtml(meta)}</p>
        </div>
        <button class="trash-btn" onclick="removeFromQueue(${index})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    `;
  }).join("");
}

window.removeFromQueue = (index) => {
  state.queue.splice(index, 1);
  renderQueue();
};

singleUrl.addEventListener("paste", () => {
  setTimeout(() => {
    if (singleUrl.value.trim()) {
      previewSingle(singleUrl.value.trim());
    }
  }, 50);
});

singleUrl.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (singleUrl.value.trim()) {
      previewSingle(singleUrl.value.trim());
    }
  }
});

multiUrl.addEventListener("paste", () => {
  setTimeout(() => {
    const text = multiUrl.value.trim();
    if (text) {
      multiUrl.value = "";
      addLinksToQueue(text);
    }
  }, 50);
});

multiUrl.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    const text = multiUrl.value.trim();
    if (text) {
      multiUrl.value = "";
      addLinksToQueue(text);
    }
  }
});

function validateInputUrl(url) {
  try {
    const q = new URL(url.trim());
    return ["http:", "https:"].includes(q.protocol);
  } catch {
    return false;
  }
}

async function addLinksToQueue(text) {
  const links = parseLinks(text);
  for (const url of links) {
    if (!validateInputUrl(url)) {
      showToast("Enter a valid URL");
      continue;
    }

    if (state.queue.length >= currentLimit) {
      showToast(`Limit reached (${currentLimit} items)`);
      break;
    }
    
    if (state.queue.some(q => q.url === url)) continue;

    // ADDED: Duplicate check for batch mode
    try {
      const response = await api("/api/metadata", { url });
      const body = await response.json();
      if (body.exists) {
        showToast(`Skipped: Duplicate song found in library`);
        continue;
      }
      
      const item = { ...body.item, status: "ready" };
      state.queue.push(item);
      renderQueue();
    } catch (err) {
      showToast(`Error adding link: ${url.slice(0, 25)}...`);
    }
  }
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabs.forEach(t => t.classList.toggle("active", t === tab));
    $$(".panel").forEach(p => p.classList.toggle("active", p.id === `${target}Panel`));
    
    // iOS Mirror Bar logic
    const mirror = $("#tabMirror");
    mirror.style.width = `${tab.offsetWidth}px`;
    mirror.style.left = `${tab.offsetLeft}px`;

    if (target === 'multi') updateLimitDisplay();
  });
});

// Initial Mirror bar placement
window.addEventListener('load', () => {
    const active = $(".tab.active");
    if (active) {
        const mirror = $("#tabMirror");
        mirror.style.width = `${active.offsetWidth}px`;
        mirror.style.left = `${active.offsetLeft}px`;
    }
});

downloadQueueButton.addEventListener("click", async () => {
  if (state.isDownloading) return;
  state.isDownloading = true;
  downloadQueueButton.disabled = true;

  const format = selectedFormat("queueFormat");
  for (const item of state.queue) {
    if (item.status === "done" || item.status === "failed") continue;

    item.status = "converting";
    renderQueue();

    try {
      await convertAndDownload(item, format);
      item.status = "done";
    } catch (err) {
      item.status = "failed";
    }
    renderQueue();
  }

  state.isDownloading = false;
  downloadQueueButton.disabled = false;
  showToast("Batch processing complete.");
});

updateLimitDisplay();