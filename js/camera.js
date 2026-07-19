async function readVideoMetadata(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.onloadedmetadata = () => resolve({
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      orientation: inferOrientation(video.videoWidth, video.videoHeight)
    });
    video.onerror = () => reject(new Error('Vidéo illisible sur cet appareil.'));
    video.src = url;
  });
}

function nativeCameraAvailable() {
  try {
    return Boolean(window.Android?.hasNativeCamera?.());
  } catch {
    return false;
  }
}

async function importSource(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) return showToast('Le fichier choisi n’est pas une vidéo.');
  try {
    stopTimelinePreview();
    const blobKey = 'source-video';
    await putBlob(blobKey, file);
    const url = URL.createObjectURL(file);
    const meta = await readVideoMetadata(url);
    snapshot();

    if (state.source?.url) URL.revokeObjectURL(state.source.url);
    state.source = { id: 'source', blobKey, url, name: file.name, size: file.size, type: file.type, ...meta };

    const firstSourceIndex = state.timelineSegments.findIndex((segment) => segment.type === 'source');
    state.timelineSegments = state.timelineSegments.filter((segment) => segment.type !== 'source');
    const sourceSegment = buildSegment('source', 'source', 0, meta.duration, file.name || 'Vidéo importée');
    state.timelineSegments.splice(Math.max(0, firstSourceIndex), 0, sourceSegment);
    state.selectedId = sourceSegment.id;
    state.timelineTime = projectTimeForSegment(sourceSegment.id);
    state.activeMedia = { type: 'source', mediaId: 'source' };

    renderAll();
    setTimelineTime(state.timelineTime, { preview: true, syncScroll: true, select: true, force: true });
    scheduleSave();
    showToast('Vidéo importée et ajoutée directement à la timeline.');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Impossible d’importer cette vidéo.');
  } finally {
    els.videoInput.value = '';
  }
}

async function enumerateDevices() {
  if (nativeCameraAvailable()) {
    els.cameraSelect.innerHTML = '<option value="native">Caméra native Android</option>';
    els.micSelect.innerHTML = '<option value="native">Micro du téléphone</option>';
    els.cameraSelect.disabled = true;
    els.micSelect.disabled = true;
    return;
  }
  if (!navigator.mediaDevices?.enumerateDevices) return;
  els.cameraSelect.disabled = false;
  els.micSelect.disabled = false;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  const mics = devices.filter((device) => device.kind === 'audioinput');
  const selectedCamera = els.cameraSelect.value;
  const selectedMic = els.micSelect.value;
  els.cameraSelect.innerHTML = '<option value="">Automatique</option>';
  els.micSelect.innerHTML = '<option value="">Micro du téléphone</option>';
  cameras.forEach((device, index) => els.cameraSelect.add(new Option(device.label || `Caméra ${index + 1}`, device.deviceId)));
  mics.forEach((device, index) => els.micSelect.add(new Option(device.label || `Micro ${index + 1}`, device.deviceId)));
  if ([...els.cameraSelect.options].some((option) => option.value === selectedCamera)) els.cameraSelect.value = selectedCamera;
  if ([...els.micSelect.options].some((option) => option.value === selectedMic)) els.micSelect.value = selectedMic;
}

function desiredCameraOrientation() {
  if (els.cameraOrientation.value !== 'auto') return els.cameraOrientation.value;
  const selected = getSelectedItem();
  const media = selected ? getMediaByRef(selected.type, selected.mediaId) : state.source;
  return selected ? effectiveOrientation(media, selected.rotation) : (state.source?.orientation || 'vertical');
}

async function openNativeCamera() {
  stopTimelinePreview();
  await closeCamera();
  const orientation = desiredCameraOrientation();
  const selected = getSelectedItem();
  const referenceStart = selected?.type === 'source' ? (els.mainVideo.currentTime || selected.start || 0) : 0;
  const showReference = Boolean(els.referenceToggle.checked && state.source);
  showToast('Ouverture de la caméra native du téléphone…');
  try {
    window.Android.startNativeCamera(orientation, referenceStart, showReference);
  } catch (error) {
    console.error(error);
    showToast('Impossible d’ouvrir la caméra native Android.');
  }
}

async function openCamera() {
  if (nativeCameraAvailable()) return openNativeCamera();
  try {
    stopTimelinePreview();
    await closeCamera();
    const orientation = desiredCameraOrientation();
    const isVertical = orientation === 'vertical';
    const noise = els.noiseToggle.checked;
    const videoConstraint = els.cameraSelect.value
      ? { deviceId: { exact: els.cameraSelect.value }, width: { ideal: isVertical ? 1080 : 1920 }, height: { ideal: isVertical ? 1920 : 1080 } }
      : { facingMode: 'user', width: { ideal: isVertical ? 1080 : 1920 }, height: { ideal: isVertical ? 1920 : 1080 } };
    const audioConstraint = els.micSelect.value
      ? { deviceId: { exact: els.micSelect.value }, echoCancellation: noise, noiseSuppression: noise, autoGainControl: noise, channelCount: 1, sampleRate: 48000 }
      : { echoCancellation: noise, noiseSuppression: noise, autoGainControl: noise, channelCount: 1, sampleRate: 48000 };
    currentStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: audioConstraint });
    els.cameraPreview.srcObject = currentStream;
    els.cameraPreview.classList.remove('hidden');
    els.mainVideo.classList.add('hidden');
    els.emptyStage.classList.add('hidden');
    setStageOrientation(orientation);
    els.previewTitle.textContent = 'Caméra en direct';
    els.recordBtn.disabled = false;
    els.stopRecordBtn.disabled = true;

    if (els.referenceToggle.checked && state.source?.url) {
      els.referencePreview.src = state.source.url;
      const selected = getSelectedItem();
      els.referencePreview.currentTime = selected?.type === 'source' ? (els.mainVideo.currentTime || selected.start || 0) : 0;
      els.referencePreview.classList.remove('hidden');
      els.referencePreview.play().catch(() => {});
    } else {
      els.referencePreview.classList.add('hidden');
    }
    await enumerateDevices();
  } catch (error) {
    console.error(error);
    showToast('Autorise la caméra et le micro dans les réglages du navigateur.');
  }
}

