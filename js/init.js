(() => {
  const bridgeScript = document.createElement('script');
  bridgeScript.src = 'js/android-bridge.js';
  bridgeScript.defer = true;
  document.head.appendChild(bridgeScript);
})();

function bindEvents() {
  els.videoInput.addEventListener('change', (event) => importSource(event.target.files?.[0]));
  els.undoBtn.addEventListener('click', undo);
  els.redoBtn.addEventListener('click', redo);
  els.playBtn.addEventListener('click', togglePlay);
  els.jumpStartBtn.addEventListener('click', () => seekTo(0));
  els.jumpEndBtn.addEventListener('click', () => seekTo(timelineDuration()));
  els.mainVideo.addEventListener('timeupdate', updateTimeDisplay);
  els.mainVideo.addEventListener('loadedmetadata', () => applyPreviewRotation(getSelectedItem()));

  els.splitBtn.addEventListener('click', splitAtPlayhead);
  els.rotateBtn.addEventListener('click', rotateSelected);
  els.duplicateBtn.addEventListener('click', duplicateSelected);
  els.deleteClipBtn.addEventListener('click', deleteSelected);
  els.fitTimelineBtn.addEventListener('click', centerSelectedClip);

  els.volumeRange.addEventListener('change', () => selectedItemMutation((item) => { item.volume = Number(els.volumeRange.value); }));
  els.fitSelect.addEventListener('change', () => selectedItemMutation((item) => { item.fit = els.fitSelect.value; }));
  els.muteToggle.addEventListener('change', () => selectedItemMutation((item) => { item.muted = els.muteToggle.checked; }));

  els.cameraBtn.addEventListener('click', openCamera);
  els.recordBtn.addEventListener('click', startRecording);
  els.stopRecordBtn.addEventListener('click', stopRecording);
  els.cameraOrientation.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.cameraSelect.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.micSelect.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.referenceToggle.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.noiseToggle.addEventListener('change', () => { if (currentStream) openCamera(); });

  els.outputAspect.addEventListener('change', () => {
    snapshot();
    state.outputAspect = els.outputAspect.value;
    scheduleSave();
  });
  els.clearProjectBtn.addEventListener('click', clearProject);
  els.exportBtn.addEventListener('click', exportTimeline);

  window.addEventListener('resize', () => syncTimelineScrollFromState(), { passive: true });
  window.addEventListener('beforeunload', () => currentStream?.getTracks().forEach((track) => track.stop()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isTimelinePreviewing) stopTimelinePreview(true);
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) {
      event.preventDefault();
      togglePlay();
    }
    if (event.key.toLowerCase() === 's' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) splitAtPlayhead();
  });
}

async function init() {
  try {
    await openDB();
  } catch (error) {
    console.warn('IndexedDB indisponible, sauvegarde vidéo limitée à cette session.', error);
    db = null;
  }
  await loadSavedProject();
  bindEvents();
  renderAll();
  if (state.timelineSegments.length) {
    setTimelineTime(state.timelineTime || 0, { preview: true, syncScroll: true, select: true, force: true });
  } else {
    setTimelineTime(0, { preview: true, syncScroll: true, select: false, force: true });
  }
  enumerateDevices().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('Service worker', error));
  }
}

function loadScriptOnce(selector, src, dataKey, dataValue, errorMessage) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.dataset[dataKey] = dataValue;
    script.onload = resolve;
    script.onerror = () => reject(new Error(errorMessage));
    document.body.appendChild(script);
  });
}

const loadFinalAudit = () => loadScriptOnce('script[data-remix-final-audit]', 'js/final-audit.js', 'remixFinalAudit', '2.6.0', 'La couche de sécurité finale n’a pas pu être chargée.');
const loadCursorInsertion = () => loadScriptOnce('script[data-remix-cursor-insertion]', 'js/insertion-cursor.js', 'remixCursorInsertion', '2.7.0', 'La logique d’insertion à la ligne blanche n’a pas pu être chargée.');
const loadPodcastExportMode = () => loadScriptOnce('script[data-remix-podcast-mode]', 'js/export-mode2.js', 'remixPodcastMode', '2.8.0', 'Le Mode 2 interview naturelle n’a pas pu être chargé.');
const loadMode2Synchronization = () => loadScriptOnce('script[data-remix-mode2-sync]', 'js/mode2-sync.js', 'remixMode2Sync', '2.9.0', 'La synchronisation précise du Mode 2 n’a pas pu être chargée.');
const loadExportWatchdog = () => loadScriptOnce('script[data-remix-export-watchdog]', 'js/export-watchdog.js', 'remixExportWatchdog', '2.8.1', 'La protection anti-blocage de l’export n’a pas pu être chargée.');

init()
  .then(loadFinalAudit)
  .then(loadCursorInsertion)
  .then(loadPodcastExportMode)
  .then(loadMode2Synchronization)
  .then(loadExportWatchdog)
  .catch((error) => {
    console.error(error);
    showToast('L’application n’a pas pu démarrer correctement.');
  });
