/* Reaction / Split Screen: equal source frames driven by the imported video's ratio. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const video = $('reactionSource');
  const camera = $('reactionCameraVideo');
  const stage = $('reactionStage');
  const videoHalf = $('reactionVideoHalf');
  const cameraHalf = $('reactionCameraHalf');
  const videoFrame = $('reactionVideoFrame');
  const cameraFrame = $('reactionCameraFrame');
  const canvas = $('reactionCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  let fileUrl, cameraStream, micStream, recorder, chunks = [], audio, sourceNode, sourceGain, micNode, micInput, micHighpass, micCompressor, micGain, masterCompressor, keepAliveOscillator, keepAliveGain, mix;
  let nativeMicActive = false, usedNativeMic = false, nativeMicNextTime = 0, nativeMicFramesDuringPause = 0, nativeMicSignalDuringPause = false;
  let visible = false, recordingPaused = false, frameId = 0, drag = null, mute = false;
  let requestingCamera = false;
  let outputLayout = 'vertical';
  let outputFraming = 'extend';
  let sourceAspect = 9 / 16;
  let cameraFit = 'cover', videoFit = 'contain';
  let cameraPanX = 0, cameraPanY = 0, videoPanX = 0, videoPanY = 0;

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

  function fitSharedFrame(slot, aspect = sourceAspect) {
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 9 / 16;
    let w = slot.w;
    let h = w / safeAspect;
    if (h > slot.h) {
      h = slot.h;
      w = h * safeAspect;
    }
    return {
      x: slot.x + (slot.w - w) / 2,
      y: slot.y + (slot.h - h) / 2,
      w,
      h
    };
  }

  function regions() {
    if (outputLayout === 'horizontal') {
      return {
        camera: { x: 0, y: 0, w: canvas.width / 2, h: canvas.height },
        video: { x: canvas.width / 2, y: 0, w: canvas.width / 2, h: canvas.height }
      };
    }
    return {
      camera: { x: 0, y: 0, w: canvas.width, h: canvas.height / 2 },
      video: { x: 0, y: canvas.height / 2, w: canvas.width, h: canvas.height / 2 }
    };
  }

  function outputFrameForSlot(slot) {
    if (outputFraming === 'crop' || outputFraming === 'free') return { ...slot };
    return fitSharedFrame(slot, sourceAspect);
  }

  function drawImageInRegion(element, region, scale, panX, panY, mirror = false) {
    const { x, y, w, h } = region;
    const dw = element.videoWidth * scale;
    const dh = element.videoHeight * scale;
    if (mirror) {
      ctx.translate(x + w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(element, (w - dw) / 2 - panX, y + (h - dh) / 2 + panY, dw, dh);
    } else {
      ctx.drawImage(element, x + (w - dw) / 2 + panX, y + (h - dh) / 2 + panY, dw, dh);
    }
  }

  function drawRegion(element, region, zoom, panXPercent, panYPercent, fit, mirror = false) {
    const { x, y, w, h } = region;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);

    if (element.readyState >= 2 && element.videoWidth && element.videoHeight) {
      const panX = panXPercent / 100 * w;
      const panY = panYPercent / 100 * h;
      const scaleBase = fit === 'contain'
        ? Math.min(w / element.videoWidth, h / element.videoHeight)
        : Math.max(w / element.videoWidth, h / element.videoHeight);
      drawImageInRegion(element, region, scaleBase * zoom, panX, panY, mirror);
    }
    ctx.restore();
  }

  function previewFrameSize(rect) {
    if (outputFraming === 'crop' || outputFraming === 'free') {
      return { w: rect.width, h: rect.height };
    }
    let w = rect.width;
    let h = w / sourceAspect;
    if (h > rect.height) {
      h = rect.height;
      w = h * sourceAspect;
    }
    return { w, h };
  }

  function syncSharedPreviewFrameSize() {
    const apply = (half, frame) => {
      const rect = half.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const size = previewFrameSize(rect);
      frame.style.width = `${Math.max(1, size.w)}px`;
      frame.style.height = `${Math.max(1, size.h)}px`;
    };
    apply(cameraHalf, cameraFrame);
    apply(videoHalf, videoFrame);
  }

  function updateLayoutLabel() {
    const dimensions = video.videoWidth && video.videoHeight
      ? `${video.videoWidth}×${video.videoHeight}`
      : '9:16';
    $('reactionLayoutLabel').textContent = outputLayout === 'horizontal'
      ? `Sortie 16:9 · 2 cadres identiques ${dimensions}`
      : `Sortie 9:16 · 2 cadres identiques ${dimensions}`;
  }

  function setFramingMode(mode) {
    if (active()) return;
    outputFraming = ['extend', 'clean', 'crop', 'free'].includes(mode) ? mode : 'extend';
    $('reactionFramingExtend').classList.toggle('active', outputFraming === 'extend');
    $('reactionFramingClean').classList.toggle('active', outputFraming === 'clean');
    $('reactionFramingCrop').classList.toggle('active', outputFraming === 'crop');
    $('reactionFramingFree').classList.toggle('active', outputFraming === 'free');
    stage.classList.toggle('edge-fill', outputFraming === 'extend');

    if (outputFraming === 'extend' || outputFraming === 'clean') {
      cameraFit = 'cover';
      videoFit = 'contain';
      cameraPanX = cameraPanY = videoPanX = videoPanY = 0;
      $('reactionCameraZoom').value = '100';
      $('reactionZoom').value = '100';
    } else if (outputFraming === 'crop') {
      cameraFit = 'cover';
      videoFit = 'cover';
      cameraPanX = cameraPanY = videoPanX = videoPanY = 0;
      $('reactionCameraZoom').value = '100';
      $('reactionZoom').value = '100';
    }

    requestAnimationFrame(() => {
      syncSharedPreviewFrameSize();
      syncPreviewTransforms();
    });
    ensureDraw();

    const label = outputFraming === 'extend'
      ? 'Sans bandes : images centrales entières, bords prolongés dans chaque moitié.'
      : outputFraming === 'clean'
      ? 'Propre : fond noir uni, aucune duplication ni flou.'
      : outputFraming === 'crop'
        ? 'Recadré : les deux moitiés sont remplies, avec coupe si nécessaire.'
        : 'Libre : utilise zoom, déplacement et Entière/Remplir manuellement.';
    status(label);
  }

  function setOutputLayout(layout) {
    if (active()) return;
    outputLayout = layout === 'horizontal' ? 'horizontal' : 'vertical';
    const horizontal = outputLayout === 'horizontal';
    canvas.width = horizontal ? 1920 : 1080;
    canvas.height = horizontal ? 1080 : 1920;
    stage.classList.toggle('layout-horizontal', horizontal);
    stage.classList.toggle('layout-vertical', !horizontal);
    $('reactionOutputVertical').classList.toggle('active', !horizontal);
    $('reactionOutputHorizontal').classList.toggle('active', horizontal);
    updateLayoutLabel();
    requestAnimationFrame(() => {
      syncSharedPreviewFrameSize();
      syncPreviewTransforms();
    });
    ensureDraw();
  }

  function syncPreviewTransforms() {
    const cameraZoom = Number($('reactionCameraZoom').value) / 100;
    const videoZoom = Number($('reactionZoom').value) / 100;

    camera.style.objectFit = cameraFit;
    camera.style.transform = `translate3d(${cameraPanX}%, ${cameraPanY}%, 0) scaleX(-1) scale(${cameraZoom})`;
    $('reactionCameraZoomValue').textContent = `${cameraZoom.toFixed(1).replace('.', ',')}×`;
    for (const button of document.querySelectorAll('[data-reaction-camera-zoom]')) {
      button.classList.toggle('active', Number(button.dataset.reactionCameraZoom) === Math.round(cameraZoom * 100));
    }

    video.style.objectFit = videoFit;
    video.style.transform = `translate3d(${videoPanX}%, ${videoPanY}%, 0) scale(${videoZoom})`;

    $('reactionCameraFitContain').classList.toggle('active', cameraFit === 'contain');
    $('reactionCameraFitCover').classList.toggle('active', cameraFit === 'cover');
    $('reactionFitContain').classList.toggle('active', videoFit === 'contain');
    $('reactionFitCover').classList.toggle('active', videoFit === 'cover');
  }

  function drawExtendedBackdrop(element, slot, frame, mirror = false) {
    if (element.readyState < 2 || !element.videoWidth || !element.videoHeight) return;
    const sw = element.videoWidth;
    const sh = element.videoHeight;
    const edge = Math.max(1, Math.floor(sw * 0.04));
    const left = mirror ? sw - edge : 0;
    const right = mirror ? 0 : sw - edge;
    const half = slot.w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.w, slot.h);
    ctx.clip();
    // Stretch narrow edge strips; the central picture keeps its proportions.
    ctx.drawImage(element, left, 0, edge, sh, slot.x, slot.y, half, slot.h);
    ctx.drawImage(element, right, 0, edge, sh, slot.x + half, slot.y, half, slot.h);
    if (frame.y > slot.y) {
      const topEdge = Math.max(1, Math.floor(sh * 0.04));
      ctx.drawImage(element, 0, 0, sw, topEdge, slot.x, slot.y, slot.w, frame.y - slot.y);
      const bottom = slot.y + slot.h - frame.y - frame.h;
      if (bottom > 0) ctx.drawImage(element, 0, sh - topEdge, sw, topEdge, slot.x, frame.y + frame.h, slot.w, bottom);
    }
    ctx.restore();
  }

  function drawForegroundInSharedFrame(element, frame, zoom, panXPercent, panYPercent, fit, mirror = false) {
    const { x, y, w, h } = frame;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (outputFraming !== 'extend') {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, w, h);
    }

    if (element.readyState >= 2 && element.videoWidth && element.videoHeight) {
      const scaleBase = fit === 'contain'
        ? Math.min(w / element.videoWidth, h / element.videoHeight)
        : Math.max(w / element.videoWidth, h / element.videoHeight);
      const scale = scaleBase * zoom;
      const panX = panXPercent / 100 * w;
      const panY = panYPercent / 100 * h;
      drawImageInRegion(element, frame, scale, panX, panY, mirror);
    }
    ctx.restore();
  }

  function draw() {
    if (!visible && !active()) {
      frameId = 0;
      return;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const slots = regions();
    const cameraFrameRegion = outputFrameForSlot(slots.camera);
    const videoFrameRegion = outputFrameForSlot(slots.video);

    if (outputFraming === 'extend') {
      drawExtendedBackdrop(camera, slots.camera, cameraFrameRegion, true);
      drawExtendedBackdrop(video, slots.video, videoFrameRegion);
    }

    drawForegroundInSharedFrame(
      camera,
      cameraFrameRegion,
      Number($('reactionCameraZoom').value) / 100,
      cameraPanX,
      cameraPanY,
      cameraFit,
      true
    );
    drawForegroundInSharedFrame(
      video,
      videoFrameRegion,
      Number($('reactionZoom').value) / 100,
      videoPanX,
      videoPanY,
      videoFit,
      false
    );

    if (video.duration) {
      $('reactionSeek').value = String(Math.round(video.currentTime / video.duration * 1000));
      $('reactionTime').textContent = `${format(video.currentTime)} / ${format(video.duration)}`;
    }
    frameId = requestAnimationFrame(draw);
  }

  function ensureDraw() {
    if (!frameId) draw();
  }

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

      videoPanX = videoPanY = 0;
      videoFit = 'contain';
      $('reactionZoom').value = '100';
      $('reactionVideoPlaceholder').classList.remove('hidden');
      status('Chargement de la vidéo…');

      await waitForFirstFrame();
      if (video.videoWidth && video.videoHeight) {
        sourceAspect = video.videoWidth / video.videoHeight;
      }
      $('reactionVideoPlaceholder').classList.add('hidden');
      updateLayoutLabel();
      syncSharedPreviewFrameSize();
      syncPreviewTransforms();
      ensureDraw();

      if (cameraStream) {
        await openCameraStream();
      }

      status(`Vidéo prête. Caméra et vidéo utilisent le même cadre ${video.videoWidth}×${video.videoHeight}.`);
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
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Caméra indisponible dans cet environnement.');
      }
      if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());

      // A 9:16 camera constraint can crop the sensor before CSS or the canvas
      // sees it. Keep the wider sensor stream so users can choose between a
      // full-height crop and the uncropped image in the same output frame.
      const portrait = sourceAspect <= 1;
      const videoConstraints = {
        facingMode: { ideal: 'user' },
        width: { ideal: portrait ? 960 : 1280 },
        height: { ideal: portrait ? 1280 : 960 },
        aspectRatio: { ideal: portrait ? 3 / 4 : 4 / 3 }
      };

      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });
      } catch (_) {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' } },
          audio: false
        });
      }

      camera.srcObject = cameraStream;
      await camera.play();
      cameraPanX = cameraPanY = 0;
      cameraFit = 'cover';
      $('reactionCameraZoom').value = '100';
      syncSharedPreviewFrameSize();
      syncPreviewTransforms();
      $('reactionCameraPlaceholder').classList.add('hidden');
      $('reactionCamera').textContent = '✓ Caméra active';
      $('reactionRecord').disabled = !fileUrl;
      ensureDraw();
      status('Caméra prête. Le micro dédié s’ouvrira automatiquement au REC.');
    } catch (error) {
      cameraStream = null;
      micStream?.getTracks?.().forEach((track) => track.stop());
      micStream = null;
      camera.srcObject = null;
      $('reactionCameraPlaceholder').classList.remove('hidden');
      $('reactionCamera').textContent = '📷 Caméra';
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

  async function ensureDedicatedMicrophone() {
    const existing = micStream?.getAudioTracks?.().find((track) => track.readyState === 'live');
    if (existing) {
      existing.enabled = true;
      return micStream;
    }

    micStream?.getTracks?.().forEach((track) => track.stop());
    micStream = null;

    const constraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 }
    };

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: constraints });
    } catch (_) {
      micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    }

    const track = micStream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') {
      micStream?.getTracks?.().forEach((item) => item.stop());
      micStream = null;
      throw new Error('Le microphone ne fournit aucune piste audio active.');
    }
    track.enabled = true;
    return micStream;
  }

  function keepAudioEngineAlive() {
    if (!audio || keepAliveOscillator) return;
    keepAliveOscillator = audio.createOscillator();
    keepAliveGain = audio.createGain();
    keepAliveOscillator.frequency.value = 20;
    keepAliveGain.gain.value = 0.000001;
    keepAliveOscillator.connect(keepAliveGain);
    keepAliveGain.connect(audio.destination);
    keepAliveOscillator.start();
  }

  function ensureAudioEngineRunning() {
    if (audio && audio.state !== 'running') {
      audio.resume().catch(() => {});
    }
  }

  function desiredMicGain() {
    const base = Number($('reactionMicGain').value || 180) / 100;
    return video.paused && active() ? Math.min(3, base * 1.35) : 0;
  }

  function updateMicPriority(immediate = false) {
    ensureAudioEngineRunning();
    if (!micGain || !audio) return;
    const target = desiredMicGain();
    const now = audio.currentTime;
    micGain.gain.cancelScheduledValues(now);
    // Close the microphone immediately when video playback resumes; avoid any overlap.
    if (immediate || target === 0) micGain.gain.setValueAtTime(target, now);
    else {
      micGain.gain.setValueAtTime(Math.max(0, micGain.gain.value), now);
      micGain.gain.linearRampToValueAtTime(target, now + 0.02);
    }
    $('reactionAudioHint').textContent = video.paused && active()
      ? 'Vidéo en pause : micro ouvert, son de la vidéo arrêté.'
      : 'Vidéo en lecture : micro coupé, son de la vidéo seul.';
  }

  // Android's native microphone is independent of the imported <video> element.
  // Its PCM is scheduled on the same AudioContext clock as the exported video mix.
  window.onNativeReactionAudio = (encoded, sampleRate) => {
    if (!nativeMicActive || !active() || !audio || !micInput || !encoded) return;
    ensureAudioEngineRunning();
    const bytes = atob(encoded);
    const length = Math.floor(bytes.length / 2);
    if (!length) return;
    const buffer = audio.createBuffer(1, length, sampleRate);
    const samples = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      const value = (bytes.charCodeAt(i * 2) | bytes.charCodeAt(i * 2 + 1) << 8) << 16 >> 16;
      samples[i] = value / 32768;
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / length);
    if (video.paused) {
      nativeMicFramesDuringPause += 1;
      if (rms > 0.0001) nativeMicSignalDuringPause = true;
      if (nativeMicFramesDuringPause % 8 === 0) {
        $('reactionMicSignal').textContent = rms > 0.0001
          ? `Micro actif · niveau ${Math.min(100, Math.round(rms * 900))}%`
          : 'Micro ouvert · aucun signal détecté';
      }
      if (nativeMicFramesDuringPause === 50 && !nativeMicSignalDuringPause) {
        status('Micro ouvert mais silencieux : vérifie son autorisation Android.');
      }
    } else {
      $('reactionMicSignal').textContent = 'Micro coupé pendant la lecture de la vidéo.';
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(micInput);
    source.onended = () => source.disconnect();
    const now = audio.currentTime;
    if (nativeMicNextTime < now + 0.05 || nativeMicNextTime > now + 0.35) {
      nativeMicNextTime = now + 0.07;
    }
    source.start(nativeMicNextTime);
    nativeMicNextTime += buffer.duration;
  };

  async function startRecording() {
    if (!fileUrl || !cameraStream || active()) return;
    try {
      if (!canvas.captureStream || !window.MediaRecorder) {
        throw new Error('Enregistrement Split Screen non pris en charge par cet appareil.');
      }

      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      await audio.resume();
      keepAudioEngineAlive();
      sourceNode ??= audio.createMediaElementSource(video);
      video.volume = 1;
      sourceGain ??= audio.createGain();
      sourceNode.disconnect();
      sourceGain.disconnect();
      sourceNode.connect(sourceGain);
      sourceGain.connect(audio.destination);

      mix = audio.createMediaStreamDestination();

      masterCompressor = audio.createDynamicsCompressor();
      masterCompressor.threshold.value = -8;
      masterCompressor.knee.value = 8;
      masterCompressor.ratio.value = 8;
      masterCompressor.attack.value = 0.002;
      masterCompressor.release.value = 0.16;
      masterCompressor.connect(mix);

      sourceGain.connect(masterCompressor);

      micInput = audio.createGain();
      micHighpass = audio.createBiquadFilter();
      micHighpass.type = 'highpass';
      micHighpass.frequency.value = 80;
      micHighpass.Q.value = 0.7;

      micCompressor = audio.createDynamicsCompressor();
      micCompressor.threshold.value = -26;
      micCompressor.knee.value = 16;
      micCompressor.ratio.value = 5;
      micCompressor.attack.value = 0.003;
      micCompressor.release.value = 0.20;

      micGain = audio.createGain();
      micInput.connect(micHighpass);
      micHighpass.connect(micCompressor);
      micCompressor.connect(micGain);
      micGain.connect(masterCompressor);

      nativeMicActive = Boolean(window.Android?.startReactionMic?.());
      usedNativeMic = nativeMicActive;
      nativeMicFramesDuringPause = 0;
      nativeMicSignalDuringPause = false;
      nativeMicNextTime = 0;
      $('reactionMicSignal').textContent = nativeMicActive
        ? 'Micro Android actif · parle pour vérifier le niveau.'
        : 'Micro navigateur actif · parle pour vérifier le niveau.';
      if (!nativeMicActive) {
        await ensureDedicatedMicrophone();
        micNode = audio.createMediaStreamSource(micStream);
        micNode.connect(micInput);
      }

      setVolume();
      updateMicPriority(true);

      const picture = canvas.captureStream(30);
      const stream = new MediaStream([...picture.getVideoTracks(), ...mix.stream.getAudioTracks()]);
      const mimeType = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4'
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        throw new Error('Export MP4 direct non pris en charge par cet appareil.');
      }

      chunks = [];
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 10_000_000,
        audioBitsPerSecond: 192_000
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => status('Erreur d’encodage : vérifie l’espace disponible.');
      recorder.onstop = async () => {
        nativeMicActive = false;
        window.Android?.stopReactionMic?.();
        $('reactionMicSignal').textContent = usedNativeMic
          ? (nativeMicFramesDuringPause === 0 ? 'Micro coupé pendant toute la lecture.'
            : nativeMicSignalDuringPause ? 'Micro capté pendant la pause.' : 'Aucun signal micro mesuré pendant la pause.')
          : 'Prise terminée avec le micro du navigateur.';
        picture.getTracks().forEach((track) => track.stop());
        try { micNode?.disconnect(); } catch (_) {}
        try { micInput?.disconnect(); } catch (_) {}
        try { micHighpass?.disconnect(); } catch (_) {}
        try { micCompressor?.disconnect(); } catch (_) {}
        try { micGain?.disconnect(); } catch (_) {}
        try { masterCompressor?.disconnect(); } catch (_) {}
        try { keepAliveOscillator?.stop(); } catch (_) {}
        try { keepAliveOscillator?.disconnect(); } catch (_) {}
        try { keepAliveGain?.disconnect(); } catch (_) {}
        micNode = micInput = micHighpass = micCompressor = micGain = masterCompressor = null;
        keepAliveOscillator = keepAliveGain = null;
        micStream?.getTracks?.().forEach((track) => track.stop());
        micStream = null;
        try { sourceGain?.disconnect(); } catch (_) {}
        sourceGain?.connect(audio.destination);
        mix = null;

        if (!chunks.length) {
          $('reactionRecord').disabled = false;
          status('Aucun fichier généré.');
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        const suffix = outputLayout === 'horizontal' ? '16x9' : '9x16';
        const filename = `Remix-Reaction-${suffix}-${Date.now()}.mp4`;

        try {
          status('Enregistrement terminé. Sauvegarde…');
          await saveReactionBlob(blob, filename);
          status('Export terminé dans Téléchargements/RemixStudio.');
        } catch (error) {
          status(`Export impossible : ${error.message}`);
        } finally {
          $('reactionRecord').disabled = !cameraStream || !fileUrl;
          $('reactionOutputVertical').disabled = false;
          $('reactionOutputHorizontal').disabled = false;
          $('reactionFramingExtend').disabled = false;
          $('reactionFramingClean').disabled = false;
          $('reactionFramingCrop').disabled = false;
          $('reactionFramingFree').disabled = false;
        }
      };

      $('reactionOutputVertical').disabled = true;
      $('reactionOutputHorizontal').disabled = true;
      $('reactionFramingExtend').disabled = true;
      $('reactionFramingClean').disabled = true;
      $('reactionFramingCrop').disabled = true;
      $('reactionFramingFree').disabled = true;
      recorder.start(500);
      await video.play();
      recordingPaused = false;
      $('reactionRecord').disabled = true;
      $('reactionCamera').disabled = true;
      $('reactionPause').disabled = $('reactionStop').disabled = false;
      $('reactionPause').textContent = '⏸ Pause vidéo';
      status(`REC ${outputLayout === 'horizontal' ? '16:9' : '9:16'} · ${outputFraming === 'extend' ? 'Sans bandes' : outputFraming === 'clean' ? 'Propre' : outputFraming === 'crop' ? 'Recadré' : 'Libre'} · MP4.`);
    } catch (error) {
      nativeMicActive = false;
      window.Android?.stopReactionMic?.();
      $('reactionOutputVertical').disabled = false;
      $('reactionOutputHorizontal').disabled = false;
      $('reactionFramingExtend').disabled = false;
      $('reactionFramingClean').disabled = false;
      $('reactionFramingCrop').disabled = false;
      $('reactionFramingFree').disabled = false;
      if (active()) recorder.stop();
      else {
        micStream?.getTracks?.().forEach((track) => track.stop());
        micStream = null;
      }
      status(`Enregistrement impossible : ${error.message}`);
    }
  }

  function pauseRecording() {
    if (!active()) return;
    if (video.paused) {
      recordingPaused = false;
      video.play().catch(() => {});
      $('reactionPause').textContent = '⏸ Pause vidéo';
      ensureAudioEngineRunning();
      updateMicPriority();
      status('Vidéo reprise. Seul le son de la vidéo est enregistré.');
    } else {
      video.pause();
      recordingPaused = true;
      $('reactionPause').textContent = '▶ Reprendre vidéo';
      ensureAudioEngineRunning();
      updateMicPriority();
      status('Vidéo en pause. Seul le micro est enregistré.');
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

  function resetCameraPosition() {
    cameraPanX = cameraPanY = 0;
    $('reactionCameraZoom').value = '100';
    syncPreviewTransforms();
  }

  function resetVideoPosition() {
    videoPanX = videoPanY = 0;
    $('reactionZoom').value = '100';
    syncPreviewTransforms();
  }

  function bindDrag(element, target) {
    element.addEventListener('pointerdown', (event) => {
      if ((target === 'camera' && !cameraStream) || (target === 'video' && !fileUrl)) return;
      drag = { target, x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    });

    element.addEventListener('pointermove', (event) => {
      if (!drag || drag.target !== target) return;
      const rect = element.getBoundingClientRect();
      const dx = (event.clientX - drag.x) / Math.max(1, rect.width) * 100;
      const dy = (event.clientY - drag.y) / Math.max(1, rect.height) * 100;

      if (target === 'camera') {
        cameraPanX += dx;
        cameraPanY += dy;
      } else {
        videoPanX += dx;
        videoPanY += dy;
      }

      drag.x = event.clientX;
      drag.y = event.clientY;
      syncPreviewTransforms();
    });

    const stop = () => {
      if (drag?.target === target) drag = null;
    };
    element.addEventListener('pointerup', stop);
    element.addEventListener('pointercancel', stop);
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

    for (const id of ['editorTab', 'interviewTab', 'reactionTab']) {
      $(id).classList.toggle('active', id === `${which}Tab`);
    }

    if (reactionMode) {
      requestAnimationFrame(syncSharedPreviewFrameSize);
      ensureDraw();
      syncPreviewTransforms();
      stopTimelinePreview?.(true);
    } else if (!active()) {
      video.pause();
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      camera.srcObject = null;
      $('reactionCameraPlaceholder').classList.remove('hidden');
      $('reactionCamera').textContent = '📷 Caméra';
      $('reactionRecord').disabled = true;
    }
  }

  $('reactionInput').addEventListener('change', (event) => importVideo(event.target.files?.[0]));
  $('reactionCameraPlaceholder').addEventListener('click', startCamera);
  $('reactionVideoPlaceholder').addEventListener('click', () => {
    if (!active()) $('reactionInput').click();
  });
  $('reactionCamera').addEventListener('click', startCamera);

  $('reactionCameraQuick').addEventListener('click', (event) => {
    event.stopPropagation();
    startCamera();
  });
  $('reactionImportQuick').addEventListener('click', (event) => {
    event.stopPropagation();
    if (!active()) $('reactionInput').click();
  });

  $('reactionOutputVertical').addEventListener('click', () => setOutputLayout('vertical'));
  $('reactionOutputHorizontal').addEventListener('click', () => setOutputLayout('horizontal'));
  $('reactionFramingExtend').addEventListener('click', () => setFramingMode('extend'));
  $('reactionFramingClean').addEventListener('click', () => setFramingMode('clean'));
  $('reactionFramingCrop').addEventListener('click', () => setFramingMode('crop'));
  $('reactionFramingFree').addEventListener('click', () => setFramingMode('free'));

  $('reactionRecord').addEventListener('click', startRecording);
  $('reactionPause').addEventListener('click', pauseRecording);
  $('reactionStop').addEventListener('click', stopRecording);
  $('reactionPlay').addEventListener('click', () => {
    video.paused ? video.play().catch(() => {}) : video.pause();
  });

  video.addEventListener('play', () => {
    $('reactionPlay').textContent = '⏸ Pause vidéo';
    if (active()) {
      recordingPaused = false;
      $('reactionPause').textContent = '⏸ Pause vidéo';
      ensureAudioEngineRunning();
      updateMicPriority();
    }
  });
  video.addEventListener('pause', () => {
    $('reactionPlay').textContent = '▶ Lire';
    if (active()) {
      recordingPaused = true;
      $('reactionPause').textContent = '▶ Reprendre vidéo';
      ensureAudioEngineRunning();
      updateMicPriority();
    }
  });
  video.addEventListener('loadedmetadata', () => {
    $('reactionTime').textContent = `00:00 / ${format(video.duration)}`;
  });
  video.addEventListener('loadeddata', () => {
    $('reactionVideoPlaceholder').classList.add('hidden');
    syncSharedPreviewFrameSize();
    ensureDraw();
  });
  camera.addEventListener('loadeddata', () => {
    $('reactionCameraPlaceholder').classList.add('hidden');
    syncSharedPreviewFrameSize();
  });

  $('reactionBack').addEventListener('click', () => {
    video.currentTime = Math.max(0, video.currentTime - 5);
  });
  $('reactionForward').addEventListener('click', () => {
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
  });
  $('reactionSeek').addEventListener('input', () => {
    if (video.duration) video.currentTime = Number($('reactionSeek').value) / 1000 * video.duration;
  });

  $('reactionVolume').addEventListener('input', setVolume);
  $('reactionMicGain').addEventListener('input', () => updateMicPriority());
  $('reactionCameraZoom').addEventListener('input', syncPreviewTransforms);
  for (const button of document.querySelectorAll('[data-reaction-camera-zoom]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      $('reactionCameraZoom').value = button.dataset.reactionCameraZoom;
      syncPreviewTransforms();
    });
  }
  $('reactionZoom').addEventListener('input', syncPreviewTransforms);

  $('reactionMute').addEventListener('click', () => {
    mute = !mute;
    setVolume();
    $('reactionMute').textContent = mute ? '🔇 Réactiver' : '🔊 Son vidéo';
    $('reactionMute').setAttribute('aria-pressed', String(mute));
  });

  $('reactionCameraFitContain').addEventListener('click', () => {
    cameraFit = 'contain';
    resetCameraPosition();
  });
  $('reactionCameraFitCover').addEventListener('click', () => {
    cameraFit = 'cover';
    resetCameraPosition();
  });
  $('reactionCameraReset').addEventListener('click', resetCameraPosition);

  $('reactionFitContain').addEventListener('click', () => {
    videoFit = 'contain';
    resetVideoPosition();
  });
  $('reactionFitCover').addEventListener('click', () => {
    videoFit = 'cover';
    resetVideoPosition();
  });
  $('reactionReset').addEventListener('click', resetVideoPosition);

  bindDrag(cameraFrame, 'camera');
  bindDrag(videoFrame, 'video');

  $('editorTab').addEventListener('click', () => showTab('editor'));
  $('interviewTab').addEventListener('click', () => {
    showTab('interview');
    if (state.timelineSegments.length) $('exportBtn').click();
    else showToast('Importe deux vidéos sur la timeline, puis choisis le Mode 2.');
  });
  $('reactionTab').addEventListener('click', () => showTab('reaction'));

  setOutputLayout('vertical');
  setFramingMode('extend');
  window.addEventListener('resize', () => {
    syncSharedPreviewFrameSize();
    syncPreviewTransforms();
  });
  window.addEventListener('beforeunload', () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    micStream?.getTracks?.().forEach((track) => track.stop());
  });
})();