async function closeCamera() {
  if (recorder?.state === 'recording') recorder.stop();
  currentStream?.getTracks().forEach((track) => track.stop());
  currentStream = null;
  els.cameraPreview.srcObject = null;
  els.cameraPreview.classList.add('hidden');
  els.referencePreview.pause();
  els.referencePreview.classList.add('hidden');
  els.recordBtn.disabled = true;
  els.stopRecordBtn.disabled = true;
  els.recordBadge.classList.add('hidden');
}

function supportedRecorderMime() {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function runCountdown() {
  let seconds = Number(els.countdownSelect.value) || 0;
  if (!seconds) return;
  els.countdown.classList.remove('hidden');
  while (seconds > 0) {
    els.countdown.textContent = String(seconds);
    await sleep(1000);
    seconds -= 1;
  }
  els.countdown.classList.add('hidden');
}

async function startRecording() {
  if (nativeCameraAvailable()) return openNativeCamera();
  if (!currentStream) return openCamera();
  await runCountdown();
  recorderChunks = [];
  const mimeType = supportedRecorderMime();
  recorder = new MediaRecorder(currentStream, mimeType ? { mimeType, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 160_000 } : undefined);
  recorder.ondataavailable = (event) => { if (event.data.size) recorderChunks.push(event.data); };
  recorder.onstop = saveRecording;
  recorder.start(500);
  els.recordBadge.classList.remove('hidden');
  els.recordBtn.disabled = true;
  els.stopRecordBtn.disabled = false;
  if (els.referenceToggle.checked && state.source?.url) els.referencePreview.play().catch(() => {});
}

function stopRecording() {
  if (recorder?.state !== 'recording') return;
  recorder.stop();
  els.recordBadge.classList.add('hidden');
  els.stopRecordBtn.disabled = true;
  els.recordBtn.disabled = false;
  els.referencePreview.pause();
}

async function saveCameraBlob(blob, suggestedName = '') {
  const id = uid('cam');
  const blobKey = `camera-${id}`;
  await putBlob(blobKey, blob);
  const url = URL.createObjectURL(blob);
  const meta = await readVideoMetadata(url);
  snapshot();
  const clip = {
    id,
    blobKey,
    url,
    name: suggestedName || `Prise caméra ${state.cameraClips.length + 1}`,
    type: blob.type || 'video/mp4',
    size: blob.size,
    ...meta
  };
  state.cameraClips.push(clip);
  const segment = appendFullMediaToTimeline('camera', clip, clip.name);
  await closeCamera();
  closeAllSheets();
  renderAll();
  setTimelineTime(projectTimeForSegment(segment.id), { preview: true, syncScroll: true, select: true, force: true });
  scheduleSave();
  showToast('Prise caméra ajoutée directement à la timeline.');
}

async function saveRecording() {
  if (!recorderChunks.length) return;
  try {
    const blob = new Blob(recorderChunks, { type: recorder.mimeType || 'video/webm' });
    await saveCameraBlob(blob);
  } catch (error) {
    console.error(error);
    showToast('La prise n’a pas pu être enregistrée.');
  }
}

window.onNativeCameraRecorded = async (url, fileName, mimeType = 'video/mp4') => {
  try {
    showToast('Ajout de la prise caméra à la timeline…');
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('La prise native est inaccessible.');
    const rawBlob = await response.blob();
    const blob = rawBlob.type ? rawBlob : new Blob([rawBlob], { type: mimeType });
    await saveCameraBlob(blob, `Prise caméra ${state.cameraClips.length + 1}`);
    try { window.Android?.deleteNativeRecording?.(fileName); } catch { /* nettoyage facultatif */ }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Impossible d’ajouter la prise caméra native.');
  }
};

window.onNativeCameraError = (message) => showToast(message || 'La caméra native Android a rencontré un problème.');
window.onNativeCameraCanceled = () => showToast('Enregistrement caméra annulé.');

async function clearProject() {
  if (!confirm('Supprimer la vidéo importée, les prises caméra et toute la timeline ?')) return;
  await closeCamera();
  state.source?.url && URL.revokeObjectURL(state.source.url);
  state.cameraClips.forEach((clip) => clip.url && URL.revokeObjectURL(clip.url));
  await clearBlobs();
  safeStorage.remove('remix-studio-state');
  history = [];
  future = [];
  state = initialState();
  activePreviewSegmentId = null;
  renderAll();
  setTimelineTime(0, { preview: true, syncScroll: true, select: false, force: true });
  closeAllSheets();
  showToast('Projet réinitialisé.');
}
