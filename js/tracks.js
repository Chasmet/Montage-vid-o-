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
      const data = canvas.toDataURL('image/jpeg', 0.68);
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

function clipCard(item, collection, index = 0) {
  const card = document.createElement('article');
  card.className = `clip-card${state.selected?.collection === collection && state.selected?.id === item.id ? ' selected' : ''}`;
  card.dataset.id = item.id;
  card.dataset.collection = collection;
  card.tabIndex = 0;
  if (collection === 'finalSegments') {
    card.draggable = true;
    const order = document.createElement('span');
    order.className = 'clip-order';
    order.textContent = String(index + 1);
    card.append(order);
  }
  const thumb = document.createElement('div');
  thumb.className = 'clip-thumb';
  attachThumbnail(thumb, item);
  const top = document.createElement('div');
  top.className = 'clip-top';
  const type = document.createElement('span');
  type.className = 'clip-type';
  type.textContent = item.type === 'source' ? 'IMPORTÉE' : 'CAMÉRA';
  const duration = document.createElement('span');
  duration.className = 'clip-duration';
  duration.textContent = `${(item.end - item.start).toFixed(1)} s`;
  top.append(type, duration);
  const title = document.createElement('div');
  title.className = 'clip-title';
  title.textContent = item.label;
  const times = document.createElement('div');
  times.className = 'clip-times';
  times.textContent = `${formatTime(item.start, true)} → ${formatTime(item.end, true)}`;
  card.append(thumb, top, title, times);
  card.addEventListener('click', () => selectItem(collection, item.id));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') selectItem(collection, item.id);
  });
  if (collection === 'sourceSegments') {
    card.addEventListener('dblclick', () => addExistingSegmentToFinal(collection, item.id));
  } else if (collection === 'finalSegments') {
    card.addEventListener('dragstart', () => {
      draggedFinalId = item.id;
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      draggedFinalId = null;
      card.classList.remove('dragging');
    });
    card.addEventListener('dragover', (event) => event.preventDefault());
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      if (!draggedFinalId || draggedFinalId === item.id) return;
      snapshot();
      const from = state.finalSegments.findIndex((segment) => segment.id === draggedFinalId);
      const to = state.finalSegments.findIndex((segment) => segment.id === item.id);
      const [moved] = state.finalSegments.splice(from, 1);
      state.finalSegments.splice(to, 0, moved);
      renderAll();
      scheduleSave();
    });
  }
  return card;
}

function rawCameraCard(clip, index) {
  const item = buildSegment('camera', clip.id, 0, clip.duration, clip.name || `Prise caméra ${index + 1}`);
  item.id = clip.id;
  const card = clipCard(item, 'cameraClips', index);
  card.addEventListener('dblclick', () => {
    state.activeMedia = { type: 'camera', mediaId: clip.id };
    updateTrimControls(0, clip.duration, clip.duration);
    addActiveSelectionToFinal();
  });
  return card;
}

function renderLane(container, items, collection, rawCamera = false) {
  container.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'lane-empty';
    empty.textContent = collection === 'sourceSegments'
      ? 'Importe puis découpe un passage'
      : collection === 'cameraClips'
        ? 'Appuie sur Caméra pour filmer ta réaction'
        : 'Ajoute les extraits dans l’ordre de la vidéo finale';
    container.append(empty);
    return;
  }
  items.forEach((item, index) => container.append(rawCamera ? rawCameraCard(item, index) : clipCard(item, collection, index)));
}

function renderInspector() {
  const item = getSelectedItem();
  const isFinal = state.selected?.collection === 'finalSegments';
  const isRawCamera = state.selected?.collection === 'cameraClips';
  const settingsControls = [els.volumeRange, els.fitSelect, els.transitionSelect, els.muteToggle];
  settingsControls.forEach((control) => { control.disabled = !item || isRawCamera; });
  els.duplicateBtn.disabled = !item || isRawCamera;
  els.deleteClipBtn.disabled = !item;
  els.moveLeftBtn.disabled = !item || !isFinal || state.finalSegments.findIndex((x) => x.id === item.id) <= 0;
  els.moveRightBtn.disabled = !item || !isFinal || state.finalSegments.findIndex((x) => x.id === item.id) >= state.finalSegments.length - 1;
  if (!item) {
    els.inspectorTitle.textContent = 'Aucun clip';
    return;
  }
  els.inspectorTitle.textContent = item.label || item.name || 'Clip sélectionné';
  els.volumeRange.value = String(item.volume ?? 1);
  els.fitSelect.value = item.fit || 'cover';
  els.transitionSelect.value = item.transition || 'none';
  els.muteToggle.checked = Boolean(item.muted);
}

function renderAll() {
  renderLane(els.sourceTrack, state.sourceSegments, 'sourceSegments');
  renderLane(els.cameraTrack, state.cameraClips, 'cameraClips', true);
  renderLane(els.finalTrack, state.finalSegments, 'finalSegments');
  renderInspector();
  els.outputAspect.value = state.outputAspect || 'auto';
  els.qualitySelect.value = state.quality || '720';
  els.keepSourceBtn.disabled = !state.source || state.activeMedia?.type !== 'source';
  els.addSelectedToFinalBtn.disabled = !state.activeMedia;
  els.previewFinalBtn.disabled = !state.finalSegments.length;
  els.exportBtn.disabled = !state.finalSegments.length;
  els.viewTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === state.activeView));
  updateUndoRedo();
}
