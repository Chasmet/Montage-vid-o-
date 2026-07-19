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
    video.onerror = () => reject(new Error('Vidéo illisible sur ce navigateur.'));
    video.src = url;
  });
}

async function importSource(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) return showToast('Le fichier choisi n’est pas une vidéo.');
  try {
    const blobKey = 'source-video';
    await putBlob(blobKey, file);
    const url = URL.createObjectURL(file);
    const meta = await readVideoMetadata(url);
    snapshot();
    if (state.source?.url) URL.revokeObjectURL(state.source.url);
    state.source = { id: 'source', blobKey, url, name: file.name, size: file.size, type: file.type, ...meta };
    state.sourceSegments = [];
    state.finalSegments = state.finalSegments.filter((segment) => segment.type !== 'source');
    state.activeView = 'source';
    state.activeMedia = { type: 'source', mediaId: 'source' };
    state.selected = null;
    applyPreviewMedia(state.source, 'source');
    renderAll();
    scheduleSave();
    showToast(`Vidéo importée : ${file.name}`);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Impossible d’importer cette vidéo.');
  } finally {
    els.videoInput.value = '';
  }
}

async function enumerateDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  const mics = devices.filter((device) => device.kind === 'audioinput');
  const selectedCamera = els.cameraSelect.value;
  const selectedMic = els.micSelect.value;
  els.cameraSelect.innerHTML = '<option value="">Automatique</option>';
  els.micSelect.innerHTML = '<option value="">Micro du téléphone</option>';
  cameras.forEach((device, index) => {
    const option = new Option(device.label || `Caméra ${index + 1}`, device.deviceId);
    els.cameraSelect.add(option);
  });
  mics.forEach((device, index) => {
    const option = new Option(device.label || `Micro ${index + 1}`, device.deviceId);
    els.micSelect.add(option);
  });
  if ([...els.cameraSelect.options].some((o) => o.value === selectedCamera)) els.cameraSelect.value = selectedCamera;
  if ([...els.micSelect.options].some((o) => o.value === selectedMic)) els.micSelect.value = selectedMic;
}

function desiredCameraOrientation() {
  if (els.cameraOrientation.value !== 'auto') return els.cameraOrientation.value;
  return state.source?.orientation || 'vertical';
}

async function openCamera() {
  try {
    stopFinalPreview();
    await closeCamera();
    const orientation = desiredCameraOrientation();
    const isVertical = orientation === 'vertical';
    const noise = els.noiseToggle.checked;
    const videoConstraint = els.cameraSelect.value
      ? { deviceId: { exact: els.cameraSelect.value }, width: { ideal: isVertical ? 720 : 1280 }, height: { ideal: isVertical ? 1280 : 720 } }
      : { facingMode: 'user', width: { ideal: isVertical ? 720 : 1280 }, height: { ideal: isVertical ? 1280 : 720 } };
    const audioConstraint = els.micSelect.value
      ? { deviceId: { exact: els.micSelect.value }, echoCancellation: noise, noiseSuppression: noise, autoGainControl: noise, channelCount: 1 }
      : { echoCancellation: noise, noiseSuppression: noise, autoGainControl: noise, channelCount: 1 };
    currentStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: audioConstraint });
    els.cameraPreview.srcObject = currentStream;
    els.cameraPreview.classList.remove('hidden');
    els.mainVideo.classList.add('hidden');
    els.emptyStage.classList.add('hidden');
    setStageOrientation(orientation);
    state.activeView = 'camera';
    els.previewTitle.textContent = 'Caméra en direct';
    els.recordBtn.disabled = false;
    els.stopRecordBtn.disabled = true;
    if (els.referenceToggle.checked && state.source?.url) {
      els.referencePreview.src = state.source.url;
      els.referencePreview.currentTime = els.mainVideo.currentTime || 0;
      els.referencePreview.classList.remove('hidden');
      els.referencePreview.play().catch(() => {});
    } else {
      els.referencePreview.classList.add('hidden');
    }
    await enumerateDevices();
    renderAll();
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
  if (!currentStream) return openCamera();
  await runCountdown();
  recorderChunks = [];
  const mimeType = supportedRecorderMime();
  recorder = new MediaRecorder(currentStream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 } : undefined);
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

