'use strict';

(() => {
  const VERSION = '2.7.0';
  const EDGE_TOLERANCE = 0.08;
  let pendingCameraInsertionIndex = null;
  let lastInsertedSegmentId = null;

  function insertionIndexAtCursor() {
    if (!state.timelineSegments.length) return 0;
    const info = timelineInfoAt(state.timelineTime);
    if (!info) return state.timelineSegments.length;

    const duration = segmentDuration(info.segment);
    if (info.local <= EDGE_TOLERANCE) {
      return info.segment.id === lastInsertedSegmentId ? info.index + 1 : info.index;
    }
    if (duration - info.local <= EDGE_TOLERANCE) return info.index + 1;
    return info.index + 1;
  }

  function insertFullMediaAt(index, type, media, label = '') {
    if (!media || Number(media.duration) <= 0) return null;
    const segment = buildSegment(
      type,
      type === 'source' ? 'source' : media.id,
      0,
      media.duration,
      label || media.name || (type === 'source' ? 'Vidéo importée' : 'Prise caméra')
    );
    const safeIndex = clamp(index, 0, state.timelineSegments.length);
    state.timelineSegments.splice(safeIndex, 0, segment);
    state.selectedId = segment.id;
    state.timelineTime = projectTimeForSegment(segment.id);
    state.activeMedia = { type, mediaId: type === 'source' ? 'source' : media.id };
    lastInsertedSegmentId = segment.id;
    return segment;
  }

  function finishInsertion(segment, message) {
    activePreviewSegmentId = null;
    renderAll();
    setTimelineTime(projectTimeForSegment(segment.id), {
      preview: true,
      syncScroll: true,
      select: true,
      force: true
    });
    scheduleSave();
    showToast(message);
  }

  importSource = async function importAtCursor(file) {
    if (!file) return;
    if (!file.type?.startsWith('video/')) return showToast('Le fichier choisi n’est pas une vidéo.');

    const insertionIndex = insertionIndexAtCursor();
    const firstProjectVideo = !state.source;
    const mediaId = firstProjectVideo ? 'source' : uid('import');
    const blobKey = `${firstProjectVideo ? 'source' : 'import'}-${uid('media')}`;
    let url = null;

    try {
      stopTimelinePreview();
      await putBlob(blobKey, file);
      url = URL.createObjectURL(file);
      const meta = await readVideoMetadata(url);
      snapshot();

      if (firstProjectVideo) {
        state.source = {
          id: 'source',
          blobKey,
          url,
          name: file.name || 'Vidéo importée',
          size: file.size,
          type: file.type,
          origin: 'import',
          ...meta
        };
        const segment = insertFullMediaAt(insertionIndex, 'source', state.source, state.source.name);
        finishInsertion(segment, 'Vidéo importée à la position de la ligne blanche.');
      } else {
        const clip = {
          id: mediaId,
          blobKey,
          url,
          name: file.name || `Vidéo importée ${state.cameraClips.length + 1}`,
          type: file.type,
          size: file.size,
          origin: 'import',
          ...meta
        };
        state.cameraClips.push(clip);
        const segment = insertFullMediaAt(insertionIndex, 'camera', clip, clip.name);
        finishInsertion(segment, 'Nouvelle vidéo insérée juste à côté de la coupe.');
      }
    } catch (error) {
      console.error(error);
      if (url) {
        try { URL.revokeObjectURL(url); } catch { /* URL déjà libérée */ }
      }
      await deleteBlob(blobKey).catch(() => {});
      showToast(error.message || 'Impossible d’importer cette vidéo.');
    } finally {
      els.videoInput.value = '';
    }
  };

  function rememberCameraInsertionPoint() {
    pendingCameraInsertionIndex = insertionIndexAtCursor();
  }

  els.cameraBtn?.addEventListener('click', rememberCameraInsertionPoint, true);

  saveCameraBlob = async function saveCameraAtCursor(blob, suggestedName = '') {
    const insertionIndex = pendingCameraInsertionIndex ?? insertionIndexAtCursor();
    const id = uid('cam');
    const blobKey = `camera-${id}`;
    let url = null;

    try {
      await putBlob(blobKey, blob);
      url = URL.createObjectURL(blob);
      const meta = await readVideoMetadata(url);
      snapshot();
      const clip = {
        id,
        blobKey,
        url,
        name: suggestedName || `Prise caméra ${state.cameraClips.length + 1}`,
        type: blob.type || 'video/mp4',
        size: blob.size,
        origin: 'camera',
        ...meta
      };
      state.cameraClips.push(clip);
      const segment = insertFullMediaAt(insertionIndex, 'camera', clip, clip.name);
      pendingCameraInsertionIndex = null;
      await closeCamera();
      closeAllSheets();
      finishInsertion(segment, 'Prise caméra insérée juste à côté de la coupe.');
    } catch (error) {
      pendingCameraInsertionIndex = null;
      if (url) {
        try { URL.revokeObjectURL(url); } catch { /* URL déjà libérée */ }
      }
      await deleteBlob(blobKey).catch(() => {});
      throw error;
    }
  };

  const originalNativeCanceled = window.onNativeCameraCanceled;
  window.onNativeCameraCanceled = () => {
    pendingCameraInsertionIndex = null;
    originalNativeCanceled?.();
  };

  const originalNativeError = window.onNativeCameraError;
  window.onNativeCameraError = (message) => {
    pendingCameraInsertionIndex = null;
    originalNativeError?.(message);
  };

  document.documentElement.dataset.remixInsertionVersion = VERSION;
})();
