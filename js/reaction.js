/* Vertical live reaction: reliable DOM preview + offscreen export canvas. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const video = $('reactionSource');
  const camera = $('reactionCameraVideo');
  const videoHalf = $('reactionVideoHalf');
  const canvas = $('reactionCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  let fileUrl, cameraStream, recorder, chunks = [], audio, sourceNode, sourceGain, micNode, mix;
  let visible = false, recordingPaused = false, frameId = 0, offsetX = 0, offsetY = 0, drag = null;
  let mute = false, videoFit = 'cover', requestingCamera = false;

  const status = (message) => { $('reactionStatus').textContent = message; };
  const format = (time) => `${String(Math.floor((time || 0) / 60)).padStart(2, '0')}:${String(Math.floor((time || 0) % 60)).padStart(2, '0')}`;
  const active = () => recorder && recorder.state !== 'inactive';

  async function saveReactionBlob(blob, filename) {
    if (window.Android?.beginDownload && typeof window.saveRemixBlobToAndroid === 'function') {
      await window.saveRemixBlobToAndroid(blob, filename);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function drawHalf(element, top, zoom = 1, panX = 0, panY = 0, fit = 'cover') {
    const width = canvas.width;
    const height = canvas.height / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, width, height);
    ctx.clip();
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, top, width, height);

    if (element.readyState >= 2 && element.videoWidth && element.videoHeight) {
      const fitScale = fit === 'contain'
        ? Math.min(width / element.videoWidth, height / element.videoHeight)
        : Math.max(width / element.videoWidth, height / element.videoHeight);
      const scale = fitScale * zoom;
      const w = element.videoWidth * scale;
      const h = element.videoHeight * scale;
      ctx.drawImage(element, (width - w) / 2 + panX, top + (height - h) / 2 + panY, w, h);
    }
    ctx.restore();
  }

  function syncPreviewTransform() {
    const zoom = Number($('reactionZoom').value) / 100;
    const panX = offsetX / canvas.width * 100;
    const panY = offsetY / (canvas.height / 2) * 100;
    video.style.objectFit = videoFit;
    video.style.transform = `translate3d(${panX}%, ${panY}%, 0) scale(${zoom})`;
    $('reactionFitCover').classList.toggle('active', videoFit === 'cover');
    $('reactionFitContain').classList.toggle('active', videoFit === 'contain');
  }

  function draw() {
    if (!visible && !active()) { frameId = 0; return; }
    drawHalf(camera, 0, 1, 0, 0, 'cover');
    drawHalf(video, canvas.height / 2, Number($('reactionZoom').value) / 100, offsetX, offsetY, videoFit);
    if (video.duration) {
      $('reactionSeek').value = String(Math.round(video.currentTime / video.duration * 1000));
      $('reactionTime').textContent = `${format(video.currentTime)} / ${format(video.duration)}`;
    }
    frameId = requestAnimationFrame(draw);
  }

  function ensureDraw() { if (!frameId) draw(); }

  async function waitForFirstFrame() {
    if (video.readyState >= 2 && video.videoWidth) return;
    await new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('Cette vidéo ne peut pas être décodée sur cet appareil.')); };
      const cleanup = () => {
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('error', fail);
      };
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('error', fail, { once: true });
    });
  }

  async function importVideo(file) {
    if (!file || active()) return;
    try {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      fileUrl = URL.createObjectURL(file);
      video.pause();
      video.src = fileUrl;
      video.preload = 'auto';
      video.load();
      offsetX = offsetY = 0;
      videoFit = 'cover';
      $('reactionZoom').value = '100';
      $('reactionVideoPlaceholder').classList.remove('hidden');
      status('Chargement de la vidéo…');
      await waitForFirstFrame();
      $('reactionVideoPlaceholder').classList.add('hidden');
      syncPreviewTransform();
      ensureDraw();
      status(`Vidéo prête : ${file.name}`);
      $('reactionRecord').disabled = !cameraStream;
    } catch (error) {
      fileUrl = null;
      status(`Import impossible : ${error.message}`);
    }
  }

  async function openCameraStream() {
    if (active()) return;
    requestingCamera = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra indisponible dans cet environnement.');
      if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());

      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (firstError) {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: false
        });
        status('Caméra active. Micro non autorisé : la prise sera sans ta voix.');
      }

      camera.srcObject = cameraStream;
      await camera.play();
      $('reactionCameraPlaceholder').classList.add('hidden');
      $('reactionCamera').textContent = '✓ Caméra frontale active';
      $('reactionRecord').disabled = !fileUrl;
      ensureDraw();
      if (cameraStream.getAudioTracks().length) status('Caméra frontale et micro prêts.');
    } catch (error) {
      cameraStream = null;
      camera.srcObject = null;
      $('reactionCameraPlaceholder').classList.remove('hidden');
      $('reactionCamera').textContent = '📷 Activer la caméra frontale';
      status(`Caméra impossible : ${error.message}`);
    }
  }

  async function startCamera() {
    if (active() || requestingCamera) return;
    if (window.Android?.requestReactionPermissions) {
      requestingCamera = true;
      status('Autorise la caméra et le microphone…');
      window.Android.requestReactionPermissions();
      return;
    }
    await openCameraStream();
  }

  window.onReactionPermissionsReady = (granted) => {
    requestingCamera = false;
    if (!granted) {
      status('Caméra refusée. Autorise Caméra et Microphone dans les réglages Android.');
      return;
    }
    openCameraStream();
  };

  function setVolume() {
    const value = mute ? 0 : Number($('reactionVolume').value) / 100;
    if (sourceGain) sourceGain.gain.value = value;
    else video.volume = value;
  }

  async function startRecording() {
    if (!fileUrl || !cameraStream || active()) return;
    try {
      if (!canvas.captureStream || !window.MediaRecorder) throw new Error('Enregistrement Split Screen non pris en charge par cet appareil.');
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      await audio.resume();
      sourceNode ??= audio.createMediaElementSource(video);
      video.volume = 1;
      sourceGain ??= audio.createGain();
      sourceNode.disconnect();
      sourceGain.disconnect();
      sourceNode.connect(sourceGain);
      sourceGain.connect(audio.destination);
      mix = audio.createMediaStreamDestination();
      sourceGain.connect(mix);

      if (cameraStream.getAudioTracks().length) {
        micNode = audio.createMediaStreamSource(cameraStream);
        micNode.connect(mix);
      }
      setVolume();

      const picture = canvas.captureStream(30);
      const stream = new MediaStream([...picture.getVideoTracks(), ...mix.stream.getAudioTracks()]);
      const mimeType = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('Aucun encodeur vidéo compatible.');

      chunks = [];
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => status('Erreur d’encodage : vérifie l’espace disponible.');
      recorder.onstop = async () => {
        picture.getTracks().forEach((track) => track.stop());
        micNode?.disconnect(); micNode = null;
        try { sourceGain?.disconnect(mix); } catch (_) {}
        mix = null;

        if (!chunks.length) {
          $('reactionRecord').disabled = false;
          status('Aucun fichier généré.');
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        const filename = `Remix-Reaction-${Date.now()}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
        try {
          status('Enregistrement terminé. Sauvegarde…');
          await saveReactionBlob(blob, filename);
          status('Export terminé dans Téléchargements/RemixStudio.');
        } catch (error) {
          status(`Export impossible : ${error.message}`);
        } finally {
          $('reactionRecord').disabled = !cameraStream || !fileUrl;
        }
      };

      recorder.start(500);
      await video.play();
      recordingPaused = false;
      $('reactionRecord').disabled = true;
      $('reactionCamera').disabled = true;
      $('reactionPause').disabled = $('reactionStop').disabled = false;
      $('reactionPause').textContent = '⏸ Pause';
      status('Enregistrement en cours. Tu peux lire, mettre en pause ou déplacer la timeline.');
    } catch (error) {
      if (active()) recorder.stop();
      status(`Enregistrement impossible : ${error.message}`);
    }
  }

  function pauseRecording() {
    if (!active()) return;
    if (recordingPaused) {
      recorder.resume();
      recordingPaused = false;
      video.play().catch(() => {});
      $('reactionPause').textContent = '⏸ Pause';
      status('Enregistrement repris.');
    } else {
      video.pause();
      recorder.pause();
      recordingPaused = true;
      $('reactionPause').textContent = '▶ Reprendre';
      status('Enregistrement en pause.');
    }
  }

  function stopRecording() {
    if (!active()) return;
    video.pause();
    recorder.stop();
    recordingPaused = false;
    $('reactionRecord').disabled = true;
    $('reactionCamera').disabled = false;
    $('reactionPause').disabled = $('reactionStop').disabled = true;
    status('Finalisation de la vidéo…');
  }

  function resetVideoPosition() {
    offsetX = offsetY = 0;
    $('reactionZoom').value = '100';
    syncPreviewTransform();
  }

  function showTab(which) {
    if (active() && which !== 'reaction') {
      status('Termine la prise avant de changer d’onglet.');
      return;
    }
    const reactionMode = which === 'reaction';
    visible = reactionMode;
    $('reactionPanel').classList.toggle('hidden', !reactionMode);
    document.querySelector('.workspace').classList.toggle('hidden', reactionMode);
    $('editorDock').classList.toggle('hidden', reactionMode);
    for (const id of ['editorTab', 'interviewTab', 'reactionTab']) $(id).classList.toggle('active', id === `${which}Tab`);

    if (reactionMode) {
      ensureDraw();
      syncPreviewTransform();
      stopTimelinePreview?.(true);
    } else if (!active()) {
      video.pause();
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      camera.srcObject = null;
      $('reactionCameraPlaceholder').classList.remove('hidden');
      $('reactionCamera').textContent = '📷 Activer la caméra frontale';
      $('reactionRecord').disabled = true;
    }
  }

  $('reactionInput').addEventListener('change', (event) => importVideo(event.target.files?.[0]));
  $('reactionCamera').addEventListener('click', startCamera);
  $('reactionRecord').addEventListener('click', startRecording);
  $('reactionPause').addEventListener('click', pauseRecording);
  $('reactionStop').addEventListener('click', stopRecording);
  $('reactionPlay').addEventListener('click', () => video.paused ? video.play().catch(() => {}) : video.pause());

  video.addEventListener('play', () => { $('reactionPlay').textContent = '⏸ Pause vidéo'; });
  video.addEventListener('pause', () => { $('reactionPlay').textContent = '▶ Lire'; });
  video.addEventListener('loadedmetadata', () => { $('reactionTime').textContent = `00:00 / ${format(video.duration)}`; });
  video.addEventListener('loadeddata', () => {
    $('reactionVideoPlaceholder').classList.add('hidden');
    ensureDraw();
  });
  camera.addEventListener('loadeddata', () => $('reactionCameraPlaceholder').classList.add('hidden'));

  $('reactionBack').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 5); });
  $('reactionForward').addEventListener('click', () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); });
  $('reactionSeek').addEventListener('input', () => {
    if (video.duration) video.currentTime = Number($('reactionSeek').value) / 1000 * video.duration;
  });
  $('reactionVolume').addEventListener('input', setVolume);
  $('reactionZoom').addEventListener('input', syncPreviewTransform);
  $('reactionMute').addEventListener('click', () => {
    mute = !mute;
    setVolume();
    $('reactionMute').textContent = mute ? '🔇 Activer' : '🔊 Couper';
    $('reactionMute').setAttribute('aria-pressed', String(mute));
  });
  $('reactionFitCover').addEventListener('click', () => {
    videoFit = 'cover';
    resetVideoPosition();
  });
  $('reactionFitContain').addEventListener('click', () => {
    videoFit = 'contain';
    resetVideoPosition();
  });
  $('reactionReset').addEventListener('click', resetVideoPosition);

  videoHalf.addEventListener('pointerdown', (event) => {
    if (!fileUrl) return;
    drag = { x: event.clientX, y: event.clientY };
    videoHalf.setPointerCapture(event.pointerId);
  });
  videoHalf.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const rect = videoHalf.getBoundingClientRect();
    offsetX += (event.clientX - drag.x) * canvas.width / rect.width;
    offsetY += (event.clientY - drag.y) * (canvas.height / 2) / rect.height;
    drag = { x: event.clientX, y: event.clientY };
    syncPreviewTransform();
  });
  videoHalf.addEventListener('pointerup', () => { drag = null; });
  videoHalf.addEventListener('pointercancel', () => { drag = null; });

  $('editorTab').addEventListener('click', () => showTab('editor'));
  $('interviewTab').addEventListener('click', () => {
    showTab('interview');
    if (state.timelineSegments.length) $('exportBtn').click();
    else showToast('Importe deux vidéos sur la timeline, puis choisis le Mode 2.');
  });
  $('reactionTab').addEventListener('click', () => showTab('reaction'));
  window.addEventListener('resize', syncPreviewTransform);
  window.addEventListener('beforeunload', () => cameraStream?.getTracks().forEach((track) => track.stop()));
})();