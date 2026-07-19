'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const uid = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  viewTabs: $$('.view-tab'),
  stage: $('#stage'),
  mainVideo: $('#mainVideo'),
  cameraPreview: $('#cameraPreview'),
  referencePreview: $('#referencePreview'),
  emptyStage: $('#emptyStage'),
  recordBadge: $('#recordBadge'),
  countdown: $('#countdown'),
  jumpStartBtn: $('#jumpStartBtn'),
  playBtn: $('#playBtn'),
  jumpEndBtn: $('#jumpEndBtn'),
  currentTime: $('#currentTime'),
  durationTime: $('#durationTime'),
  videoInput: $('#videoInput'),
  cameraBtn: $('#cameraBtn'),
  recordBtn: $('#recordBtn'),
  stopRecordBtn: $('#stopRecordBtn'),
  markCurrentBtn: $('#markCurrentBtn'),
  trimStartNumber: $('#trimStartNumber'),
  trimEndNumber: $('#trimEndNumber'),
  clipLabel: $('#clipLabel'),
  trimStartRange: $('#trimStartRange'),
  trimEndRange: $('#trimEndRange'),
  setInBtn: $('#setInBtn'),
  setOutBtn: $('#setOutBtn'),
  keepSourceBtn: $('#keepSourceBtn'),
  addSelectedToFinalBtn: $('#addSelectedToFinalBtn'),
  cameraOrientation: $('#cameraOrientation'),
  cameraSelect: $('#cameraSelect'),
  micSelect: $('#micSelect'),
  countdownSelect: $('#countdownSelect'),
  referenceToggle: $('#referenceToggle'),
  noiseToggle: $('#noiseToggle'),
  sourceTrack: $('#sourceTrack'),
  cameraTrack: $('#cameraTrack'),
  finalTrack: $('#finalTrack'),
  clearProjectBtn: $('#clearProjectBtn'),
  previewFinalBtn: $('#previewFinalBtn'),
  inspectorTitle: $('#inspectorTitle'),
  volumeRange: $('#volumeRange'),
  fitSelect: $('#fitSelect'),
  transitionSelect: $('#transitionSelect'),
  muteToggle: $('#muteToggle'),
  moveLeftBtn: $('#moveLeftBtn'),
  moveRightBtn: $('#moveRightBtn'),
  duplicateBtn: $('#duplicateBtn'),
  deleteClipBtn: $('#deleteClipBtn'),
  outputAspect: $('#outputAspect'),
  qualitySelect: $('#qualitySelect'),
  exportBtn: $('#exportBtn'),
  exportProgressWrap: $('#exportProgressWrap'),
  exportStatus: $('#exportStatus'),
  exportPercent: $('#exportPercent'),
  exportProgress: $('#exportProgress'),
  toast: $('#toast')
};

const initialState = () => ({
  version: 1,
  source: null,
  sourceSegments: [],
  cameraClips: [],
  finalSegments: [],
  selected: null,
  activeView: 'source',
  activeMedia: null,
  outputAspect: 'auto',
  quality: '720'
});

let state = initialState();
let history = [];
let future = [];
let currentStream = null;
let recorder = null;
let recorderChunks = [];
let isFinalPreviewing = false;
let previewAbortToken = 0;
let toastTimer = null;
let db = null;
const memoryBlobs = new Map();
let autosaveTimer = null;
let draggedFinalId = null;

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
  state = JSON.parse(raw);
  hydrateMediaUrls().then(() => {
    renderAll();
    loadSelectedMedia();
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
  autosaveTimer = setTimeout(async () => {
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
    state = { ...initialState(), ...JSON.parse(raw) };
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
  if (!state.selected) return null;
  const { collection, id } = state.selected;
  return state[collection]?.find((item) => item.id === id) || null;
}

function activeDuration() {
  const media = state.activeMedia ? getMediaByRef(state.activeMedia.type, state.activeMedia.mediaId) : null;
  return media?.duration || 0;
}
