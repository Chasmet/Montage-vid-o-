'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const uid = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TIMELINE_PX_PER_SECOND = 46;

const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* stockage bloqué */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* stockage bloqué */ } }
};

const els = {
  saveStatus: $('#saveStatus'),
  undoBtn: $('#undoBtn'),
  redoBtn: $('#redoBtn'),
  previewTitle: $('#previewTitle'),
  projectDurationLabel: $('#projectDurationLabel'),
  stage: $('#stage'),
  mainVideo: $('#mainVideo'),
  cameraPreview: $('#cameraPreview'),
  referencePreview: $('#referencePreview'),
  emptyStage: $('#emptyStage'),
  recordBadge: $('#recordBadge'),
  countdown: $('#countdown'),
  fullscreenBtn: $('#fullscreenBtn'),
  jumpStartBtn: $('#jumpStartBtn'),
  playBtn: $('#playBtn'),
  jumpEndBtn: $('#jumpEndBtn'),
  currentTime: $('#currentTime'),
  durationTime: $('#durationTime'),
  selectedClipLabel: $('#selectedClipLabel'),
  videoInput: $('#videoInput'),
  quickCameraBtn: $('#quickCameraBtn'),
  fitTimelineBtn: $('#fitTimelineBtn'),
  timelineScroll: $('#timelineScroll'),
  timelineRuler: $('#timelineRuler'),
  mainTimeline: $('#mainTimeline'),
  timelinePositionLabel: $('#timelinePositionLabel'),
  timelineClipCount: $('#timelineClipCount'),
  splitBtn: $('#splitBtn'),
  volumeToolBtn: $('#volumeToolBtn'),
  rotateBtn: $('#rotateBtn'),
  duplicateBtn: $('#duplicateBtn'),
  deleteClipBtn: $('#deleteClipBtn'),
  projectToolBtn: $('#projectToolBtn'),
  inspectorTitle: $('#inspectorTitle'),
  volumeRange: $('#volumeRange'),
  fitSelect: $('#fitSelect'),
  muteToggle: $('#muteToggle'),
  volumeSheet: $('#volumeSheet'),
  cameraSheet: $('#cameraSheet'),
  projectSheet: $('#projectSheet'),
  cameraOrientation: $('#cameraOrientation'),
  cameraSelect: $('#cameraSelect'),
  micSelect: $('#micSelect'),
  countdownSelect: $('#countdownSelect'),
  referenceToggle: $('#referenceToggle'),
  noiseToggle: $('#noiseToggle'),
  cameraBtn: $('#cameraBtn'),
  recordBtn: $('#recordBtn'),
  stopRecordBtn: $('#stopRecordBtn'),
  outputAspect: $('#outputAspect'),
  clearProjectBtn: $('#clearProjectBtn'),
  exportBtn: $('#exportBtn'),
  exportOverlay: $('#exportOverlay'),
  exportStatus: $('#exportStatus'),
  exportPercent: $('#exportPercent'),
  exportProgress: $('#exportProgress'),
  toast: $('#toast')
};

const initialState = () => ({
  version: 2,
  source: null,
  cameraClips: [],
  timelineSegments: [],
  selectedId: null,
  activeMedia: null,
  timelineTime: 0,
  outputAspect: 'auto',
  quality: '1080'
});

let state = initialState();
let history = [];
let future = [];
let currentStream = null;
let recorder = null;
let recorderChunks = [];
let isTimelinePreviewing = false;
let previewAbortToken = 0;
let toastTimer = null;
let db = null;
const memoryBlobs = new Map();
let autosaveTimer = null;
let draggedTimelineId = null;
let timelineScrollSync = false;
let timelineSeekTimer = null;
let activePreviewSegmentId = null;

function normalizeSegment(segment) {
  if (!segment) return null;
  const start = Math.max(0, Number(segment.start) || 0);
  const end = Math.max(start, Number(segment.end) || start);
  return {
    id: segment.id || uid('clip'),
    type: segment.type === 'camera' ? 'camera' : 'source',
    mediaId: segment.type === 'camera' ? segment.mediaId : 'source',
    start,
    end,
    label: segment.label || (segment.type === 'camera' ? 'Prise caméra' : 'Vidéo importée'),
    volume: clamp(segment.volume ?? 1, 0, 1.5),
    muted: Boolean(segment.muted),
    fit: segment.fit === 'contain' ? 'contain' : 'cover',
    transition: segment.transition === 'fade' ? 'fade' : 'none',
    rotation: [0, 90, 180, 270].includes(Number(segment.rotation)) ? Number(segment.rotation) : 0
  };
}

