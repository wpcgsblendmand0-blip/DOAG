const state = {
  tracks: [],
  activeId: null,
  isRefreshing: false,
  pressTimer: null
};

const $ = selector => document.querySelector(selector);
const trackList = $("#trackList");
const searchInput = $("#searchInput");
const audioPlayer = $("#audioPlayer");
const playerContainer = $("#playerContainer");
const playBtn = $("#playPauseButton");
const waveCanvas = $("#waveCanvas");
const ctx = waveCanvas.getContext("2d");
const trackTitle = $("#trackTitle");
const trackMeta = $("#trackMeta");
const playerArt = $("#playerArt");
const currentTimeEl = $("#currentTime");
const durationTimeEl = $("#durationTime");
const volumeSlider = $("#volumeSlider");
const volumeBtn = $(".volume-control svg");
const toast = $("#toast");

let lastVolume = 1;

function updateVolumeSettings() {
  const vol = audioPlayer.volume;
  volumeSlider.value = vol;
  
  // High-end Gradient logic: Black to White
  const percent = vol * 100;
  volumeSlider.style.background = `linear-gradient(to right, #ffffff ${percent}%, #333333 ${percent}%)`;

  // Professional Icon & Line Logic
  if (vol === 0) {
    volumeBtn.style.opacity = "0.5";
    // Muted icon path with a professional cross line
    volumeBtn.innerHTML = `
      <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
      <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
      <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
    `;
  } else {
    volumeBtn.style.opacity = "1";
    // Standard speaker icon
    volumeBtn.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" opacity="${vol > 0.5 ? 1 : 0.5}"></path>
    `;
  }
}

// Helper for rounded industrial bars
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function durationText(seconds) {
  const value = Number(seconds || 0);
  const m = Math.floor(value / 60);
  const s = Math.floor(value % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function loadLibrary() {
  try {
    const response = await fetch("/api/library", { cache: "no-store" });
    const body = await response.json();
    state.tracks = body.items || [];
    renderTracks();
  } catch (err) {
    showToast("Failed to load library");
  }
}

function renderTracks() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = state.tracks.filter(t => 
    t.title.toLowerCase().includes(query) || 
    (t.uploader && t.uploader.toLowerCase().includes(query))
  );

  if (visible.length === 0) {
    trackList.innerHTML = `<div class="info-box">No songs found</div>`;
    return;
  }

  trackList.innerHTML = visible.map(track => {
    const active = state.activeId === track.filename;
    const thumb = track.thumbnail 
      ? `<img src="${track.thumbnail}" class="square-thumb">` 
      : `<div class="square-thumb placeholder">D</div>`;
      
    return `
      <div class="track-row ${active ? 'active' : ''}" data-id="${track.filename}">
        ${thumb}
        <div class="track-info">
          <h3>${track.title}</h3>
          <p>${track.uploader || 'Audio'} • ${durationText(track.duration)}</p>
        </div>
        <div class="track-actions">
          <button class="action-btn share" onclick="event.stopPropagation(); shareTrack('${track.filename}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
          </button>
          <button class="action-btn delete" onclick="event.stopPropagation(); deleteTrack('${track.filename}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".track-row").forEach(row => {
    row.addEventListener("click", () => playTrack(row.dataset.id));
  });
}

window.shareTrack = async (filename) => {
  const track = state.tracks.find(t => t.filename === filename);
  if (!track) return;
  try {
    await navigator.share({
      title: track.title,
      text: `Listen to ${track.title} on DOAG Link`,
      url: window.location.origin + track.fileUrl
    });
  } catch (err) {
    showToast("Share failed");
  }
};

