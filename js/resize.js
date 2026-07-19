const ASPECT_PRESETS = {
  vertical: 9 / 16,
  horizontal: 16 / 9,
  square: 1,
  classic: 4 / 3
};

const resizeEls = {
  workspace: document.getElementById('resizeWorkspace'),
  stage: document.getElementById('resizeStage'),
  frame: document.getElementById('resizeFrame'),
  video: document.getElementById('resizeVideo'),
  cancel: document.getElementById('resizeCancelBtn'),
  confirm: document.getElementById('resizeConfirmBtn'),
  seek: document.getElementById('resizeSeek'),
  current: document.getElementById('resizeCurrentTime'),
  duration: document.getElementById('resizeDuration'),
  rotation: document.getElementById('resizeRotation'),
  rotationValue: document.getElementById('resizeRotationValue'),
  zoom: document.getElementById('resizeZoom'),
  zoomValue: document.getElementById('resizeZoomValue'),
  formatButtons: [...document.querySelectorAll('#formatList button[data-aspect]')],
  contain: document.getElementById('resizeContainBtn'),
  cover: document.getElementById('resizeCoverBtn'),
  reset: document.getElementById('resizeResetBtn'),
  tool: document.getElementById('resizeToolBtn')
};

els.projectFrame = document.getElementById('projectFrame');
els.resizeToolBtn = resizeEls.tool;

let resizeEditingId = null;
let resizeOriginalState = null;
let resizeHistorySnapshot = null;
const resizePointers = new Map();
let resizeLastPoint = null;
let resizePinch = null;

function ensureLayoutState() {
  if (!state.clipLayouts || typeof state.clipLayouts !== 'object') state.clipLayouts = {};
  return state.clipLayouts;
}

function defaultClipLayout() {
  return { zoom: 1, x: 0, y: 0, tilt: 0 };
}

function getClipLayout(id) {
  const layouts = ensureLayoutState();
  if (!id) return defaultClipLayout();
  if (!layouts[id]) layouts[id] = defaultClipLayout();
  const layout = layouts[id];
  layout.zoom = clamp(layout.zoom ?? 1, 0.5, 3);
  layout.x = clamp(layout.x ?? 0, -150, 150);
  layout.y = clamp(layout.y ?? 0, -150, 150);
  layout.tilt = clamp(layout.tilt ?? 0, -20, 20);
  return layout;
}

function originalMediaRatio() {
  const source = state.source;
  if (source?.width && source?.height) return source.width / source.height;
  const first = state.timelineSegments[0];
  const media = first ? getMediaByRef(first.type, first.mediaId) : null;
  if (media?.width && media?.height) {
    const ratio = media.width / media.height;
    return Number(first.rotation || 0) % 180 === 0 ? ratio : 1 / ratio;
  }
  return 9 / 16;
}

function resolveProjectAspectRatio(aspect = state.outputAspect) {
  return ASPECT_PRESETS[aspect] || originalMediaRatio();
}

function projectOutputDimensions() {
  const aspectKey = state.outputAspect || 'auto';
  if (aspectKey === 'vertical') return { width: 1080, height: 1920 };
  if (aspectKey === 'horizontal') return { width: 1920, height: 1080 };
  if (aspectKey === 'square') return { width: 1080, height: 1080 };
  if (aspectKey === 'classic') return { width: 1440, height: 1080 };

  const ratio = Math.max(0.2, Math.min(5, originalMediaRatio()));
  if (ratio >= 1) {
    const height = 1080;
    const width = Math.max(2, Math.round((height * ratio) / 2) * 2);
    return { width: Math.min(1920, width), height };
  }
  const width = 1080;
  const height = Math.max(2, Math.round((width / ratio) / 2) * 2);
  return { width, height: Math.min(1920, height) };
}

function totalClipRotation(segment) {
  const layout = getClipLayout(segment?.id);
  return Number(segment?.rotation || 0) + Number(layout.tilt || 0);
}

function fitFrameInside(container, frame, ratio, padding = 0) {
  if (!container || !frame) return;
  const availableWidth = Math.max(1, container.clientWidth - padding * 2);
  const availableHeight = Math.max(1, container.clientHeight - padding * 2);
  let width = availableWidth;
  let height = width / ratio;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * ratio;
  }
  frame.style.width = `${Math.max(1, Math.round(width))}px`;
  frame.style.height = `${Math.max(1, Math.round(height))}px`;
}

