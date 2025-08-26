// Optimized Video Editor Logic
// Sections: Variables, Utility Functions, Draw Logic, Event Listeners

// Variables
const videoEl = document.getElementById('videoEl');
const audioEl = document.getElementById('audioEl');
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const reverseBtn = document.getElementById('reverseBtn');
const exportBtn = document.getElementById('exportBtn');
const inRange = document.getElementById('inRange');
const outRange = document.getElementById('outRange');
const seekRange = document.getElementById('seekRange');
const timeLabel = document.getElementById('timeLabel');
const durLabel = document.getElementById('durLabel');
const videoInput = document.getElementById('videoInput');
const audioInput = document.getElementById('audioInput');
const imageInput = document.getElementById('imageInput');
const textInputFile = document.getElementById('textInputFile');
const itemsContainer = document.getElementById('itemsContainer');
const textInput = document.getElementById('textInput');
const addTextBtn = document.getElementById('addTextBtn');
const textColor = document.getElementById('textColor');
const textSize = document.getElementById('textSize');
const grayscaleBtn = document.getElementById('grayscaleBtn');
const sepiaBtn = document.getElementById('sepiaBtn');
const cropX = document.getElementById('cropX');
const cropY = document.getElementById('cropY');
const cropW = document.getElementById('cropW');
const cropH = document.getElementById('cropH');
const applyCropBtn = document.getElementById('applyCropBtn');
const playbackSpeed = document.getElementById('playbackSpeed');
const audioVol = document.getElementById('audioVol');
const clearAllBtn = document.getElementById('clearAllBtn');

let videoLoaded = false;
let playing = false;
let rafId = null;
let trimIn = 0, trimOut = 0;
let overlays = []; // {id, type, text/img/videoEl, x, y, width, height, opacity, color, size, startTime, endTime}
let subtitles = []; // {text, start, end}
let dragging = null;
let filter = 'none';
let crop = {x: 0, y: 0, w: 1280, h: 720};
let reverse = false;
//
//// Add UI for overlay mode selection
//const overlayControls = document.createElement('div');
//overlayControls.className = 'form-group';
//overlayControls.innerHTML = `
//  <label for="addMode">Add as:</label>
//  <select id="addMode">
//    <option value="main">Main Video</option>
//    <option value="overlay">Overlay</option>
//  </select>
//  <label for="startTime">Start Time:</label>
//  <input type="number" id="startTime" min="0" value="0" step="0.5">
//  <label for="endTime">End Time:</label>
//  <input type="number" id="endTime" min="0" value="10" step="0.5">
//`;
//document.querySelector('.media-list').insertBefore(overlayControls, videoInput.parentElement.nextSibling);
let layers = []; // Will store all our media elements
let selectedLayer = null;
let transformHandles = [];
const layersPanel = document.getElementById('layersPanel');
const propertiesPanel = document.getElementById('propertiesPanel');
const posX = document.getElementById('posX');
const posY = document.getElementById('posY');
const elementWidth = document.getElementById('elementWidth');
const elementHeight = document.getElementById('elementHeight');
const elementOpacity = document.getElementById('elementOpacity');
const deleteElementBtn = document.getElementById('deleteElementBtn');

// Function to create a unique ID for each layer
function generateId() {
  return '_' + Math.random().toString(36).substr(2, 9);
}

// Utility Functions
function addMediaItem(name, type) {
  const div = document.createElement('div');
  div.className = 'media-item';
  div.innerHTML = `<i class="fas fa-${type === 'video' ? 'film' : type === 'video-overlay' ? 'layer-group' : type === 'audio' ? 'music' : type === 'image' ? 'image' : 'file-alt'}"></i> <strong>${name}</strong><br><small>${type}</small>`;
  itemsContainer.appendChild(div);
}

function parseTime(str) {
  const [h, m, s] = str.split(/[:,]/).map(parseFloat);
  return h * 3600 + m * 60 + s;
}