function migrateSavedState(saved) {
  const next = { ...initialState(), ...(saved || {}) };
  next.version = 2;
  next.cameraClips = Array.isArray(saved?.cameraClips) ? saved.cameraClips : [];

  let timeline = Array.isArray(saved?.timelineSegments) ? saved.timelineSegments : null;
  if (!timeline) {
    const legacyFinal = Array.isArray(saved?.finalSegments) ? saved.finalSegments : [];
    const legacySource = Array.isArray(saved?.sourceSegments) ? saved.sourceSegments : [];
    if (legacyFinal.length) {
      timeline = legacyFinal;
    } else if (legacySource.length) {
      timeline = legacySource;
      const referenced = new Set(timeline.filter((item) => item.type === 'camera').map((item) => item.mediaId));
      next.cameraClips.forEach((clip) => {
        if (!referenced.has(clip.id) && Number(clip.duration) > 0) {
          timeline.push({
            id: uid('camera'), type: 'camera', mediaId: clip.id, start: 0, end: clip.duration,
            label: clip.name || 'Prise caméra', volume: 1, muted: false, fit: 'cover', transition: 'none', rotation: 0
          });
        }
      });
    } else if (saved?.source && Number(saved.source.duration) > 0) {
      timeline = [{
        id: uid('source'), type: 'source', mediaId: 'source', start: 0, end: saved.source.duration,
        label: saved.source.name || 'Vidéo importée', volume: 1, muted: false, fit: 'cover', transition: 'none', rotation: 0
      }];
      next.cameraClips.forEach((clip) => {
        if (Number(clip.duration) > 0) {
          timeline.push({
            id: uid('camera'), type: 'camera', mediaId: clip.id, start: 0, end: clip.duration,
            label: clip.name || 'Prise caméra', volume: 1, muted: false, fit: 'cover', transition: 'none', rotation: 0
          });
        }
      });
    } else {
      timeline = [];
    }
  }

  next.timelineSegments = timeline.map(normalizeSegment).filter((item) => item && item.end - item.start >= 0.05);
  next.selectedId = next.timelineSegments.some((item) => item.id === saved?.selectedId)
    ? saved.selectedId
    : next.timelineSegments[0]?.id || null;
  next.timelineTime = clamp(saved?.timelineTime || 0, 0, timelineDuration(next.timelineSegments));
  next.quality = '1080';
  delete next.sourceSegments;
  delete next.finalSegments;
  delete next.selected;
  delete next.activeView;
  return next;
}

function serializableState() {
  const clean = structuredClone(state);
  if (clean.source) delete clean.source.url;
  clean.cameraClips = clean.cameraClips.map(({ url, ...clip }) => clip);
  return clean;
}

function snapshot() {
  history.push(JSON.stringify(serializableState()));
  if (history.length > 40) history.shift();
  future = [];
  updateUndoRedo();
}

function restoreSnapshot(raw) {
  state = migrateSavedState(JSON.parse(raw));
  hydrateMediaUrls().then(() => {
    renderAll();
    setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
    scheduleSave();
  });
}

function updateUndoRedo() {
  els.undoBtn.disabled = history.length === 0;
  els.redoBtn.disabled = future.length === 0;
}

function undo() {
  if (!history.length) return;
  future.push(JSON.stringify(serializableState()));
  restoreSnapshot(history.pop());
}

function redo() {
  if (!future.length) return;
  history.push(JSON.stringify(serializableState()));
  restoreSnapshot(future.pop());
}

function formatTime(seconds, precise = false) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const hundredths = Math.floor((safe % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${precise ? `.${String(hundredths).padStart(2, '0')}` : ''}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function setSaving(isSaving) {
  els.saveStatus.textContent = isSaving ? 'Sauvegarde…' : 'Sauvegardé';
}

function scheduleSave() {
  setSaving(true);
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    safeStorage.set('remix-studio-state', JSON.stringify(serializableState()));
    setSaving(false);
  }, 350);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('remix-studio-db', 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('blobs')) database.createObjectStore('blobs');
    };
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

function putBlob(key, blob) {
  if (!db) { memoryBlobs.set(key, blob); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getBlob(key) {
  if (!db) return Promise.resolve(memoryBlobs.get(key) || null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const request = tx.objectStore('blobs').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function deleteBlob(key) {
  if (!db) { memoryBlobs.delete(key); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function clearBlobs() {
  if (!db) { memoryBlobs.clear(); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function hydrateMediaUrls() {
  if (state.source?.blobKey && !state.source.url) {
    const blob = await getBlob(state.source.blobKey);
    if (blob) state.source.url = URL.createObjectURL(blob);
  }
  for (const clip of state.cameraClips) {
    if (!clip.url && clip.blobKey) {
      const blob = await getBlob(clip.blobKey);
      if (blob) clip.url = URL.createObjectURL(blob);
    }
  }
}

async function loadSavedProject() {
  const raw = safeStorage.get('remix-studio-state');
  if (!raw) return;
  try {
    state = migrateSavedState(JSON.parse(raw));
    await hydrateMediaUrls();
  } catch (error) {
    console.warn('Projet sauvegardé illisible', error);
    state = initialState();
  }
}

function getMediaByRef(type, mediaId) {
  if (type === 'source') return state.source;
  return state.cameraClips.find((clip) => clip.id === mediaId) || null;
}

function getSelectedItem() {
  return state.timelineSegments.find((item) => item.id === state.selectedId) || null;
}

function segmentDuration(segment) {
  return Math.max(0, Number(segment?.end) - Number(segment?.start));
}

function timelineDuration(segments = state.timelineSegments) {
  return segments.reduce((sum, segment) => sum + segmentDuration(segment), 0);
}

function activeDuration() {
  const media = state.activeMedia ? getMediaByRef(state.activeMedia.type, state.activeMedia.mediaId) : null;
  return media?.duration || 0;
}
