'use strict';

(() => {
  const FINAL_VERSION = '2.6.0';
  const STORAGE_SAFETY_BYTES = 48 * 1024 * 1024;
  const GC_DELAY = 3500;
  let mediaGcTimer = null;
  let diagnosticsTimer = null;
  let exportLaunchLocked = false;

  const originalPutBlob = putBlob;
  const originalSnapshot = snapshot;

  function revokeUrl(url) {
    if (!url || !String(url).startsWith('blob:')) return;
    try { URL.revokeObjectURL(url); } catch { /* URL déjà libérée */ }
  }

  function revokeProjectUrls(project = state) {
    revokeUrl(project?.source?.url);
    (project?.cameraClips || []).forEach((clip) => revokeUrl(clip?.url));
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return false;
    try {
      const alreadyPersistent = await navigator.storage.persisted?.();
      if (alreadyPersistent) return true;
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }

  async function storageEstimate() {
    if (!navigator.storage?.estimate) return null;
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: Number(estimate.usage) || 0,
        quota: Number(estimate.quota) || 0,
        free: Math.max(0, (Number(estimate.quota) || 0) - (Number(estimate.usage) || 0))
      };
    } catch {
      return null;
    }
  }

  function humanBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} Ko`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} Mo`;
    return `${(bytes / 1024 ** 3).toFixed(1)} Go`;
  }

  async function assertStorageCapacity(blob) {
    if (!blob?.size) return;
    const estimate = await storageEstimate();
    if (!estimate?.quota) return;
    const required = Math.ceil(blob.size * 1.2) + STORAGE_SAFETY_BYTES;
    if (estimate.free < required) {
      throw new Error(`Stockage insuffisant. Libère environ ${humanBytes(required - estimate.free)} puis recommence.`);
    }
  }

  putBlob = async function auditedPutBlob(key, blob) {
    await assertStorageCapacity(blob);
    try {
      return await originalPutBlob(key, blob);
    } catch (error) {
      const quotaError = error?.name === 'QuotaExceededError' || /quota|storage|espace/i.test(error?.message || '');
      if (quotaError) {
        throw new Error('Le téléphone manque d’espace pour conserver cette vidéo. Libère du stockage puis réessaie.');
      }
      throw error;
    }
  };

  function collectBlobKeysFromProject(project, destination) {
    if (!project || !destination) return;
    if (project.source?.blobKey) destination.add(project.source.blobKey);
    (project.cameraClips || []).forEach((clip) => {
      if (clip?.blobKey) destination.add(clip.blobKey);
    });
  }

  function collectReferencedBlobKeys() {
    const keys = new Set();
    collectBlobKeysFromProject(state, keys);
    [...history, ...future].forEach((raw) => {
      try { collectBlobKeysFromProject(JSON.parse(raw), keys); } catch { /* historique ancien invalide */ }
    });
    return keys;
  }

  function getAllBlobKeys() {
    if (!db) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('blobs', 'readonly');
      const request = tx.objectStore('blobs').getAllKeys();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function garbageCollectMedia() {
    if (!db) return;
    const referenced = collectReferencedBlobKeys();
    const allKeys = await getAllBlobKeys().catch(() => []);
    await Promise.all(allKeys
      .filter((key) => !referenced.has(key))
      .map((key) => deleteBlob(key).catch(() => {})));
    updateDiagnosticsSoon();
  }

  function scheduleMediaGarbageCollection() {
    clearTimeout(mediaGcTimer);
    mediaGcTimer = setTimeout(() => garbageCollectMedia().catch(() => {}), GC_DELAY);
  }

  snapshot = function auditedSnapshot() {
    originalSnapshot();
    scheduleMediaGarbageCollection();
  };

  async function hydrateAndRepairProject() {
    const missingCameraIds = new Set();
    let missingSource = false;

    if (state.source?.blobKey && !state.source.url) {
      const blob = await getBlob(state.source.blobKey).catch(() => null);
      if (blob) state.source.url = URL.createObjectURL(blob);
      else missingSource = true;
    }

    for (const clip of state.cameraClips || []) {
      if (clip.url || !clip.blobKey) continue;
      const blob = await getBlob(clip.blobKey).catch(() => null);
      if (blob) clip.url = URL.createObjectURL(blob);
      else missingCameraIds.add(clip.id);
    }

    if (missingSource) {
      state.source = null;
      state.timelineSegments = state.timelineSegments.filter((segment) => segment.type !== 'source');
    }
    if (missingCameraIds.size) {
      state.cameraClips = state.cameraClips.filter((clip) => !missingCameraIds.has(clip.id));
      state.timelineSegments = state.timelineSegments.filter((segment) => !missingCameraIds.has(segment.mediaId));
    }

    const total = timelineDuration();
    state.timelineTime = clamp(state.timelineTime, 0, total);
    if (!state.timelineSegments.some((segment) => segment.id === state.selectedId)) {
      state.selectedId = state.timelineSegments[0]?.id || null;
    }

    const repaired = missingSource || missingCameraIds.size > 0;
    if (repaired) {
      safeStorage.set('remix-studio-state', JSON.stringify(serializableState()));
      setTimeout(() => showToast('Projet réparé : les médias devenus indisponibles ont été retirés.'), 250);
    }
    return { repaired, missingSource, missingCameraCount: missingCameraIds.size };
  }

  hydrateMediaUrls = hydrateAndRepairProject;

  restoreSnapshot = function auditedRestoreSnapshot(raw) {
    revokeProjectUrls(state);
    try {
      state = migrateSavedState(JSON.parse(raw));
    } catch {
      showToast('Cette étape de l’historique est endommagée.');
      return;
    }
    hydrateAndRepairProject().then(() => {
      activePreviewSegmentId = null;
      renderAll();
      setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
      scheduleSave();
      scheduleMediaGarbageCollection();
    }).catch((error) => {
      console.error(error);
      showToast('Impossible de restaurer complètement cette étape.');
    });
  };

  importSource = async function auditedImportSource(file) {
    if (!file) return;
    if (!file.type?.startsWith('video/')) return showToast('Le fichier choisi n’est pas une vidéo.');

    let url = null;
    const blobKey = `source-${uid('media')}`;
    try {
      stopTimelinePreview();
      await putBlob(blobKey, file);
      url = URL.createObjectURL(file);
      const meta = await readVideoMetadata(url);
      snapshot();

      revokeUrl(state.source?.url);
      const oldSourceIndex = state.timelineSegments.findIndex((segment) => segment.type === 'source');
      state.source = {
        id: 'source', blobKey, url, name: file.name || 'Vidéo importée',
        size: file.size, type: file.type, ...meta
      };

      state.timelineSegments = state.timelineSegments.filter((segment) => segment.type !== 'source');
      const sourceSegment = buildSegment('source', 'source', 0, meta.duration, file.name || 'Vidéo importée');
      state.timelineSegments.splice(Math.max(0, oldSourceIndex), 0, sourceSegment);
      state.selectedId = sourceSegment.id;
      state.timelineTime = projectTimeForSegment(sourceSegment.id);
      state.activeMedia = { type: 'source', mediaId: 'source' };
      activePreviewSegmentId = null;

      renderAll();
      setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
      scheduleSave();
      scheduleMediaGarbageCollection();
      updateDiagnosticsSoon();
      showToast('Vidéo importée et sécurisée dans le projet.');
    } catch (error) {
      console.error(error);
      if (url) revokeUrl(url);
      await deleteBlob(blobKey).catch(() => {});
      showToast(error.message || 'Impossible d’importer cette vidéo.');
    } finally {
      els.videoInput.value = '';
    }
  };

  async function deleteSelectedSafely() {
    const segment = getSelectedItem();
    if (!segment) return showToast('Sélectionne un clip à supprimer.');
    const index = state.timelineSegments.findIndex((item) => item.id === segment.id);
    const start = projectTimeForSegment(segment.id);
    snapshot();
    state.timelineSegments.splice(index, 1);

    if (segment.type === 'camera' && !state.timelineSegments.some((item) => item.type === 'camera' && item.mediaId === segment.mediaId)) {
      const media = state.cameraClips.find((clip) => clip.id === segment.mediaId);
      revokeUrl(media?.url);
      // Le blob est conservé tant que l’action peut être annulée. Le nettoyage différé le supprimera ensuite.
      state.cameraClips = state.cameraClips.filter((clip) => clip.id !== segment.mediaId);
    }

    state.timelineTime = clamp(start, 0, timelineDuration());
    const next = state.timelineSegments[Math.min(index, state.timelineSegments.length - 1)] || null;
    state.selectedId = next?.id || null;
    activePreviewSegmentId = null;
    renderAll();
    setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
    scheduleSave();
    scheduleMediaGarbageCollection();
    updateDiagnosticsSoon();
    showToast('Clip supprimé. Tu peux encore annuler cette action.');
  }

  deleteSelected = deleteSelectedSafely;
  els.deleteClipBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    deleteSelectedSafely();
  }, true);

  function projectMediaProblems() {
    const problems = [];
    state.timelineSegments.forEach((segment, index) => {
      const media = getMediaByRef(segment.type, segment.mediaId);
      if (!media) problems.push(`Clip ${index + 1} sans média`);
      else if (!media.url) problems.push(`Clip ${index + 1} non chargé`);
      if (segmentDuration(segment) <= 0.04) problems.push(`Clip ${index + 1} trop court`);
      if (media?.duration && segment.end > media.duration + 0.08) problems.push(`Clip ${index + 1} dépasse sa vidéo`);
    });
    return problems;
  }

  els.exportBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (exportLaunchLocked) return;
    exportLaunchLocked = true;
    try {
      await hydrateAndRepairProject();
      const problems = projectMediaProblems();
      if (problems.length) {
        renderAll();
        return showToast(`Export bloqué : ${problems[0]}.`);
      }
      safeStorage.set('remix-studio-state', JSON.stringify(serializableState()));
      await exportTimeline();
    } finally {
      exportLaunchLocked = false;
    }
  }, true);

  function saveImmediately() {
    clearTimeout(autosaveTimer);
    try {
      safeStorage.set('remix-studio-state', JSON.stringify(serializableState()));
      setSaving(false);
    } catch { /* sauvegarde déjà protégée par safeStorage */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveImmediately();
  });
  window.addEventListener('pagehide', saveImmediately, { passive: true });

  async function disableNativeServiceWorkerCache() {
    let native = false;
    try { native = window.Android?.getPlatform?.() === 'android'; } catch { native = Boolean(window.Android); }
    if (!native || !('serviceWorker' in navigator)) return;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name.startsWith('remix-studio-')).map((name) => caches.delete(name)));
      }
    } catch { /* le WebView peut interdire l’accès aux caches */ }
  }

  function injectAuditStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .project-health-card{grid-column:1/-1;padding:11px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#0b0f16;display:grid;gap:7px}
      .project-health-line{display:flex;justify-content:space-between;gap:10px;font-size:.69rem;color:#9ea6b5}
      .project-health-line strong{color:#f5f7fa;text-align:right}
      .project-health-ok{color:#42dba4!important}.project-health-warning{color:#ffb45f!important}
      .project-health-button{min-height:40px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#202632;color:#fff;font-weight:800}
    `;
    document.head.append(style);
  }

  function mountDiagnostics() {
    if (!els.projectSheet || document.querySelector('#projectHealthCard')) return;
    injectAuditStyles();
    const card = document.createElement('div');
    card.id = 'projectHealthCard';
    card.className = 'project-health-card';
    card.innerHTML = `
      <div class="project-health-line"><span>État du projet</span><strong id="projectHealthState">Vérification…</strong></div>
      <div class="project-health-line"><span>Médias sauvegardés</span><strong id="projectHealthMedia">—</strong></div>
      <div class="project-health-line"><span>Stockage disponible</span><strong id="projectHealthStorage">—</strong></div>
      <button id="projectHealthButton" class="project-health-button" type="button">Vérifier et réparer</button>
    `;
    const grid = els.projectSheet.querySelector('.settings-grid');
    (grid || els.projectSheet).append(card);
    card.querySelector('#projectHealthButton').addEventListener('click', async () => {
      await hydrateAndRepairProject();
      renderAll();
      scheduleSave();
      await updateDiagnostics();
      showToast('Vérification du projet terminée.');
    });
  }

  async function updateDiagnostics() {
    mountDiagnostics();
    const stateElement = document.querySelector('#projectHealthState');
    const mediaElement = document.querySelector('#projectHealthMedia');
    const storageElement = document.querySelector('#projectHealthStorage');
    if (!stateElement || !mediaElement || !storageElement) return;

    const problems = projectMediaProblems();
    stateElement.textContent = problems.length ? `${problems.length} problème${problems.length > 1 ? 's' : ''}` : 'Projet sain';
    stateElement.className = problems.length ? 'project-health-warning' : 'project-health-ok';
    const mediaCount = (state.source ? 1 : 0) + state.cameraClips.length;
    mediaElement.textContent = `${mediaCount} média${mediaCount > 1 ? 's' : ''} · ${state.timelineSegments.length} clip${state.timelineSegments.length > 1 ? 's' : ''}`;
    const estimate = await storageEstimate();
    storageElement.textContent = estimate?.quota ? `${humanBytes(estimate.free)} libres` : 'Non mesurable';
  }

  function updateDiagnosticsSoon() {
    clearTimeout(diagnosticsTimer);
    diagnosticsTimer = setTimeout(() => updateDiagnostics().catch(() => {}), 350);
  }

  window.addEventListener('error', (event) => {
    console.error('Erreur Remix Studio', event.error || event.message);
    if (!els.exportOverlay?.classList.contains('hidden')) return;
    showToast('Une erreur a été interceptée. Le projet reste sauvegardé.');
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Promesse rejetée Remix Studio', event.reason);
    if (!els.exportOverlay?.classList.contains('hidden')) return;
    showToast(event.reason?.message || 'Une opération a échoué sans supprimer le projet.');
  });

  requestPersistentStorage().catch(() => {});
  disableNativeServiceWorkerCache().catch(() => {});
  setTimeout(async () => {
    await hydrateAndRepairProject().catch(() => {});
    renderAll();
    if (state.timelineSegments.length) {
      setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
    }
    updateDiagnosticsSoon();
    scheduleMediaGarbageCollection();
    document.documentElement.dataset.remixFinalVersion = FINAL_VERSION;
  }, 500);
})();