function updateTimeLabel(time) {
  const s = Math.floor(time);
  timeLabel.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Function to add a layer to the panel
function addLayerToPanel(layer) {
  const layerItem = document.createElement('div');
  layerItem.className = 'layer-item';
  layerItem.dataset.id = layer.id;

  let icon = 'file-alt';
  if (layer.type === 'video') icon = 'film';
  else if (layer.type === 'image') icon = 'image';
  else if (layer.type === 'text') icon = 'font';

  layerItem.innerHTML = `
    <div class="layer-icon"><i class="fas fa-${icon}"></i></div>
    <div class="layer-name">${layer.name || 'Unnamed'}</div>
    <div class="layer-controls">
      <i class="fas fa-eye" title="Toggle visibility"></i>
      <i class="fas fa-arrow-up" title="Move up"></i>
      <i class="fas fa-arrow-down" title="Move down"></i>
    </div>
  `;

  layerItem.addEventListener('click', () => selectLayer(layer));
  layersPanel.insertBefore(layerItem, layersPanel.firstChild);

  // Add event listeners for controls
  const visibility = layerItem.querySelector('.fa-eye');
  visibility.addEventListener('click', (e) => {
    e.stopPropagation();
    layer.hidden = !layer.hidden;
    visibility.classList.toggle('fa-eye');
    visibility.classList.toggle('fa-eye-slash');
    drawFrame();
  });

  const moveUp = layerItem.querySelector('.fa-arrow-up');
  moveUp.addEventListener('click', (e) => {
    e.stopPropagation();
    moveLayerUp(layer.id);
  });

  const moveDown = layerItem.querySelector('.fa-arrow-down');
  moveDown.addEventListener('click', (e) => {
    e.stopPropagation();
    moveLayerDown(layer.id);
  });
}

// Layer selection
function selectLayer(layer) {
  selectedLayer = layer;

  // Update UI to show this layer is selected
  document.querySelectorAll('.layer-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.id === layer.id) {
      item.classList.add('active');
    }
  });

  // Update properties panel
  updatePropertiesPanel();

  // Show transform handles
  showTransformHandles();

  drawFrame();
}

// Update properties panel when layer selected
function updatePropertiesPanel() {
  if (!selectedLayer) return;

  const rect = canvas.getBoundingClientRect();
  posX.value = Math.round(selectedLayer.x * rect.width);
  posY.value = Math.round(selectedLayer.y * rect.height);

  if (selectedLayer.width !== undefined) {
    elementWidth.value = Math.round(selectedLayer.width * rect.width);
    elementHeight.value = Math.round(selectedLayer.height * rect.height);
  }

  elementOpacity.value = selectedLayer.opacity !== undefined ? selectedLayer.opacity : 1;
}

// Show transform handles for selected element
function showTransformHandles() {
  // Remove existing handles
  transformHandles.forEach(handle => handle.remove());
  transformHandles = [];

  if (!selectedLayer || selectedLayer.type === 'text') return;

  const rect = canvas.getBoundingClientRect();
  const canvasContainer = canvas.parentElement;

  // Create resize handle
  const handle = document.createElement('div');
  handle.className = 'transform-handle';
  handle.style.cursor = 'nwse-resize';
  handle.style.bottom = '0';
  handle.style.right = '0';
  handle.style.transform = 'translate(50%, 50%)';

  // Position the handle
  updateHandlePosition();

  // Make handle draggable
  handle.addEventListener('mousedown', startResize);

  canvasContainer.appendChild(handle);
  transformHandles.push(handle);

  function updateHandlePosition() {
    if (!selectedLayer) return;
    const x = selectedLayer.x * rect.width;
    const y = selectedLayer.y * rect.height;
    const w = selectedLayer.width * rect.width;
    const h = selectedLayer.height * rect.height;

    handle.style.left = (x + w) + 'px';
    handle.style.top = (y + h) + 'px';
  }

  function startResize(e) {
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = selectedLayer.width * rect.width;
    const startHeight = selectedLayer.height * rect.height;

    function doResize(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newWidth = Math.max(20, startWidth + dx) / rect.width;
      const newHeight = Math.max(20, startHeight + dy) / rect.height;

      selectedLayer.width = newWidth;
      selectedLayer.height = newHeight;

      updateHandlePosition();
      updatePropertiesPanel();
      drawFrame();
    }

    function stopResize() {
      window.removeEventListener('mousemove', doResize);
      window.removeEventListener('mouseup', stopResize);
    }

    window.addEventListener('mousemove', doResize);
    window.addEventListener('mouseup', stopResize);
  }
}