function rotationBaseScale(width, height, rotation) {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const sideways = normalized === 90 || normalized === 270;
  return sideways ? Math.min(width / height, height / width) : 1;
}

function applyProjectFrameLayout() {
  fitFrameInside(els.stage, els.projectFrame, resolveProjectAspectRatio(), 8);
  const segment = getSelectedItem();
  if (segment) applyPreviewRotation(segment);
}

setStageOrientation = function setStageToProjectRatio() {
  requestAnimationFrame(applyProjectFrameLayout);
};

applyPreviewRotation = function applyPreviewLayout(segment = null) {
  if (!segment || !els.projectFrame) {
    els.mainVideo.style.transform = '';
    return;
  }
  const layout = getClipLayout(segment.id);
  const rotation = totalClipRotation(segment);
  const frameWidth = Math.max(1, els.projectFrame.clientWidth);
  const frameHeight = Math.max(1, els.projectFrame.clientHeight);
  const x = (layout.x / 100) * (frameWidth / 2);
  const y = (layout.y / 100) * (frameHeight / 2);
  const scale = rotationBaseScale(frameWidth, frameHeight, segment.rotation || 0) * layout.zoom;
  els.mainVideo.style.objectFit = segment.fit || 'contain';
  els.mainVideo.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;
};

function applyResizeTransform() {
  const segment = state.timelineSegments.find((item) => item.id === resizeEditingId);
  if (!segment || !resizeEls.frame) return;
  const layout = getClipLayout(segment.id);
  const rotation = totalClipRotation(segment);
  const frameWidth = Math.max(1, resizeEls.frame.clientWidth);
  const frameHeight = Math.max(1, resizeEls.frame.clientHeight);
  const x = (layout.x / 100) * (frameWidth / 2);
  const y = (layout.y / 100) * (frameHeight / 2);
  const scale = rotationBaseScale(frameWidth, frameHeight, segment.rotation || 0) * layout.zoom;
  resizeEls.video.style.objectFit = segment.fit || 'contain';
  resizeEls.video.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;
  resizeEls.rotation.value = String(layout.tilt);
  resizeEls.rotationValue.textContent = `${Math.round(layout.tilt)}°`;
  resizeEls.zoom.value = String(layout.zoom);
  resizeEls.zoomValue.textContent = `${Math.round(layout.zoom * 100)}%`;
  resizeEls.contain.classList.toggle('active', segment.fit === 'contain');
  resizeEls.cover.classList.toggle('active', segment.fit !== 'contain');
}

function layoutResizeFrame() {
  fitFrameInside(resizeEls.stage, resizeEls.frame, resolveProjectAspectRatio(), 12);
  applyResizeTransform();
}

function refreshAspectButtons() {
  resizeEls.formatButtons.forEach((button) => button.classList.toggle('active', button.dataset.aspect === (state.outputAspect || 'auto')));
  if (els.outputAspect) els.outputAspect.value = state.outputAspect || 'auto';
}

function refreshResizeTime() {
  const current = resizeEls.video.currentTime || 0;
  const duration = resizeEls.video.duration || 0;
  resizeEls.current.textContent = formatTime(current);
  resizeEls.duration.textContent = formatTime(duration);
  resizeEls.seek.max = String(duration || 1);
  resizeEls.seek.value = String(clamp(current, 0, duration || 1));
}

async function openResizeEditor(segmentId = state.selectedId) {
  const segment = state.timelineSegments.find((item) => item.id === segmentId);
  const media = segment ? getMediaByRef(segment.type, segment.mediaId) : null;
  if (!segment || !media?.url) return showToast('Sélectionne d’abord une vidéo sur la timeline.');

  stopTimelinePreview(true);
  await closeCamera();
  if (typeof closeAllSheets === 'function') closeAllSheets();
  resizeEditingId = segment.id;
  resizeOriginalState = structuredClone(state);
  resizeHistorySnapshot = JSON.stringify(serializableState());
  getClipLayout(segment.id);
  resizeEls.workspace.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  resizeEls.video.src = media.url;
  resizeEls.video.muted = true;
  resizeEls.video.currentTime = clamp(els.mainVideo.currentTime || segment.start, segment.start, segment.end);
  resizeEls.video.pause();
  refreshAspectButtons();
  requestAnimationFrame(() => requestAnimationFrame(layoutResizeFrame));
  refreshResizeTime();
}

