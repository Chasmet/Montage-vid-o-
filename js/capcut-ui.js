(() => {
  const panelButtons = [...document.querySelectorAll('.dock-btn[data-panel]')];
  const panels = [...document.querySelectorAll('.tool-panel')];

  function showPanel(panelId) {
    panels.forEach((panel) => panel.classList.toggle('active', panel.id === panelId));
    panelButtons.forEach((button) => button.classList.toggle('active', button.dataset.panel === panelId));
  }

  panelButtons.forEach((button) => button.addEventListener('click', () => showPanel(button.dataset.panel)));

  const selectionDuration = document.getElementById('selectionDuration');
  const updateSelectionDuration = () => {
    if (!selectionDuration || typeof currentTrim !== 'function') return;
    const { start, end } = currentTrim();
    selectionDuration.textContent = `Sélection ${Math.max(0, end - start).toFixed(1).replace('.', ',')} s`;
  };

  ['trimStartNumber', 'trimEndNumber', 'trimStartRange', 'trimEndRange'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateSelectionDuration);
    document.getElementById(id)?.addEventListener('change', updateSelectionDuration);
  });

  document.getElementById('sourceLaneAdd')?.addEventListener('click', () => document.getElementById('videoInput')?.click());
  document.getElementById('quickCameraBtn')?.addEventListener('click', () => {
    showPanel('cameraPanel');
    document.getElementById('cameraBtn')?.click();
  });
  document.getElementById('cameraLaneAdd')?.addEventListener('click', () => {
    showPanel('cameraPanel');
    document.getElementById('cameraBtn')?.click();
  });
  document.getElementById('finalLaneAdd')?.addEventListener('click', () => {
    document.getElementById('addSelectedToFinalBtn')?.click();
  });

  document.getElementById('quickMuteBtn')?.addEventListener('click', () => {
    const item = typeof getSelectedItem === 'function' ? getSelectedItem() : null;
    if (item && state.selected?.collection !== 'cameraClips') {
      selectedItemMutation((clip) => { clip.muted = !clip.muted; });
      showToast(item.muted ? 'Son du clip coupé.' : 'Son du clip activé.');
      return;
    }
    const video = document.getElementById('mainVideo');
    video.muted = !video.muted;
    showToast(video.muted ? 'Aperçu sans son.' : 'Son de l’aperçu activé.');
  });

  document.getElementById('dockExportBtn')?.addEventListener('click', () => {
    showPanel('projectPanel');
    if (!state.finalSegments.length) {
      showToast('Ajoute d’abord des extraits dans Vidéos finales.');
      return;
    }
    document.getElementById('exportBtn')?.click();
  });

  document.getElementById('fullscreenBtn')?.addEventListener('click', async () => {
    const stage = document.getElementById('stage');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage?.requestFullscreen) await stage.requestFullscreen();
    } catch (error) {
      showToast('Le plein écran n’est pas disponible sur cet appareil.');
    }
  });

  document.getElementById('closeWorkspaceBtn')?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (window.history.length > 1) window.history.back();
    else showToast('Le projet est sauvegardé automatiquement.');
  });

  const observer = new MutationObserver(() => updateSelectionDuration());
  observer.observe(document.getElementById('durationTime'), { childList: true, subtree: true });
  updateSelectionDuration();
})();
