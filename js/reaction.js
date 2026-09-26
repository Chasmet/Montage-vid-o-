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

  let fileUrl, cameraStream, recorder, chunks = [], audio, sourceNode, sourceGain, micNode, mix;
  let visible = false, recordingPaused = false, frameId = 0, drag = null, mute = false;
  let requestingCamera = false;
  let outputLayout = 'vertical';
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

  function drawRegion(element, region, zoom, panXPercent, panYPercent, fit, mirror = false) {
    const { x, y, w, h } = region;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);

    if (element.readyState >= 2 && element.videoWidth && element.videoHeight) {
      const fitScale = fit === 'contain'
        ? Math.min(w / element.videoWidth, h / element.videoHeight)
        : Math.max(w / element.videoWidth, h / element.videoHeight);
      const scale = fitScale * zoom;
      const dw = element.videoWidth * scale;
      const dh = element.videoHeight * scale;
      const panX = panXPercent / 100 * w;
      const panY = panYPercent / 100 * h;

      if (mirror) {
        ctx.translate(x + w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(element, (w - dw) / 2 - panX, y + (h - dh) / 2 + panY, dw, dh);
      } else {
        ctx.drawImage(element, x + (w - dw) / 2 + panX, y + (h - dh) / 2 + panY, dw, dh);
      }
    }
    ctx.restore();
  }

  function syncSharedPreviewFrameSize() {
    const apply = (half, frame) => {
      const rect = half.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      let w = rect.width;
      let h = w / sourceAspect;
      if (h > rect.height) {
        h = rect.height;
        w = h * sourceAspect;
      }
      frame.style.width = `${Math.max(1, w)}px`;
      frame.style.height = `${Math.max(1, h)}px`;
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

    video.style.objectFit = videoFit;
    video.style.transform = `translate3d(${videoPanX}%, ${videoPanY}%, 0) scale(${videoZoom})`;

    $('reactionCameraFitContain').classList.toggle('active', cameraFit === 'contain');
    $('reactionCameraFitCover').classList.toggle('active', cameraFit === 'cover');
    $('reactionFitContain').classList.toggle('active', videoFit === 'contain');
    $('reactionFitCover').classList.toggle('active', videoFit === 'cover');
  }

  function draw() {
    if (!visible && !active()) {
      frameId = 0;
      return;
    }

    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const r = regions();
    drawRegion(
      camera,
      r.camera,
      Number($('reactionCameraZoom').value) / 100,
      cameraPanX,
      cameraPanY,
      'cover',
      true
    );
    drawRegion(
      video,
      r.video,
      Number($('reactionZoom').value) / 100,
      videoPanX,
      videoPanY,
      'cover',
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

      const portrait = sourceAspect <= 1;
      const videoConstraints = {
        facingMode: { ideal: 'user' },
        width: { ideal: portrait ? 1080 : 1920 },
        height: { ideal: portrait ? 1920 : 1080 },
        aspectRatio: { ideal: sourceAspect }
      };

      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (_) {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, aspectRatio: { ideal: sourceAspect } },
          audio: false
        });
        status('Caméra active. Micro non autorisé : la prise sera sans ta voix.');
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
      if (cameraStream.getAudioTracks().length) {
        status('Caméra et micro prêts. Même cadre que la vidéo importée.');
      }
    } catch (error) {
      cameraStream = null;
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

  async function startRecording() {
    if (!fileUrl || !cameraStream || active()) return;
    try {
      if (!canvas.captureStream || !window.MediaRecorder) {
        throw new Error('Enregistrement Split Screen non pris en charge par cet appareil.');
      }

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
        audioBitsPerSecond: 160_000
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => status('Erreur d’encodage : vérifie l’espace disponible.');
      recorder.onstop = async () => {
        picture.getTracks().forEach((track) => track.stop());
        micNode?.disconnect();
        micNode = null;
        try { sourceGain?.disconnect(mix); } catch (_) {}
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
        }
      };

      $('reactionOutputVertical').disabled = true;
      $('reactionOutputHorizontal').disabled = true;
      recorder.start(500);
      await video.play();
      recordingPaused = false;
      $('reactionRecord').disabled = true;
      $('reactionCamera').disabled = true;
      $('reactionPause').disabled = $('reactionStop').disabled = false;
      $('reactionPause').textContent = '⏸ Pause';
      status(`REC ${outputLayout === 'horizontal' ? '16:9' : '9:16'} · plein écran MP4 · deux moitiés identiques.`);
    } catch (error) {
      $('reactionOutputVertical').disabled = false;
      $('reactionOutputHorizontal').disabled = false;
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

  $('reactionRecord').addEventListener('click', startRecording);
  $('reactionPause').addEventListener('click', pauseRecording);
  $('reactionStop').addEventListener('click', stopRecording);
  $('reactionPlay').addEventListener('click', () => {
    video.paused ? video.play().catch(() => {}) : video.pause();
  });

  video.addEventListener('play', () => { $('reactionPlay').textContent = '⏸ Pause vidéo'; });
  video.addEventListener('pause', () => { $('reactionPlay').textContent = '▶ Lire'; });
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
  $('reactionCameraZoom').addEventListener('input', syncPreviewTransforms);
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
  window.addEventListener('resize', () => {
    syncSharedPreviewFrameSize();
    syncPreviewTransforms();
  });
  window.addEventListener('beforeunload', () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
  });
})();