function closeResizeWorkspace() {
  resizeEls.video.pause();
  resizeEls.workspace.classList.add('hidden');
  resizeEls.video.removeAttribute('src');
  resizeEls.video.load();
  document.body.style.overflow = '';
  resizeEditingId = null;
  resizeOriginalState = null;
  resizeHistorySnapshot = null;
  resizePointers.clear();
  resizeLastPoint = null;
  resizePinch = null;
}

function confirmResize() {
  if (!resizeEditingId) return;
  if (resizeHistorySnapshot) {
    history.push(resizeHistorySnapshot);
    if (history.length > 40) history.shift();
    future = [];
    updateUndoRedo();
  }
  closeResizeWorkspace();
  renderAll();
  applyProjectFrameLayout();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: false, select: true, force: true });
  scheduleSave();
  showToast('Format et cadrage appliqués.');
}

function cancelResize() {
  if (resizeOriginalState) state = structuredClone(resizeOriginalState);
  closeResizeWorkspace();
  renderAll();
  applyProjectFrameLayout();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: false, select: true, force: true });
}

function setResizeAspect(aspect) {
  state.outputAspect = ASPECT_PRESETS[aspect] ? aspect : 'auto';
  refreshAspectButtons();
  layoutResizeFrame();
  applyProjectFrameLayout();
}

function mutateResizeLayout(mutator) {
  const segment = state.timelineSegments.find((item) => item.id === resizeEditingId);
  if (!segment) return;
  mutator(segment, getClipLayout(segment.id));
  applyResizeTransform();
}

function resetResize() {
  const segment = state.timelineSegments.find((item) => item.id === resizeEditingId);
  if (!segment) return;
  state.clipLayouts[segment.id] = defaultClipLayout();
  segment.fit = 'contain';
  applyResizeTransform();
}

function pointerDistance(points) {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

resizeEls.frame.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  resizeEls.frame.setPointerCapture?.(event.pointerId);
  resizePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = [...resizePointers.values()];
  if (points.length === 1) resizeLastPoint = points[0];
  if (points.length === 2) {
    const segment = state.timelineSegments.find((item) => item.id === resizeEditingId);
    resizePinch = { distance: pointerDistance(points), zoom: getClipLayout(segment?.id).zoom };
  }
});

resizeEls.frame.addEventListener('pointermove', (event) => {
  if (!resizePointers.has(event.pointerId)) return;
  event.preventDefault();
  resizePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = [...resizePointers.values()];
  const segment = state.timelineSegments.find((item) => item.id === resizeEditingId);
  if (!segment) return;
  const layout = getClipLayout(segment.id);

  if (points.length >= 2 && resizePinch) {
    const distance = pointerDistance(points);
    layout.zoom = clamp(resizePinch.zoom * (distance / Math.max(1, resizePinch.distance)), 0.5, 3);
    applyResizeTransform();
    return;
  }

  if (points.length === 1 && resizeLastPoint) {
    const point = points[0];
    const dx = point.x - resizeLastPoint.x;
    const dy = point.y - resizeLastPoint.y;
    layout.x = clamp(layout.x + (dx / Math.max(1, resizeEls.frame.clientWidth)) * 200, -150, 150);
    layout.y = clamp(layout.y + (dy / Math.max(1, resizeEls.frame.clientHeight)) * 200, -150, 150);
    resizeLastPoint = point;
    applyResizeTransform();
  }
});

function releaseResizePointer(event) {
  resizePointers.delete(event.pointerId);
  const points = [...resizePointers.values()];
  resizeLastPoint = points[0] || null;
  resizePinch = points.length >= 2 ? resizePinch : null;
}
resizeEls.frame.addEventListener('pointerup', releaseResizePointer);
resizeEls.frame.addEventListener('pointercancel', releaseResizePointer);