// Functions to reorder layers
function moveLayerUp(id) {
  const index = overlays.findIndex(o => o.id === id);
  if (index >= overlays.length - 1) return;

  // Swap in overlays array
  [overlays[index], overlays[index + 1]] = [overlays[index + 1], overlays[index]];

  // Update UI
  const layerItem = document.querySelector(`.layer-item[data-id="${id}"]`);
  const prevItem = layerItem.previousElementSibling;
  if (prevItem) {
    layersPanel.insertBefore(layerItem, prevItem);
  }

  drawFrame();
}

function moveLayerDown(id) {
  const index = overlays.findIndex(o => o.id === id);
  if (index <= 0) return;

  // Swap in overlays array
  [overlays[index], overlays[index - 1]] = [overlays[index - 1], overlays[index]];

  // Update UI
  const layerItem = document.querySelector(`.layer-item[data-id="${id}"]`);
  const nextItem = layerItem.nextElementSibling;
  if (nextItem && nextItem.nextElementSibling) {
    layersPanel.insertBefore(layerItem, nextItem.nextElementSibling);
  } else {
    layersPanel.appendChild(layerItem);
  }

  drawFrame();
}

// Draw Frame (Optimized: Clear once, draw in batch, RAF only when playing)
function drawFrame() {
  try {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = filter;

    if (videoLoaded && videoEl.readyState >= 3) { // HAVE_FUTURE_DATA
      ctx.drawImage(videoEl, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.filter = 'none';

    const currentTime = videoEl.currentTime;

    // Batch draw overlays
    overlays.forEach(o => {
      // Skip if hidden or outside time range
      if (o.hidden || (o.startTime !== undefined && (currentTime < o.startTime || currentTime > o.endTime))) {
        return;
      }

      // Set opacity
      ctx.globalAlpha = o.opacity !== undefined ? o.opacity : 1;

      if (o.type === 'text') {
        ctx.font = `${o.size}px Inter`;
        ctx.fillStyle = o.color || '#fff';
        ctx.fillText(o.text, o.x * rect.width, o.y * rect.height);
        if (selectedLayer === o) {
          const textWidth = ctx.measureText(o.text).width;
          ctx.strokeStyle = '#06B6D4';
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x * rect.width, o.y * rect.height - o.size, textWidth, o.size * 1.2);
        }
      } else if (o.type === 'image') {
        ctx.drawImage(o.img, o.x * rect.width, o.y * rect.height, o.width * rect.width, o.height * rect.height);
        if (selectedLayer === o) {
          ctx.strokeStyle = '#06B6D4';
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x * rect.width, o.y * rect.height, o.width * rect.width, o.height * rect.height);
        }
      } else if (o.type === 'video' && o.videoEl.readyState >= 3) {
        // Keep overlay videos synchronized with main timeline
        if (playing) {
          if (o.videoEl.paused) o.videoEl.play().catch(e => console.log('Overlay video play error:', e));
          o.videoEl.currentTime = currentTime - o.startTime; // Synchronize with main video
        }

        ctx.drawImage(o.videoEl, 0, 0, o.videoEl.videoWidth, o.videoEl.videoHeight,
                     o.x * rect.width, o.y * rect.height, o.width * rect.width, o.height * rect.height);

        if (selectedLayer === o) {
          ctx.strokeStyle = '#06B6D4';
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x * rect.width, o.y * rect.height, o.width * rect.width, o.height * rect.height);
        }
      }

      // Reset opacity
      ctx.globalAlpha = 1;
    });

    // Draw subtitles if in time
    subtitles.forEach(s => {
      if (currentTime >= s.start && currentTime <= s.end) {
        ctx.font = '24px Inter';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(s.text, rect.width / 2, rect.height - 30);
      }
    });

    updateTimeLabel(currentTime);

    if (playing) rafId = requestAnimationFrame(drawFrame);
  } catch (e) {
    console.error('Draw error:', e);
  }
}

