function setStageOrientation(orientation) {
  els.stage.classList.toggle('vertical', orientation !== 'horizontal');
  els.stage.classList.toggle('horizontal', orientation === 'horizontal');
}

function inferOrientation(width, height) {
  return width >= height ? 'horizontal' : 'vertical';
}

function applyPreviewMedia(media, type, segment = null, preserveFinalPreview = false) {
  if (!media?.url) {
    els.mainVideo.removeAttribute('src');
    els.mainVideo.load();
    els.emptyStage.classList.remove('hidden');
    els.previewTitle.textContent = 'Aucune vidéo';
    updateTrimControls(0, 0);
    return;
  }
  if (!preserveFinalPreview) stopFinalPreview();
  els.cameraPreview.classList.add('hidden');
  els.mainVideo.classList.remove('hidden');
  els.emptyStage.classList.add('hidden');
  els.mainVideo.src = media.url;
  els.mainVideo.volume = 1;
  els.mainVideo.muted = false;
  setStageOrientation(media.orientation || inferOrientation(media.width, media.height));
  els.previewTitle.textContent = segment?.label || media.name || (type === 'source' ? 'Vidéo importée' : 'Prise caméra');
  state.activeMedia = { type, mediaId: type === 'source' ? 'source' : media.id };
  const start = segment?.start ?? 0;
  const end = segment?.end ?? media.duration;
  updateTrimControls(start, end, media.duration);
  const onReady = () => {
    els.mainVideo.currentTime = clamp(start, 0, media.duration || 0);
    updateTimeDisplay();
  };
  if (els.mainVideo.readyState >= 1) onReady();
  else els.mainVideo.addEventListener('loadedmetadata', onReady, { once: true });
}

function loadSelectedMedia() {
  const selected = getSelectedItem();
  if (selected) {
    if (state.selected?.collection === 'cameraClips') {
      applyPreviewMedia(selected, 'camera');
      return;
    }
    const media = getMediaByRef(selected.type, selected.mediaId);
    if (media) applyPreviewMedia(media, selected.type, selected);
    return;
  }
  if (state.activeView === 'camera' && state.cameraClips.length) {
    const clip = state.cameraClips.at(-1);
    applyPreviewMedia(clip, 'camera');
  } else if (state.source) {
    applyPreviewMedia(state.source, 'source');
  } else {
    applyPreviewMedia(null);
  }
}

function updateTrimControls(start = 0, end = 0, duration = activeDuration()) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const safeStart = clamp(start, 0, safeDuration);
  const safeEnd = clamp(end || safeDuration, safeStart, safeDuration);
  for (const input of [els.trimStartRange, els.trimEndRange]) {
    input.max = String(safeDuration || 1);
    input.step = '0.01';
  }
  els.trimStartNumber.max = String(safeDuration);
  els.trimEndNumber.max = String(safeDuration);
  els.trimStartNumber.value = safeStart.toFixed(2);
  els.trimEndNumber.value = safeEnd.toFixed(2);
  els.trimStartRange.value = String(safeStart);
  els.trimEndRange.value = String(safeEnd);
  els.durationTime.textContent = formatTime(safeDuration, true);
}

function currentTrim() {
  const duration = activeDuration();
  const start = clamp(els.trimStartNumber.value, 0, duration);
  const end = clamp(els.trimEndNumber.value, start, duration);
  return { start, end };
}

function syncTrimFromNumbers() {
  const duration = activeDuration();
  let start = clamp(els.trimStartNumber.value, 0, duration);
  let end = clamp(els.trimEndNumber.value, 0, duration);
  if (start > end) end = start;
  els.trimStartNumber.value = start.toFixed(2);
  els.trimEndNumber.value = end.toFixed(2);
  els.trimStartRange.value = String(start);
  els.trimEndRange.value = String(end);
}

function syncTrimFromRanges(changed) {
  const duration = activeDuration();
  let start = clamp(els.trimStartRange.value, 0, duration);
  let end = clamp(els.trimEndRange.value, 0, duration);
  if (changed === 'start' && start > end) end = start;
  if (changed === 'end' && end < start) start = end;
  els.trimStartRange.value = String(start);
  els.trimEndRange.value = String(end);
  els.trimStartNumber.value = start.toFixed(2);
  els.trimEndNumber.value = end.toFixed(2);
  if (els.mainVideo.src) els.mainVideo.currentTime = changed === 'start' ? start : end;
}

function segmentLabel(type, index) {
  const custom = els.clipLabel.value.trim();
  if (custom) return custom;
  return type === 'source' ? `Extrait importé ${index}` : `Prise caméra ${index}`;
}

function buildSegment(type, mediaId, start, end, label) {
  return {
    id: uid('seg'),
    type,
    mediaId,
    start,
    end,
    label,
    volume: 1,
    muted: false,
    fit: 'cover',
    transition: 'none'
  };
}

function keepSourceSegment() {
  if (!state.source || state.activeMedia?.type !== 'source') {
    showToast('Sélectionne d’abord la vidéo importée.');
    return;
  }
  const { start, end } = currentTrim();
  if (end - start < 0.1) return showToast('Le passage est trop court.');
  snapshot();
  const segment = buildSegment('source', 'source', start, end, segmentLabel('source', state.sourceSegments.length + 1));
  state.sourceSegments.push(segment);
  state.selected = { collection: 'sourceSegments', id: segment.id };
  els.clipLabel.value = '';
  renderAll();
  scheduleSave();
  showToast('Passage gardé sur la piste importée.');
}

function addActiveSelectionToFinal() {
  const active = state.activeMedia;
  if (!active) return showToast('Sélectionne une vidéo ou une prise caméra.');
  const media = getMediaByRef(active.type, active.mediaId);
  if (!media) return;
  const { start, end } = currentTrim();
  if (end - start < 0.1) return showToast('Le passage est trop court.');
  snapshot();
  const segment = buildSegment(active.type, active.mediaId, start, end, segmentLabel(active.type, state.finalSegments.length + 1));
  state.finalSegments.push(segment);
  state.selected = { collection: 'finalSegments', id: segment.id };
  els.clipLabel.value = '';
  renderAll();
  scheduleSave();
  showToast('Extrait ajouté à la liste finale.');
}

function addExistingSegmentToFinal(collection, id) {
  const sourceSegment = state[collection].find((item) => item.id === id);
  if (!sourceSegment) return;
  snapshot();
  const copy = { ...structuredClone(sourceSegment), id: uid('final') };
  state.finalSegments.push(copy);
  state.selected = { collection: 'finalSegments', id: copy.id };
  renderAll();
  scheduleSave();
  showToast('Extrait ajouté à la finale.');
}

function selectItem(collection, id) {
  state.selected = { collection, id };
  const item = getSelectedItem();
  if (item) {
    if (collection === 'cameraClips') {
      state.activeMedia = { type: 'camera', mediaId: item.id };
      applyPreviewMedia(item, 'camera');
    } else {
      const media = getMediaByRef(item.type, item.mediaId);
      applyPreviewMedia(media, item.type, item);
    }
  }
  renderAll();
  scheduleSave();
}
