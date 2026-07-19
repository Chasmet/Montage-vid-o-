function setStageOrientation(orientation) {
  els.stage.classList.toggle('vertical', orientation !== 'horizontal');
  els.stage.classList.toggle('horizontal', orientation === 'horizontal');
}

function inferOrientation(width, height) {
  return Number(width) >= Number(height) ? 'horizontal' : 'vertical';
}

function effectiveOrientation(media, rotation = 0) {
  const base = media?.orientation || inferOrientation(media?.width, media?.height);
  return rotation % 180 === 0 ? base : (base === 'horizontal' ? 'vertical' : 'horizontal');
}

function applyPreviewRotation(segment = null) {
  const rotation = Number(segment?.rotation || 0);
  const sideways = rotation === 90 || rotation === 270;
  const stageWidth = Math.max(1, els.stage.clientWidth || 1);
  const stageHeight = Math.max(1, els.stage.clientHeight || 1);
  const scale = sideways ? Math.min(stageWidth / stageHeight, stageHeight / stageWidth) : 1;
  els.mainVideo.style.transform = `rotate(${rotation}deg) scale(${scale})`;
  els.mainVideo.style.objectFit = segment?.fit || 'cover';
}

function applyPreviewMedia(media, type, segment = null, preserveTimelinePreview = false, sourceTime = null) {
  if (!media?.url) {
    els.mainVideo.pause();
    els.mainVideo.removeAttribute('src');
    els.mainVideo.load();
    els.mainVideo.style.transform = '';
    els.emptyStage.classList.remove('hidden');
    els.previewTitle.textContent = 'Aucune vidéo';
    activePreviewSegmentId = null;
    return;
  }

  if (!preserveTimelinePreview) stopTimelinePreview();
  els.cameraPreview.classList.add('hidden');
  els.mainVideo.classList.remove('hidden');
  els.emptyStage.classList.add('hidden');

  const segmentId = segment?.id || `${type}:${media.id || 'source'}`;
  const needsSource = els.mainVideo.dataset.mediaUrl !== media.url;
  if (needsSource) {
    els.mainVideo.pause();
    els.mainVideo.src = media.url;
    els.mainVideo.dataset.mediaUrl = media.url;
  }

  const orientation = effectiveOrientation(media, segment?.rotation || 0);
  setStageOrientation(orientation);
  applyPreviewRotation(segment);
  els.mainVideo.volume = segment?.muted ? 0 : clamp(segment?.volume ?? 1, 0, 1);
  els.mainVideo.muted = Boolean(segment?.muted);
  els.previewTitle.textContent = segment?.label || media.name || (type === 'source' ? 'Vidéo importée' : 'Prise caméra');
  els.selectedClipLabel.textContent = segment?.label || media.name || 'Clip';
  state.activeMedia = { type, mediaId: type === 'source' ? 'source' : media.id };
  activePreviewSegmentId = segmentId;

  const target = clamp(sourceTime ?? segment?.start ?? 0, 0, media.duration || 0);
  const seek = () => {
    if (Math.abs((els.mainVideo.currentTime || 0) - target) > 0.025) {
      try { els.mainVideo.currentTime = target; } catch { /* métadonnées pas encore prêtes */ }
    }
    updateTimeDisplay();
  };
  if (els.mainVideo.readyState >= 1) seek();
  else els.mainVideo.addEventListener('loadedmetadata', seek, { once: true });
}

function timelineInfoAt(projectTime) {
  const total = timelineDuration();
  const safeTime = clamp(projectTime, 0, total);
  let cursor = 0;
  for (let index = 0; index < state.timelineSegments.length; index += 1) {
    const segment = state.timelineSegments[index];
    const duration = segmentDuration(segment);
    const end = cursor + duration;
    if (safeTime < end || index === state.timelineSegments.length - 1) {
      const local = clamp(safeTime - cursor, 0, duration);
      return {
        segment,
        index,
        segmentStart: cursor,
        segmentEnd: end,
        local,
        sourceTime: segment.start + local
      };
    }
    cursor = end;
  }
  return null;
}