// Event Listeners
videoInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const addMode = document.getElementById('addMode').value;
  const layerId = generateId();

  if (addMode === 'main') {
    // Original behavior - set as main video
    videoEl.src = url;
    videoEl.load();
    videoEl.addEventListener('loadedmetadata', () => {
      videoLoaded = true;
      trimIn = 0;
      trimOut = videoEl.duration;
      inRange.min = seekRange.min = 0;
      inRange.max = outRange.max = seekRange.max = videoEl.duration;
      inRange.value = 0;
      outRange.value = seekRange.value = videoEl.duration;
      durLabel.textContent = Math.round(videoEl.duration) + 's';
      addMediaItem(file.name, 'video');
      videoEl.currentTime = 0;
    }, {once: true});
    videoEl.addEventListener('canplaythrough', () => {
      drawFrame();
    }, {once: true});
  } else {
    // New behavior - add as video overlay
    const startTime = parseFloat(document.getElementById('startTime').value) || 0;
    const endTime = parseFloat(document.getElementById('endTime').value) || 10;

    const overlayVideo = document.createElement('video');
    overlayVideo.src = url;
    overlayVideo.load();
    overlayVideo.muted = true; // Often you want overlay videos muted

    overlayVideo.addEventListener('loadedmetadata', () => {
      const newOverlay = {
        id: layerId,
        type: 'video',
        videoEl: overlayVideo,
        name: file.name,
        x: 0.1,
        y: 0.1,
        width: 0.4,
        height: 0.3,
        opacity: 1,
        startTime: startTime,
        endTime: Math.min(endTime, videoEl.duration || 100)
      };

      overlays.push(newOverlay);
      layers.push(newOverlay);
      addLayerToPanel(newOverlay);
      selectLayer(newOverlay);
      drawFrame();
    }, {once: true});
  }
  videoEl.addEventListener('error', () => alert('Video load error: Check format or size.'));
});

audioInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  audioEl.src = URL.createObjectURL(file);
  audioEl.load();
  addMediaItem(file.name, 'audio');
  audioEl.addEventListener('error', () => alert('Audio load error: Check format or size.'));
});

imageInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  const layerId = generateId();

  img.onload = () => {
    const startTime = parseFloat(document.getElementById('startTime').value) || 0;
    const endTime = parseFloat(document.getElementById('endTime').value) || 100;

    const newOverlay = {
      id: layerId,
      type: 'image',
      img,
      name: file.name,
      x: 0.1,
      y: 0.1,
      width: img.width / canvas.width * 0.5,
      height: img.height / canvas.height * 0.5,
      opacity: 1,
      startTime: startTime,
      endTime: endTime
    };

    overlays.push(newOverlay);
    layers.push(newOverlay);
    addLayerToPanel(newOverlay);
    selectLayer(newOverlay);
    drawFrame();
  };
  img.onerror = () => alert('Image load error: Check format or size.');
});

textInputFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      if (file.name.endsWith('.srt')) {
        const lines = evt.target.result.split('\n');
        let i = 0;
        while (i < lines.length) {
          if (!lines[i].trim()) { i++; continue; }
          i++; // Skip ID
          const time = lines[i++].split(' --> ');
          const start = parseTime(time[0]);
          const end = parseTime(time[1]);
          let text = '';
          while (i < lines.length && lines[i].trim()) text += lines[i++] + '\n';
          subtitles.push({text: text.trim(), start, end});
        }
      } else {
        const startTime = parseFloat(document.getElementById('startTime').value) || 0;
        const endTime = parseFloat(document.getElementById('endTime').value) || 100;

        const lines = evt.target.result.split('\n');
        let lastOverlay = null;
        lines.forEach((line, idx) => {
          if (line.trim()) {
            const layerId = generateId();
            const newOverlay = {
              id: layerId,
              type: 'text',
              text: line.trim(),
              name: line.trim().substring(0, 15) + (line.trim().length > 15 ? '...' : ''),
              x: 0.05,
              y: 0.8 + idx * 0.05,
              opacity: 1,
              color: '#fff',
              size: 24,
              startTime: startTime,
              endTime: endTime
            };
            overlays.push(newOverlay);
            layers.push(newOverlay);
            addLayerToPanel(newOverlay);
            lastOverlay = newOverlay;
          }
        });
        if (lastOverlay) selectLayer(lastOverlay);
      }
      addMediaItem(file.name, 'text');
      drawFrame();
    } catch (e) {
      alert('Text file parse error: Check SRT/TXT format.');
    }
  };
  reader.readAsText(file);
  reader.onerror = () => alert('Text file read error.');
});