async function deleteTrack(filename) {
  try {
    if (!confirm("Permanently delete this song?")) return;
    
    const res = await fetch(`/api/library/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    
    if (res.ok) {
      showToast("Deleted successfully");
      state.tracks = state.tracks.filter(t => t.filename !== filename);
      renderTracks();
      if (state.activeId === filename) {
        audioPlayer.pause();
        playerContainer.style.display = 'none';
      }
    } else {
      showToast("Delete failed");
    }
  } catch (err) {
    showToast("Delete failed");
  }
}

async function playTrack(filename) {
  const track = state.tracks.find(t => t.filename === filename);
  if (!track) return;

  state.activeId = filename;
  renderTracks();

  playerContainer.style.display = 'block';
  playerArt.innerHTML = track.thumbnail 
    ? `<img src="${track.thumbnail}" class="square-thumb">` 
    : `<div class="square-thumb placeholder">D</div>`;
  trackTitle.textContent = track.title;
  trackMeta.textContent = `${track.uploader || 'Audio'} • ${durationText(track.duration)}`;
  
  audioPlayer.src = track.fileUrl;
  audioPlayer.play();
  playBtn.textContent = "⏸";
  
  // Start Waveform visualization
  startWaveform();
}

playBtn.addEventListener("click", () => {
  if (audioPlayer.paused) {
    audioPlayer.play();
    playBtn.textContent = "⏸";
  } else {
    audioPlayer.pause();
    playBtn.textContent = "▶";
  }
});

function startWaveform() {
  const bars = 120;
  const barWidth = waveCanvas.width / bars;
  const centerY = waveCanvas.height / 2;
  
  function draw() {
    ctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    
    const progress = audioPlayer.currentTime / audioPlayer.duration || 0;
    const playheadX = progress * waveCanvas.width;

    for (let i = 0; i < bars; i++) {
        const x = i * barWidth;
        const h = 35 + Math.sin(i * 0.18) * 22 + Math.cos(i * 0.45) * 12;
        const radius = 3; // Curved corners for the bars
        const spacing = 1.5; // Fixed space between bars
        
        // PIXEL-PERFECT SUB-BAR INVERSION LOGIC
        // Draw the basic bar (Upcoming: White to Black)
        const gradBase = ctx.createLinearGradient(0, centerY - h/2, 0, centerY + h/2);
        gradBase.addColorStop(0, "#ffffff");
        gradBase.addColorStop(0.5, "#888888");
        gradBase.addColorStop(1, "#000000");
        
        ctx.fillStyle = gradBase;
        drawRoundedRect(ctx, x, centerY - (h / 2), barWidth - spacing, h, radius);

        // Sub-pixel clip logic for inversion
        if (playheadX > x) {
          const clipWidth = Math.min(barWidth - spacing, playheadX - x);
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, centerY - (h / 2), clipWidth, h);
          ctx.clip();
          
          const gradInv = ctx.createLinearGradient(0, centerY - h/2, 0, centerY + h/2);
          gradInv.addColorStop(0, "#000000");
          gradInv.addColorStop(0.5, "#888888");
          gradInv.addColorStop(1, "#ffffff");
          
          ctx.fillStyle = gradInv;
          drawRoundedRect(ctx, x, centerY - (h / 2), barWidth - spacing, h, radius);
          ctx.restore();
        }
    }
    
    // SMOOTH FLOWING LINE
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(playheadX - 1, 0, 2, waveCanvas.height);
    ctx.shadowBlur = 0;
    
    if (!audioPlayer.paused) {
      requestAnimationFrame(draw);
    }
  }
  
  draw();
  audioPlayer.onplay = () => requestAnimationFrame(draw);
  audioPlayer.ontimeupdate = () => { if(audioPlayer.paused) draw(); };
}

audioPlayer.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = durationText(audioPlayer.currentTime);
  durationTimeEl.textContent = durationText(audioPlayer.duration);
});

volumeSlider.addEventListener("input", (e) => {
  audioPlayer.volume = e.target.value;
  updateVolumeSettings();
});

volumeBtn.addEventListener("click", () => {
  if (audioPlayer.volume > 0) {
    lastVolume = audioPlayer.volume;
    audioPlayer.volume = 0;
  } else {
    audioPlayer.volume = lastVolume || 1;
  }
  updateVolumeSettings();
});

function updateVolumeIcon(vol) {
  updateVolumeSettings();
}

function updateVolumeSettings() {
  const vol = audioPlayer.volume;
  const percent = vol * 100;
  
  // Track visual: white fill, black background
  volumeSlider.style.background = `linear-gradient(to right, #ffffff ${percent}%, #333333 ${percent}%)`;
  volumeSlider.value = vol;

  if (vol === 0) {
    volumeBtn.style.opacity = "0.4";
    // Industrial Cross-Line (X) indicator
    volumeBtn.innerHTML = `
      <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
      <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"></line>
      <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"></line>
    `;
  } else {
    volumeBtn.style.opacity = "1";
    volumeBtn.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  }
}

searchInput.addEventListener("input", renderTracks);

// Auto load
loadLibrary();
updateVolumeSettings();
