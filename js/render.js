function stopFinalPreview() {
  previewAbortToken += 1;
  isFinalPreviewing = false;
}

async function seekVideo(video, time) {
  return new Promise((resolve) => {
    const done = () => resolve();
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = time;
    setTimeout(resolve, 1200);
  });
}

async function previewFinal() {
  if (!state.finalSegments.length) return showToast('La liste finale est vide.');
  await closeCamera();
  stopFinalPreview();
  const token = previewAbortToken;
  isFinalPreviewing = true;
  state.activeView = 'final';
  renderAll();
  for (const segment of state.finalSegments) {
    if (!isFinalPreviewing || token !== previewAbortToken) break;
    const media = getMediaByRef(segment.type, segment.mediaId);
    if (!media?.url) continue;
    applyPreviewMedia(media, segment.type, segment, true);
    els.mainVideo.volume = segment.muted ? 0 : clamp(segment.volume ?? 1, 0, 1);
    els.mainVideo.style.objectFit = segment.fit || 'cover';
    await new Promise((resolve) => {
      if (els.mainVideo.readyState >= 1) resolve();
      else els.mainVideo.addEventListener('loadedmetadata', resolve, { once: true });
    });
    await seekVideo(els.mainVideo, segment.start);
    await els.mainVideo.play().catch(() => {});
    await new Promise((resolve) => {
      const check = () => {
        if (!isFinalPreviewing || token !== previewAbortToken || els.mainVideo.currentTime >= segment.end || els.mainVideo.ended) {
          els.mainVideo.pause();
          resolve();
        } else requestAnimationFrame(check);
      };
      check();
    });
  }
  isFinalPreviewing = false;
  els.mainVideo.style.objectFit = 'contain';
  showToast('Lecture de la liste finale terminée.');
}

function drawVideoFrame(ctx, video, width, height, fit = 'cover', alpha = 1) {
  const vw = video.videoWidth || width;
  const vh = video.videoHeight || height;
  const scale = fit === 'contain' ? Math.min(width / vw, height / vh) : Math.max(width / vw, height / vh);
  const drawWidth = vw * scale;
  const drawHeight = vh * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(video, x, y, drawWidth, drawHeight);
  ctx.restore();
}

function outputDimensions() {
  const aspect = state.outputAspect === 'auto' ? (state.source?.orientation || 'vertical') : state.outputAspect;
  const quality = Number(state.quality || 720);
  if (aspect === 'horizontal') return quality === 1080 ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  return quality === 1080 ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
}

function exportMime() {
  const candidates = [
    { type: 'video/mp4;codecs=h264,aac', ext: 'mp4' },
    { type: 'video/mp4', ext: 'mp4' },
    { type: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { type: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { type: 'video/webm', ext: 'webm' }
  ];
  return candidates.find(({ type }) => MediaRecorder.isTypeSupported(type)) || { type: '', ext: 'webm' };
}

async function exportFinal() {
  if (!state.finalSegments.length) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    return showToast('Ce navigateur ne permet pas encore l’export vidéo. Utilise Chrome Android récent.');
  }
  const totalDuration = state.finalSegments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);
  if (!totalDuration) return;
  els.exportBtn.disabled = true;
  els.exportProgressWrap.classList.remove('hidden');
  els.exportStatus.textContent = 'Préparation des pistes…';
  els.exportProgress.value = 0;
  els.exportPercent.textContent = '0%';
  const { width, height } = outputDimensions();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const canvasStream = canvas.captureStream(30);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioDestination = audioContext.createMediaStreamDestination();
  const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
  const mime = exportMime();
  const recorderOptions = mime.type ? { mimeType: mime.type, videoBitsPerSecond: state.quality === '1080' ? 14_000_000 : 7_000_000, audioBitsPerSecond: 160_000 } : undefined;
  const outputRecorder = new MediaRecorder(combinedStream, recorderOptions);
  const chunks = [];
  outputRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve) => { outputRecorder.onstop = resolve; });
  outputRecorder.start(1000);
  let completedDuration = 0;
  try {
    for (let index = 0; index < state.finalSegments.length; index += 1) {
      const segment = state.finalSegments[index];
      const media = getMediaByRef(segment.type, segment.mediaId);
      if (!media?.url) continue;
      els.exportStatus.textContent = `Rendu du clip ${index + 1}/${state.finalSegments.length}`;
      const video = document.createElement('video');
      video.src = media.url;
      video.preload = 'auto';
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error(`Clip illisible : ${segment.label}`));
      });
      let sourceNode = null;
      let gainNode = null;
      try {
        sourceNode = audioContext.createMediaElementSource(video);
        gainNode = audioContext.createGain();
        gainNode.gain.value = segment.muted ? 0 : clamp(segment.volume ?? 1, 0, 1.5);
        sourceNode.connect(gainNode).connect(audioDestination);
      } catch (error) {
        console.warn('Audio non routé pour ce clip', error);
      }
      await seekVideo(video, segment.start);
      await video.play();
      const segmentDuration = Math.max(0.01, segment.end - segment.start);
      await new Promise((resolve) => {
        const render = () => {
          const local = clamp(video.currentTime - segment.start, 0, segmentDuration);
          let alpha = 1;
          if (segment.transition === 'fade') {
            alpha = Math.min(1, local / 0.22, (segmentDuration - local) / 0.22);
          }
          drawVideoFrame(ctx, video, width, height, segment.fit || 'cover', Math.max(0, alpha));
          const progress = ((completedDuration + local) / totalDuration) * 100;
          els.exportProgress.value = progress;
          els.exportPercent.textContent = `${Math.min(99, Math.round(progress))}%`;
          if (video.currentTime >= segment.end || video.ended) {
            video.pause();
            resolve();
          } else requestAnimationFrame(render);
        };
        render();
      });
      sourceNode?.disconnect();
      gainNode?.disconnect();
      completedDuration += segmentDuration;
    }
    await sleep(200);
    outputRecorder.stop();
    await stopped;
    const output = new Blob(chunks, { type: mime.type || 'video/webm' });
    const url = URL.createObjectURL(output);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `remix-studio-${stamp}.${mime.ext}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    els.exportProgress.value = 100;
    els.exportPercent.textContent = '100%';
    els.exportStatus.textContent = `Vidéo prête (${mime.ext.toUpperCase()})`;
    showToast('Téléchargement de la vidéo lancé.');
  } catch (error) {
    console.error(error);
    if (outputRecorder.state !== 'inactive') outputRecorder.stop();
    els.exportStatus.textContent = 'Échec de l’export';
    showToast(error.message || 'L’export a échoué. Réduis la qualité ou la durée.');
  } finally {
    canvasStream.getTracks().forEach((track) => track.stop());
    audioDestination.stream.getTracks().forEach((track) => track.stop());
    await audioContext.close().catch(() => {});
    els.exportBtn.disabled = false;
  }
}