playBtn.addEventListener('click', () => {
  if (!videoLoaded) return alert('Upload a video first.');
  videoEl.play().catch(e => console.error('Play error:', e));
  if (audioEl.src) audioEl.play();

  // Play all video overlays
  overlays.forEach(o => {
    if (o.type === 'video' && videoEl.currentTime >= o.startTime && videoEl.currentTime <= o.endTime) {
      o.videoEl.currentTime = videoEl.currentTime - o.startTime;
      o.videoEl.play().catch(e => console.log('Overlay video play error:', e));
    }
  });

  playing = true;
  drawFrame();
});

pauseBtn.addEventListener('click', () => {
  videoEl.pause();
  if (audioEl.src) audioEl.pause();

  // Pause all video overlays
  overlays.forEach(o => {
    if (o.type === 'video') o.videoEl.pause();
  });

  playing = false;
  cancelAnimationFrame(rafId);
});

stopBtn.addEventListener('click', () => {
  videoEl.pause();
  videoEl.currentTime = trimIn;
  if (audioEl.src) audioEl.pause();

  // Reset all video overlays
  overlays.forEach(o => {
    if (o.type === 'video') {
      o.videoEl.pause();
      o.videoEl.currentTime = 0;
    }
  });

  playing = false;
  cancelAnimationFrame(rafId);
  drawFrame();
});

reverseBtn.addEventListener('click', () => {
  reverse = !reverse;
  videoEl.playbackRate = reverse ? -parseFloat(playbackSpeed.value) : parseFloat(playbackSpeed.value);
  if (playing) drawFrame();
});

exportBtn.addEventListener('click', () => {
  if (!videoLoaded || !canvas.captureStream) return alert('Export not supported or no video loaded.');
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, {type: 'video/webm'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.webm';
    a.click();
    URL.revokeObjectURL(url);
  };
  recorder.start();
  setTimeout(() => recorder.stop(), (trimOut - trimIn) * 1000);
});

inRange.addEventListener('input', () => {
  trimIn = parseFloat(inRange.value);
  videoEl.currentTime = trimIn;
  drawFrame();
});

outRange.addEventListener('input', () => {
  trimOut = parseFloat(outRange.value);
  durLabel.textContent = Math.round(trimOut - trimIn) + 's';
  drawFrame();
});

seekRange.addEventListener('input', () => {
  videoEl.currentTime = parseFloat(seekRange.value);
  drawFrame();
});

addTextBtn.addEventListener('click', () => {
  const text = textInput.value.trim();
  if (!text) return;
  const startTime = parseFloat(document.getElementById('startTime').value) || 0;
  const endTime = parseFloat(document.getElementById('endTime').value) || 100;
  const layerId = generateId();

  const newOverlay = {
    id: layerId,
    type: 'text',
    text,
    name: text.substring(0, 15) + (text.length > 15 ? '...' : ''),
    x: 0.05,
    y: 0.05,
    opacity: 1,
    color: textColor.value,
    size: parseInt(textSize.value) || 36,
    startTime: startTime,
    endTime: endTime
  };

  overlays.push(newOverlay);
  layers.push(newOverlay);
  addLayerToPanel(newOverlay);
  selectLayer(newOverlay);
  textInput.value = '';
  drawFrame();
});

grayscaleBtn.addEventListener('click', () => {
  filter = 'grayscale(100%)';
  drawFrame();
});

sepiaBtn.addEventListener('click', () => {
  filter = 'sepia(100%)';
  drawFrame();
});

applyCropBtn.addEventListener('click', () => {
  crop = {x: parseFloat(cropX.value) || 0, y: parseFloat(cropY.value) || 0, w: parseFloat(cropW.value) || 1280, h: parseFloat(cropH.value) || 720};
  drawFrame();
});

