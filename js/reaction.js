/* Vertical live reaction: one canvas clock and one Web Audio mix for each take. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const video = $('reactionSource');
  const camera = $('reactionCameraVideo');
  const canvas = $('reactionCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const controls = ['reactionRecord', 'reactionPause', 'reactionStop'];
  let fileUrl, cameraStream, recorder, chunks = [], audio, sourceNode, sourceGain, micNode, mix;
  let visible = false, recordingPaused = false, frameId = 0, offsetX = 0, offsetY = 0, drag = null;
  let mute = false;

  const status = (message) => { $('reactionStatus').textContent = message; };
  const format = (time) => `${String(Math.floor((time || 0) / 60)).padStart(2, '0')}:${String(Math.floor((time || 0) % 60)).padStart(2, '0')}`;
  const active = () => recorder && recorder.state !== 'inactive';

  function drawHalf(element, top, zoom = 1, panX = 0, panY = 0) {
    const width = canvas.width, height = canvas.height / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, width, height); ctx.clip();
    ctx.fillStyle = '#141822'; ctx.fillRect(0, top, width, height);
    if (element.readyState >= 2 && element.videoWidth && element.videoHeight) {
      const scale = Math.max(width / element.videoWidth, height / element.videoHeight) * zoom;
      const w = element.videoWidth * scale, h = element.videoHeight * scale;
      ctx.drawImage(element, (width - w) / 2 + panX, top + (height - h) / 2 + panY, w, h);
    } else {
      ctx.fillStyle = '#9ea6b5'; ctx.textAlign = 'center'; ctx.font = '24px sans-serif';
      ctx.fillText(top ? 'Importer une vidéo' : 'Activer la caméra frontale', width / 2, top + height / 2);
    }
    ctx.restore();
  }

  function draw() {
    if (!visible && !active()) { frameId = 0; return; }
    drawHalf(camera, 0);
    drawHalf(video, canvas.height / 2, Number($('reactionZoom').value) / 100, offsetX, offsetY);
    if (video.duration) {
      $('reactionSeek').value = String(Math.round(video.currentTime / video.duration * 1000));
      $('reactionTime').textContent = `${format(video.currentTime)} / ${format(video.duration)}`;
    }
    frameId = requestAnimationFrame(draw);
  }
  function ensureDraw() { if (!frameId) draw(); }

  async function importVideo(file) {
    if (!file || active()) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(file);
    video.pause(); video.src = fileUrl; video.load();
    offsetX = offsetY = 0;
    $('reactionZoom').value = '100';
    status(`Vidéo importée : ${file.name}`);
    $('reactionRecord').disabled = !cameraStream;
  }

  async function startCamera() {
    if (active()) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra indisponible dans cet environnement.');
      if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      camera.srcObject = cameraStream;
      await camera.play();
      $('reactionRecord').disabled = !fileUrl;
      status('Caméra et micro prêts.');
    } catch (error) { status(`Caméra : ${error.message}`); }
  }

  function setVolume() {
    if (sourceGain) sourceGain.gain.value = mute ? 0 : Number($('reactionVolume').value) / 100;
    else video.volume = mute ? 0 : Number($('reactionVolume').value) / 100;
  }

  async function startRecording() {
    if (!fileUrl || !cameraStream || active()) return;
    try {
      if (!canvas.captureStream || !window.MediaRecorder) throw new Error('Enregistrement de l’écran partagé non pris en charge par cet appareil.');
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      await audio.resume();
      sourceNode ??= audio.createMediaElementSource(video);
      video.volume = 1;
      sourceGain ??= audio.createGain();
      // The source element is audible through the gain and also routed to the recorded mix.
      if (!sourceGain.numberOfOutputs) throw new Error('Mixage audio indisponible.');
      sourceNode.disconnect(); sourceGain.disconnect();
      sourceNode.connect(sourceGain);
      sourceGain.connect(audio.destination);
      mix = audio.createMediaStreamDestination();
      sourceGain.connect(mix);
      micNode = audio.createMediaStreamSource(cameraStream);
      micNode.connect(mix);
      setVolume();

      const picture = canvas.captureStream(30);
      const stream = new MediaStream([...picture.getVideoTracks(), ...mix.stream.getAudioTracks()]);
      const mimeType = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('Aucun encodeur vidéo compatible.');
      chunks = [];
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => status('Erreur d’encodage : vérifie l’espace disponible.');
      recorder.onstop = () => {
        picture.getTracks().forEach((track) => track.stop());
        micNode?.disconnect(); micNode = null;
        sourceGain?.disconnect(mix); mix = null;
        if (!chunks.length) { status('Aucun fichier généré.'); return; }
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Remix-Reaction-${Date.now()}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        status('Export terminé. Vidéo enregistrée dans Téléchargements.');
      };
      await video.play();
      recorder.start(1000);
      recordingPaused = false;
      $('reactionRecord').disabled = true;
      $('reactionCamera').disabled = true;
      $('reactionPause').disabled = $('reactionStop').disabled = false;
      $('reactionPause').textContent = '⏸ Pause';
      status('Enregistrement en cours : les commandes vidéo restent disponibles.');
    } catch (error) { status(`Enregistrement impossible : ${error.message}`); }
  }

  function pauseRecording() {
    if (!active()) return;
    if (recordingPaused) {
      recorder.resume(); recordingPaused = false;
      video.play().catch(() => {});
      $('reactionPause').textContent = '⏸ Pause'; status('Enregistrement repris.');
    } else {
      video.pause(); recorder.pause(); recordingPaused = true;
      $('reactionPause').textContent = '▶ Reprendre'; status('Enregistrement en pause.');
    }
  }

  function stopRecording() {
    if (!active()) return;
    video.pause(); recorder.stop(); recordingPaused = false;
    $('reactionRecord').disabled = false;
    $('reactionCamera').disabled = false;
    $('reactionPause').disabled = $('reactionStop').disabled = true;
    status('Finalisation de la vidéo…');
  }

  function showTab(which) {
    if (active() && which !== 'reaction') { status('Termine la prise avant de changer d’onglet.'); return; }
    const reaction = which === 'reaction';
    visible = reaction;
    $('reactionPanel').classList.toggle('hidden', !reaction);
    document.querySelector('.workspace').classList.toggle('hidden', reaction);
    $('editorDock').classList.toggle('hidden', reaction);
    for (const id of ['editorTab', 'interviewTab', 'reactionTab']) $(id).classList.toggle('active', id === `${which}Tab`);
    if (reaction) { ensureDraw(); stopTimelinePreview?.(true); }
    else if (!active()) {
      video.pause();
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      camera.srcObject = null;
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
  $('reactionBack').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 5); });
  $('reactionForward').addEventListener('click', () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); });
  $('reactionSeek').addEventListener('input', () => { if (video.duration) video.currentTime = Number($('reactionSeek').value) / 1000 * video.duration; });
  $('reactionVolume').addEventListener('input', setVolume);
  $('reactionMute').addEventListener('click', () => {
    mute = !mute; setVolume(); $('reactionMute').textContent = mute ? '🔇 Activer' : '🔊 Couper';
    $('reactionMute').setAttribute('aria-pressed', String(mute));
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.offsetY < canvas.getBoundingClientRect().height / 2) return;
    drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    offsetX += (event.clientX - drag.x) * canvas.width / rect.width;
    offsetY += (event.clientY - drag.y) * canvas.height / rect.height;
    drag = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  $('editorTab').addEventListener('click', () => showTab('editor'));
  $('interviewTab').addEventListener('click', () => {
    showTab('interview');
    if (state.timelineSegments.length) $('exportBtn').click();
    else showToast('Importe deux vidéos sur la timeline, puis choisis le Mode 2.');
  });
  $('reactionTab').addEventListener('click', () => showTab('reaction'));
  window.addEventListener('beforeunload', () => { cameraStream?.getTracks().forEach((track) => track.stop()); });
})();
