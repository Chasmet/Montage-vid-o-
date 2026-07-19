const thumbnailCache = new Map();

function thumbnailKey(item) {
  return `${item.type}:${item.mediaId}:${Number(item.start || 0).toFixed(2)}`;
}

function attachThumbnail(target, item) {
  const key = thumbnailKey(item);
  if (thumbnailCache.has(key)) {
    target.style.backgroundImage = `url(${thumbnailCache.get(key)})`;
    return;
  }
  const media = getMediaByRef(item.type, item.mediaId);
  if (!media?.url) return;
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = media.url;
  const cleanup = () => {
    video.removeAttribute('src');
    video.load();
  };
  video.addEventListener('loadedmetadata', () => {
    const targetTime = clamp(item.start || 0, 0, Math.max(0, (video.duration || 0) - 0.05));
    video.currentTime = targetTime;
  }, { once: true });
  video.addEventListener('seeked', () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 136;
      const context = canvas.getContext('2d');
      const vw = video.videoWidth || 240;
      const vh = video.videoHeight || 136;
      const scale = Math.max(canvas.width / vw, canvas.height / vh);
      const width = vw * scale;
      const height = vh * scale;
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      const data = canvas.toDataURL('image/jpeg', 0.7);
      thumbnailCache.set(key, data);
      target.style.backgroundImage = `url(${data})`;
    } catch (error) {
      console.debug('Miniature indisponible', error);
    } finally {
      cleanup();
    }
  }, { once: true });
  video.addEventListener('error', cleanup, { once: true });
}

function timelineClipCard(item) {
  const card = document.createElement('article');
  const width = Math.max(7, segmentDuration(item) * TIMELINE_PX_PER_SECOND);
  card.className = `timeline-clip ${item.type}${state.selectedId === item.id ? ' selected' : ''}`;
  card.style.width = `${width}px`;
  card.dataset.id = item.id;
  card.tabIndex = 0;
  card.draggable = true;

  const type = document.createElement('span');
  type.className = 'clip-type-badge';
  type.textContent = item.type === 'source' ? 'IMPORTÉE' : 'CAMÉRA';
  card.append(type);

  if (item.rotation) {
    const rotation = document.createElement('span');
    rotation.className = 'clip-rotation-badge';
    rotation.textContent = `${item.rotation}°`;
    card.append(rotation);
  }

  const caption = document.createElement('div');
  caption.className = 'clip-caption';
  const label = document.createElement('span');
  label.textContent = item.label;
  const duration = document.createElement('span');
  duration.textContent = `${segmentDuration(item).toFixed(1)}s`;
  caption.append(label, duration);
  card.append(caption);
  attachThumbnail(card, item);

  card.addEventListener('click', () => selectTimelineSegment(item.id, true));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') selectTimelineSegment(item.id, true);
  });
  card.addEventListener('dragstart', () => {
    draggedTimelineId = item.id;
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    draggedTimelineId = null;
    card.classList.remove('dragging');
  });
  card.addEventListener('dragover', (event) => event.preventDefault());
  card.addEventListener('drop', (event) => {
    event.preventDefault();
    moveTimelineSegment(draggedTimelineId, item.id);
  });
  return card;
}

function renderRuler(total) {
  els.timelineRuler.innerHTML = '';
  const width = Math.max(1, total * TIMELINE_PX_PER_SECOND);
  els.timelineRuler.style.width = `${width}px`;
  const step = total > 300 ? 30 : total > 120 ? 15 : total > 45 ? 10 : 5;
  const max = Math.ceil(total / step) * step;
  for (let time = 0; time <= max; time += step) {
    const tick = document.createElement('span');
    tick.className = 'ruler-tick';
    tick.style.left = `${time * TIMELINE_PX_PER_SECOND}px`;
    tick.textContent = formatTime(time);
    els.timelineRuler.append(tick);
  }
}

function renderTimeline() {
  const total = timelineDuration();
  const width = Math.max(1, total * TIMELINE_PX_PER_SECOND);
  els.mainTimeline.innerHTML = '';
  els.mainTimeline.style.width = `${width}px`;
  els.mainTimeline.parentElement.style.width = `${Math.max(width, state.timelineSegments.length ? width : 280)}px`;

  if (!state.timelineSegments.length) {
    const empty = document.createElement('div');
    empty.className = 'timeline-empty';
    empty.textContent = 'Importe une vidéo ou filme avec la caméra';
    els.mainTimeline.append(empty);
  } else {
    state.timelineSegments.forEach((item) => els.mainTimeline.append(timelineClipCard(item)));
  }
  renderRuler(total);
}

function renderTimelineSelection() {
  $$('.timeline-clip').forEach((card) => card.classList.toggle('selected', card.dataset.id === state.selectedId));
  const segment = getSelectedItem();
  els.selectedClipLabel.textContent = segment?.label || 'Aucun clip';
}

function renderInspector() {
  const item = getSelectedItem();
  const controls = [els.volumeRange, els.fitSelect, els.muteToggle, els.splitBtn, els.rotateBtn, els.duplicateBtn, els.deleteClipBtn];
  controls.forEach((control) => { control.disabled = !item; });
  if (!item) {
    els.inspectorTitle.textContent = 'Aucun clip sélectionné';
    return;
  }
  els.inspectorTitle.textContent = item.label || 'Clip sélectionné';
  els.volumeRange.value = String(item.volume ?? 1);
  els.fitSelect.value = item.fit || 'cover';
  els.muteToggle.checked = Boolean(item.muted);
}

function renderAll() {
  renderTimeline();
  renderInspector();
  els.outputAspect.value = state.outputAspect || 'auto';
  els.exportBtn.disabled = !state.timelineSegments.length;
  updateProjectLabels();
  updateUndoRedo();
}

function syncTimelineScrollFromState() {
  if (!els.timelineScroll) return;
  timelineScrollSync = true;
  els.timelineScroll.scrollLeft = state.timelineTime * TIMELINE_PX_PER_SECOND;
  requestAnimationFrame(() => requestAnimationFrame(() => { timelineScrollSync = false; }));
}

function centerSelectedClip() {
  const item = getSelectedItem();
  const time = item ? projectTimeForSegment(item.id) : state.timelineTime;
  setTimelineTime(time, { preview: true, syncScroll: true, select: true, force: true });
}