playbackSpeed.addEventListener('input', () => {
  videoEl.playbackRate = reverse ? -parseFloat(playbackSpeed.value) : parseFloat(playbackSpeed.value);
});

audioVol.addEventListener('input', () => {
  audioEl.volume = parseFloat(audioVol.value);
});

clearAllBtn.addEventListener('click', () => {
  overlays = [];
  subtitles = [];
  layers = [];
  layersPanel.innerHTML = '';
  selectedLayer = null;
  showTransformHandles();
  filter = 'none';
  crop = {x: 0, y: 0, w: 1280, h: 720};
  drawFrame();
});

// Property panel event listeners
posX.addEventListener('change', () => {
  if (!selectedLayer) return;
  const rect = canvas.getBoundingClientRect();
  selectedLayer.x = parseInt(posX.value) / rect.width;
  showTransformHandles();
  drawFrame();
});

posY.addEventListener('change', () => {
  if (!selectedLayer) return;
  const rect = canvas.getBoundingClientRect();
  selectedLayer.y = parseInt(posY.value) / rect.height;
  showTransformHandles();
  drawFrame();
});

elementWidth.addEventListener('change', () => {
  if (!selectedLayer || selectedLayer.width === undefined) return;
  const rect = canvas.getBoundingClientRect();
  selectedLayer.width = parseInt(elementWidth.value) / rect.width;
  showTransformHandles();
  drawFrame();
});

elementHeight.addEventListener('change', () => {
  if (!selectedLayer || selectedLayer.height === undefined) return;
  const rect = canvas.getBoundingClientRect();
  selectedLayer.height = parseInt(elementHeight.value) / rect.height;
  showTransformHandles();
  drawFrame();
});

elementOpacity.addEventListener('input', () => {
  if (!selectedLayer) return;
  selectedLayer.opacity = parseFloat(elementOpacity.value);
  drawFrame();
});

deleteElementBtn.addEventListener('click', () => {
  if (!selectedLayer) return;

  // Remove from overlays and layers
  overlays = overlays.filter(o => o.id !== selectedLayer.id);
  layers = layers.filter(l => l.id !== selectedLayer.id);

  // Remove from UI
  const layerItem = document.querySelector(`.layer-item[data-id="${selectedLayer.id}"]`);
  if (layerItem) layerItem.remove();

  selectedLayer = null;
  showTransformHandles();
  drawFrame();
});

// Drag and Select on canvas
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width;
  const cy = (e.clientY - rect.top) / rect.height;
  const currentTime = videoEl.currentTime;

  for (let i = overlays.length - 1; i >= 0; i--) {
    const o = overlays[i];
    if (o.hidden || (o.startTime !== undefined && (currentTime < o.startTime || currentTime > o.endTime))) continue;

    if (o.type === 'text') {
      ctx.font = `${o.size}px Inter`;
      const textWidth = ctx.measureText(o.text).width / rect.width;
      const ox = o.x;
      const oy = o.y - (o.size / rect.height);
      const ow = textWidth;
      const oh = (o.size * 1.2) / rect.height;
      if (cx > ox && cx < ox + ow && cy > oy && cy < oy + oh) {
        selectLayer(o);
        dragging = o;
        o.offsetX = cx - o.x;
        o.offsetY = cy - o.y;
        return;
      }
    } else if (o.type === 'image' || o.type === 'video') {
      const ox = o.x, oy = o.y, ow = o.width, oh = o.height;
      if (cx > ox && cx < ox + ow && cy > oy && cy < oy + oh) {
        selectLayer(o);
        dragging = o;
        o.offsetX = cx - o.x;
        o.offsetY = cy - o.y;
        return;
      }
    }
  }
});

window.addEventListener('mousemove', e => {
  if (dragging) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    dragging.x = cx - dragging.offsetX;
    dragging.y = cy - dragging.offsetY;
    updatePropertiesPanel();
    showTransformHandles();
    drawFrame();
  }
});

window.addEventListener('mouseup', () => {
  dragging = null;
});

// Initial draw loop start
drawFrame();
videoEl.addEventListener('timeupdate', () => {
  if (playing) drawFrame();
});