resizeEls.cancel.addEventListener('click', cancelResize);
resizeEls.confirm.addEventListener('click', confirmResize);
resizeEls.tool.addEventListener('click', () => openResizeEditor());
resizeEls.formatButtons.forEach((button) => button.addEventListener('click', () => setResizeAspect(button.dataset.aspect)));
resizeEls.rotation.addEventListener('input', () => mutateResizeLayout((segment, layout) => { layout.tilt = Number(resizeEls.rotation.value); }));
resizeEls.zoom.addEventListener('input', () => mutateResizeLayout((segment, layout) => { layout.zoom = Number(resizeEls.zoom.value); }));
resizeEls.contain.addEventListener('click', () => mutateResizeLayout((segment) => { segment.fit = 'contain'; }));
resizeEls.cover.addEventListener('click', () => mutateResizeLayout((segment) => { segment.fit = 'cover'; }));
resizeEls.reset.addEventListener('click', resetResize);
resizeEls.seek.addEventListener('input', () => {
  resizeEls.video.currentTime = Number(resizeEls.seek.value) || 0;
  refreshResizeTime();
});
resizeEls.video.addEventListener('timeupdate', refreshResizeTime);
resizeEls.video.addEventListener('loadedmetadata', () => {
  refreshResizeTime();
  layoutResizeFrame();
});

window.addEventListener('resize', () => {
  applyProjectFrameLayout();
  if (!resizeEls.workspace.classList.contains('hidden')) layoutResizeFrame();
});

els.outputAspect.addEventListener('change', () => {
  applyProjectFrameLayout();
  setTimelineTime(state.timelineTime, { preview: true, syncScroll: false, select: true, force: true });
});

desiredCameraOrientation = function desiredCameraProjectOrientation() {
  if (els.cameraOrientation.value !== 'auto') return els.cameraOrientation.value;
  return resolveProjectAspectRatio() >= 1 ? 'horizontal' : 'vertical';
};

const importSourceBeforeResize = importSource;
importSource = async function importAndResize(file) {
  const previousUrl = state.source?.url;
  await importSourceBeforeResize(file);
  if (file && state.source?.url && state.source.url !== previousUrl) {
    const segment = state.timelineSegments.find((item) => item.type === 'source');
    if (segment) setTimeout(() => openResizeEditor(segment.id), 120);
  }
};

const saveCameraBlobBeforeResize = saveCameraBlob;
saveCameraBlob = async function saveCameraAndResize(...args) {
  const previousIds = new Set(state.timelineSegments.map((item) => item.id));
  await saveCameraBlobBeforeResize(...args);
  const segment = state.timelineSegments.find((item) => item.type === 'camera' && !previousIds.has(item.id)) || getSelectedItem();
  if (segment) setTimeout(() => openResizeEditor(segment.id), 160);
};

const splitBeforeResize = splitAtPlayhead;
splitAtPlayhead = function splitWithLayout() {
  const info = timelineInfoAt(state.timelineTime);
  const oldId = info?.segment.id;
  const oldLayout = oldId ? structuredClone(getClipLayout(oldId)) : null;
  const index = info?.index ?? -1;
  splitBeforeResize();
  if (oldLayout && index >= 0) {
    const left = state.timelineSegments[index];
    const right = state.timelineSegments[index + 1];
    if (left && right && left.id !== oldId && right.id !== oldId) {
      ensureLayoutState()[left.id] = structuredClone(oldLayout);
      ensureLayoutState()[right.id] = structuredClone(oldLayout);
      delete ensureLayoutState()[oldId];
      applyPreviewRotation(getSelectedItem());
      scheduleSave();
    }
  }
};

const duplicateBeforeResize = duplicateSelected;
duplicateSelected = function duplicateWithLayout() {
  const original = getSelectedItem();
  const originalId = original?.id;
  const layout = originalId ? structuredClone(getClipLayout(originalId)) : null;
  duplicateBeforeResize();
  const copy = getSelectedItem();
  if (layout && copy?.id && copy.id !== originalId) ensureLayoutState()[copy.id] = layout;
  applyPreviewRotation(copy);
  scheduleSave();
};

const deleteBeforeResize = deleteSelected;
deleteSelected = async function deleteWithLayout() {
  const id = getSelectedItem()?.id;
  await deleteBeforeResize();
  if (id) delete ensureLayoutState()[id];
  scheduleSave();
};

window.getClipLayout = getClipLayout;
window.totalClipRotation = totalClipRotation;
window.resolveProjectAspectRatio = resolveProjectAspectRatio;
window.projectOutputDimensions = projectOutputDimensions;
window.applyProjectFrameLayout = applyProjectFrameLayout;
window.openResizeEditor = openResizeEditor;

requestAnimationFrame(() => requestAnimationFrame(applyProjectFrameLayout));