function projectTimeForSegment(segmentId, sourceTime = null) {
  let cursor = 0;
  for (const segment of state.timelineSegments) {
    if (segment.id === segmentId) {
      const local = sourceTime == null ? 0 : clamp(sourceTime - segment.start, 0, segmentDuration(segment));
      return cursor + local;
    }
    cursor += segmentDuration(segment);
  }
  return 0;
}

function updateProjectLabels() {
  const total = timelineDuration();
  els.currentTime.textContent = formatTime(state.timelineTime, true);
  els.durationTime.textContent = formatTime(total, true);
  els.projectDurationLabel.textContent = formatTime(total);
  els.timelinePositionLabel.textContent = formatTime(state.timelineTime, true);
  els.timelineClipCount.textContent = `${state.timelineSegments.length} clip${state.timelineSegments.length > 1 ? 's' : ''}`;
}

function setTimelineTime(projectTime, options = {}) {
  const { preview = true, syncScroll = false, select = true, force = false } = options;
  const total = timelineDuration();
  state.timelineTime = clamp(projectTime, 0, total);
  const info = timelineInfoAt(state.timelineTime);

  if (!info) {
    state.selectedId = null;
    state.activeMedia = null;
    applyPreviewMedia(null);
    updateProjectLabels();
    renderTimelineSelection();
    renderInspector();
    if (syncScroll) syncTimelineScrollFromState();
    return;
  }

  if (select) state.selectedId = info.segment.id;
  const media = getMediaByRef(info.segment.type, info.segment.mediaId);
  if (preview && media?.url) {
    const changedSegment = activePreviewSegmentId !== info.segment.id;
    if (changedSegment || force || Math.abs((els.mainVideo.currentTime || 0) - info.sourceTime) > 0.04) {
      applyPreviewMedia(media, info.segment.type, info.segment, true, info.sourceTime);
    }
  }

  updateProjectLabels();
  renderTimelineSelection();
  renderInspector();
  if (syncScroll) syncTimelineScrollFromState();
}

function selectTimelineSegment(id, placeAtStart = true) {
  const segment = state.timelineSegments.find((item) => item.id === id);
  if (!segment) return;
  state.selectedId = id;
  const currentInfo = timelineInfoAt(state.timelineTime);
  const alreadyInside = currentInfo?.segment.id === id;
  const time = alreadyInside && !placeAtStart ? state.timelineTime : projectTimeForSegment(id);
  setTimelineTime(time, { preview: true, syncScroll: true, select: true, force: true });
  scheduleSave();
}

function buildSegment(type, mediaId, start, end, label) {
  return normalizeSegment({
    id: uid('clip'), type, mediaId, start, end, label,
    volume: 1, muted: false, fit: 'cover', transition: 'none', rotation: 0
  });
}

function appendFullMediaToTimeline(type, media, label = '') {
  if (!media || Number(media.duration) <= 0) return null;
  const segment = buildSegment(type, type === 'source' ? 'source' : media.id, 0, media.duration, label || media.name || (type === 'source' ? 'Vidéo importée' : 'Prise caméra'));
  state.timelineSegments.push(segment);
  state.selectedId = segment.id;
  state.timelineTime = projectTimeForSegment(segment.id);
  return segment;
}

function splitAtPlayhead() {
  const info = timelineInfoAt(state.timelineTime);
  if (!info) return showToast('Ajoute d’abord une vidéo sur la timeline.');
  const duration = segmentDuration(info.segment);
  if (info.local < 0.15 || duration - info.local < 0.15) {
    return showToast('Déplace la ligne blanche à l’intérieur du clip avant de diviser.');
  }

  snapshot();
  const cutSourceTime = info.segment.start + info.local;
  const left = { ...structuredClone(info.segment), id: uid('clip'), end: cutSourceTime };
  const right = { ...structuredClone(info.segment), id: uid('clip'), start: cutSourceTime };
  state.timelineSegments.splice(info.index, 1, left, right);
  state.selectedId = right.id;
  renderAll();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
  scheduleSave();
  showToast('Clip divisé à la ligne blanche.');
}

