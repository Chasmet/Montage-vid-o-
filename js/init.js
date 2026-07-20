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

  // Le défilement et le pincement sont gérés uniquement dans timeline-zoom.js.
  // L’ancien second gestionnaire provoquait deux calculs et deux recherches vidéo pour chaque mouvement.
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
    if (event.key.toLowerCase() === 's' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      splitAtPlayhead();
    }
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

function loadFinalAudit() {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-remix-final-audit]')) return resolve();
    const script = document.createElement('script');
    script.src = 'js/final-audit.js';
    script.dataset.remixFinalAudit = '2.6.0';
    script.onload = resolve;
    script.onerror = () => reject(new Error('La couche de sécurité finale n’a pas pu être chargée.'));
    document.body.appendChild(script);
  });
}

function loadCursorInsertion() {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-remix-cursor-insertion]')) return resolve();
    const script = document.createElement('script');
    script.src = 'js/insertion-cursor.js';
    script.dataset.remixCursorInsertion = '2.7.0';
    script.onload = resolve;
    script.onerror = () => reject(new Error('La logique d’insertion à la ligne blanche n’a pas pu être chargée.'));
    document.body.appendChild(script);
  });
}

function loadPodcastExportMode() {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-remix-podcast-mode]')) return resolve();
    const script = document.createElement('script');
    script.src = 'js/export-mode2.js';
    script.dataset.remixPodcastMode = '2.8.0';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Le Mode 2 interview naturelle n’a pas pu être chargé.'));
    document.body.appendChild(script);
  });
}

function loadExportWatchdog() {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-remix-export-watchdog]')) return resolve();
    const script = document.createElement('script');
    script.src = 'js/export-watchdog.js';
    script.dataset.remixExportWatchdog = '2.8.1';
    script.onload = resolve;
    script.onerror = () => reject(new Error('La protection anti-blocage de l’export n’a pas pu être chargée.'));
    document.body.appendChild(script);
  });
}

init()
  .then(loadFinalAudit)
  .then(loadCursorInsertion)
  .then(loadPodcastExportMode)
  .then(loadExportWatchdog)
  .catch((error) => {
    console.error(error);
    showToast('L’application n’a pas pu démarrer correctement.');
  });