async function saveRecording() {
  if (!recorderChunks.length) return;
  try {
    const blob = new Blob(recorderChunks, { type: recorder.mimeType || 'video/webm' });
    const id = uid('cam');
    const blobKey = `camera-${id}`;
    await putBlob(blobKey, blob);
    const url = URL.createObjectURL(blob);
    const meta = await readVideoMetadata(url);
    snapshot();
    const clip = { id, blobKey, url, name: `Prise caméra ${state.cameraClips.length + 1}`, type: blob.type, size: blob.size, ...meta };
    state.cameraClips.push(clip);
    state.activeView = 'camera';
    state.activeMedia = { type: 'camera', mediaId: clip.id };
    state.selected = { collection: 'cameraClips', id: clip.id };
    await closeCamera();
    applyPreviewMedia(clip, 'camera');
    renderAll();
    scheduleSave();
    showToast('Prise enregistrée. Coupe-la puis ajoute-la à la finale.');
  } catch (error) {
    console.error(error);
    showToast('La prise n’a pas pu être enregistrée.');
  }
}

function setActiveView(view) {
  state.activeView = view;
  if (view === 'source') {
    closeCamera();
    state.selected = null;
    if (state.source) applyPreviewMedia(state.source, 'source');
    else applyPreviewMedia(null);
  } else if (view === 'camera') {
    if (state.cameraClips.length) {
      const clip = state.cameraClips.at(-1);
      state.selected = { collection: 'cameraClips', id: clip.id };
      applyPreviewMedia(clip, 'camera');
    } else {
      openCamera();
    }
  } else if (view === 'final') {
    previewFinal();
  }
  renderAll();
  scheduleSave();
}

function updateTimeDisplay() {
  els.currentTime.textContent = formatTime(els.mainVideo.currentTime || 0, true);
  els.durationTime.textContent = formatTime(els.mainVideo.duration || activeDuration(), true);
}

function togglePlay() {
  if (!els.mainVideo.src) return;
  if (els.mainVideo.paused) els.mainVideo.play();
  else els.mainVideo.pause();
}

function seekTo(value) {
  if (!els.mainVideo.src) return;
  els.mainVideo.currentTime = clamp(value, 0, els.mainVideo.duration || 0);
}

function selectedItemMutation(mutator) {
  const item = getSelectedItem();
  if (!item) return;
  snapshot();
  mutator(item);
  renderAll();
  scheduleSave();
}

function moveSelected(direction) {
  if (state.selected?.collection !== 'finalSegments') return;
  const index = state.finalSegments.findIndex((item) => item.id === state.selected.id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= state.finalSegments.length) return;
  snapshot();
  [state.finalSegments[index], state.finalSegments[next]] = [state.finalSegments[next], state.finalSegments[index]];
  renderAll();
  scheduleSave();
}

async function deleteSelected() {
  const selected = state.selected;
  const item = getSelectedItem();
  if (!selected || !item) return;
  snapshot();
  if (selected.collection === 'cameraClips') {
    state.finalSegments = state.finalSegments.filter((segment) => segment.mediaId !== item.id);
    if (item.url) URL.revokeObjectURL(item.url);
    await deleteBlob(item.blobKey);
  }
  state[selected.collection] = state[selected.collection].filter((entry) => entry.id !== item.id);
  state.selected = null;
  loadSelectedMedia();
  renderAll();
  scheduleSave();
}

function duplicateSelected() {
  const selected = state.selected;
  const item = getSelectedItem();
  if (!selected || !item) return;
  snapshot();
  const copy = { ...structuredClone(item), id: uid('copy'), label: `${item.label || item.name} copie` };
  state[selected.collection].push(copy);
  state.selected = { collection: selected.collection, id: copy.id };
  renderAll();
  scheduleSave();
}

async function clearProject() {
  if (!confirm('Supprimer le projet, les prises caméra et le montage final ?')) return;
  await closeCamera();
  state.source?.url && URL.revokeObjectURL(state.source.url);
  state.cameraClips.forEach((clip) => clip.url && URL.revokeObjectURL(clip.url));
  await clearBlobs();
  safeStorage.remove('remix-studio-state');
  history = [];
  future = [];
  state = initialState();
  applyPreviewMedia(null);
  renderAll();
  showToast('Projet réinitialisé.');
}
