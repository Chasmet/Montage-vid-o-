function closeAllSheets() {
  [els.volumeSheet, els.cameraSheet, els.projectSheet].forEach((sheet) => sheet?.classList.add('hidden'));
  $$('.dock-btn').forEach((button) => button.classList.remove('active'));
}

function openSheet(sheet, trigger = null) {
  const wasOpen = !sheet.classList.contains('hidden');
  closeAllSheets();
  if (!wasOpen) {
    sheet.classList.remove('hidden');
    trigger?.classList.add('active');
  }
}

(() => {
  els.volumeToolBtn.addEventListener('click', () => {
    if (!getSelectedItem()) return showToast('Sélectionne un clip sur la timeline.');
    openSheet(els.volumeSheet, els.volumeToolBtn);
  });

  els.quickCameraBtn.addEventListener('click', () => openSheet(els.cameraSheet, els.quickCameraBtn));
  els.projectToolBtn.addEventListener('click', () => openSheet(els.projectSheet, els.projectToolBtn));
  $$('[data-close-sheet]').forEach((button) => button.addEventListener('click', closeAllSheets));

  els.fullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (els.stage?.requestFullscreen) await els.stage.requestFullscreen();
    } catch {
      showToast('Le plein écran n’est pas disponible sur cet appareil.');
    }
  });

  $('#closeWorkspaceBtn')?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (window.history.length > 1) window.history.back();
    else showToast('Le projet est sauvegardé automatiquement.');
  });

  document.addEventListener('pointerdown', (event) => {
    const sheet = event.target.closest('.bottom-sheet');
    const tool = event.target.closest('#volumeToolBtn,#quickCameraBtn,#projectToolBtn');
    if (!sheet && !tool && !event.target.closest('.timeline-clip')) closeAllSheets();
  });
})();
