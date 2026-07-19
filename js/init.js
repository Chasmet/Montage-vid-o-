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

  els.timelineScroll.addEventListener('scroll', () => {
    if (timelineScrollSync || isTimelinePreviewing) return;
    const time = clamp(els.timelineScroll.scrollLeft / TIMELINE_PX_PER_SECOND, 0, timelineDuration());
    state.timelineTime = time;
    updateProjectLabels();
    clearTimeout(timelineSeekTimer);
    timelineSeekTimer = setTimeout(() => {
      setTimelineTime(time, { preview: true, syncScroll: false, select: true, force: false });
    }, 55);
  }, { passive: true });

  window.addEventListener('resize', () => syncTimelineScrollFromState());
  window.addEventListener('beforeunload', () => currentStream?.getTracks().forEach((track) => track.stop()));
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

init().catch((error) => {
  console.error(error);
  showToast('L’application n’a pas pu démarrer correctement.');
});
