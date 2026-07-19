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
  els.viewTabs.forEach((tab) => tab.addEventListener('click', () => setActiveView(tab.dataset.view)));
  els.cameraBtn.addEventListener('click', openCamera);
  els.recordBtn.addEventListener('click', startRecording);
  els.stopRecordBtn.addEventListener('click', stopRecording);
  els.playBtn.addEventListener('click', togglePlay);
  els.jumpStartBtn.addEventListener('click', () => seekTo(currentTrim().start));
  els.jumpEndBtn.addEventListener('click', () => seekTo(currentTrim().end));
  els.mainVideo.addEventListener('timeupdate', updateTimeDisplay);
  els.mainVideo.addEventListener('play', () => { els.playBtn.textContent = 'Ⅱ'; });
  els.mainVideo.addEventListener('pause', () => { els.playBtn.textContent = '▶'; });
  els.trimStartNumber.addEventListener('change', syncTrimFromNumbers);
  els.trimEndNumber.addEventListener('change', syncTrimFromNumbers);
  els.trimStartRange.addEventListener('input', () => syncTrimFromRanges('start'));
  els.trimEndRange.addEventListener('input', () => syncTrimFromRanges('end'));
  els.setInBtn.addEventListener('click', () => {
    els.trimStartNumber.value = (els.mainVideo.currentTime || 0).toFixed(2);
    syncTrimFromNumbers();
  });
  els.setOutBtn.addEventListener('click', () => {
    els.trimEndNumber.value = (els.mainVideo.currentTime || 0).toFixed(2);
    syncTrimFromNumbers();
  });
  els.markCurrentBtn.addEventListener('click', () => showToast(`Temps actuel : ${formatTime(els.mainVideo.currentTime || 0, true)}`));
  els.keepSourceBtn.addEventListener('click', keepSourceSegment);
  els.addSelectedToFinalBtn.addEventListener('click', addActiveSelectionToFinal);
  els.cameraOrientation.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.cameraSelect.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.micSelect.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.referenceToggle.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.noiseToggle.addEventListener('change', () => { if (currentStream) openCamera(); });
  els.previewFinalBtn.addEventListener('click', previewFinal);
  els.clearProjectBtn.addEventListener('click', clearProject);
  els.volumeRange.addEventListener('input', () => selectedItemMutation((item) => { item.volume = Number(els.volumeRange.value); }));
  els.fitSelect.addEventListener('change', () => selectedItemMutation((item) => { item.fit = els.fitSelect.value; }));
  els.transitionSelect.addEventListener('change', () => selectedItemMutation((item) => { item.transition = els.transitionSelect.value; }));
  els.muteToggle.addEventListener('change', () => selectedItemMutation((item) => { item.muted = els.muteToggle.checked; }));
  els.moveLeftBtn.addEventListener('click', () => moveSelected(-1));
  els.moveRightBtn.addEventListener('click', () => moveSelected(1));
  els.duplicateBtn.addEventListener('click', duplicateSelected);
  els.deleteClipBtn.addEventListener('click', deleteSelected);
  els.outputAspect.addEventListener('change', () => { state.outputAspect = els.outputAspect.value; scheduleSave(); });
  els.qualitySelect.addEventListener('change', () => { state.quality = els.qualitySelect.value; scheduleSave(); });
  els.exportBtn.addEventListener('click', exportFinal);
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
  loadSelectedMedia();
  enumerateDevices().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('Service worker', error));
  }
}

init().catch((error) => {
  console.error(error);
  showToast('L’application n’a pas pu démarrer correctement.');
});