function rotateSelected() {
  const segment = getSelectedItem();
  if (!segment) return showToast('Sélectionne un clip à tourner.');
  snapshot();
  segment.rotation = (Number(segment.rotation || 0) + 90) % 360;
  renderAll();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: false, select: true, force: true });
  scheduleSave();
  showToast(`Rotation ${segment.rotation}° appliquée.`);
}

function duplicateSelected() {
  const segment = getSelectedItem();
  if (!segment) return showToast('Sélectionne un clip à dupliquer.');
  const index = state.timelineSegments.findIndex((item) => item.id === segment.id);
  snapshot();
  const copy = { ...structuredClone(segment), id: uid('copy'), label: `${segment.label} copie` };
  state.timelineSegments.splice(index + 1, 0, copy);
  state.selectedId = copy.id;
  state.timelineTime = projectTimeForSegment(copy.id);
  renderAll();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
  scheduleSave();
  showToast('Clip dupliqué.');
}

async function deleteSelected() {
  const segment = getSelectedItem();
  if (!segment) return showToast('Sélectionne un clip à supprimer.');
  const index = state.timelineSegments.findIndex((item) => item.id === segment.id);
  const start = projectTimeForSegment(segment.id);
  snapshot();
  state.timelineSegments.splice(index, 1);

  if (segment.type === 'camera' && !state.timelineSegments.some((item) => item.type === 'camera' && item.mediaId === segment.mediaId)) {
    const media = state.cameraClips.find((clip) => clip.id === segment.mediaId);
    if (media?.url) URL.revokeObjectURL(media.url);
    if (media?.blobKey) await deleteBlob(media.blobKey);
    state.cameraClips = state.cameraClips.filter((clip) => clip.id !== segment.mediaId);
  }

  state.timelineTime = clamp(start, 0, timelineDuration());
  const next = state.timelineSegments[Math.min(index, state.timelineSegments.length - 1)] || null;
  state.selectedId = next?.id || null;
  renderAll();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
  scheduleSave();
  showToast('Clip supprimé de la timeline.');
}

function selectedItemMutation(mutator) {
  const item = getSelectedItem();
  if (!item) return;
  snapshot();
  mutator(item);
  renderAll();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: false, select: true, force: true });
  scheduleSave();
}

function moveTimelineSegment(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const from = state.timelineSegments.findIndex((item) => item.id === fromId);
  const to = state.timelineSegments.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0) return;
  snapshot();
  const [moved] = state.timelineSegments.splice(from, 1);
  state.timelineSegments.splice(to, 0, moved);
  state.selectedId = moved.id;
  state.timelineTime = projectTimeForSegment(moved.id);
  renderAll();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
  scheduleSave();
}

function togglePlay() {
  if (!state.timelineSegments.length) return;
  if (isTimelinePreviewing) stopTimelinePreview(true);
  else previewTimeline(state.timelineTime);
}

function seekTo(value) {
  stopTimelinePreview();
  setTimelineTime(value, { preview: true, syncScroll: true, select: true, force: true });
}

function updateTimeDisplay() {
  if (isTimelinePreviewing) return;
  const segment = getSelectedItem();
  if (!segment || !els.mainVideo.src) {
    updateProjectLabels();
    return;
  }
  const local = clamp((els.mainVideo.currentTime || segment.start) - segment.start, 0, segmentDuration(segment));
  state.timelineTime = clamp(projectTimeForSegment(segment.id) + local, 0, timelineDuration());
  updateProjectLabels();
}
