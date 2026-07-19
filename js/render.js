function stopTimelinePreview(updateButton = false) {
  previewAbortToken += 1;
  isTimelinePreviewing = false;
  els.mainVideo.pause();
  if (updateButton) els.playBtn.textContent = '▶';
}

async function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs((video.currentTime || 0) - time) < 0.025) return resolve();
    const done = () => resolve();
    video.addEventListener('seeked', done, { once: true });
    try { video.currentTime = time; } catch { resolve(); }
    setTimeout(resolve, 1200);
  });
}

async function previewTimeline(startProjectTime = 0) {
  if (!state.timelineSegments.length) return showToast('La timeline est vide.');
  await closeCamera();
  stopTimelinePreview();
  const token = previewAbortToken;
  isTimelinePreviewing = true;
  els.playBtn.textContent = 'Ⅱ';

  const startingInfo = timelineInfoAt(startProjectTime) || timelineInfoAt(0);
  if (!startingInfo) return;
  let completedBefore = startingInfo.segmentStart;

  for (let index = startingInfo.index; index < state.timelineSegments.length; index += 1) {
    if (!isTimelinePreviewing || token !== previewAbortToken) break;
    const segment = state.timelineSegments[index];
    const media = getMediaByRef(segment.type, segment.mediaId);
    const segmentLength = segmentDuration(segment);
    if (!media?.url || segmentLength <= 0) {
      completedBefore += segmentLength;
      continue;
    }

    const startOffset = index === startingInfo.index ? startingInfo.local : 0;
    const sourceStart = segment.start + startOffset;
    state.selectedId = segment.id;
    applyPreviewMedia(media, segment.type, segment, true, sourceStart);
    renderTimelineSelection();
    renderInspector();

    await new Promise((resolve) => {
      if (els.mainVideo.readyState >= 1) resolve();
      else els.mainVideo.addEventListener('loadedmetadata', resolve, { once: true });
    });
    await seekVideo(els.mainVideo, sourceStart);
    els.mainVideo.volume = segment.muted ? 0 : clamp(segment.volume ?? 1, 0, 1);
    els.mainVideo.muted = Boolean(segment.muted);
    await els.mainVideo.play().catch(() => {});

    await new Promise((resolve) => {
      let lastScrollUpdate = 0;
      const check = (stamp) => {
        if (!isTimelinePreviewing || token !== previewAbortToken || els.mainVideo.currentTime >= segment.end || els.mainVideo.ended) {
          els.mainVideo.pause();
          resolve();
          return;
        }
        const local = clamp(els.mainVideo.currentTime - segment.start, 0, segmentLength);
        state.timelineTime = clamp(completedBefore + local, 0, timelineDuration());
        updateProjectLabels();
        if (stamp - lastScrollUpdate > 70) {
          syncTimelineScrollFromState();
          lastScrollUpdate = stamp;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
    completedBefore += segmentLength;
  }

  const reachedEnd = isTimelinePreviewing && token === previewAbortToken;
  isTimelinePreviewing = false;
  els.playBtn.textContent = '▶';
  if (reachedEnd) {
    state.timelineTime = timelineDuration();
    updateProjectLabels();
    syncTimelineScrollFromState();
  }
}

function drawVideoFrame(ctx, video, width, height, fit = 'cover', alpha = 1, rotation = 0, layout = null) {
  const vw = video.videoWidth || width;
  const vh = video.videoHeight || height;
  const normalizedRotation = ((Number(rotation) % 360) + 360) % 360;
  const quarterTurn = ((Math.round(normalizedRotation / 90) * 90) % 360 + 360) % 360;
  const sideways = quarterTurn === 90 || quarterTurn === 270;
  const availableWidth = sideways ? height : width;
  const availableHeight = sideways ? width : height;
  const baseScale = fit === 'contain'
    ? Math.min(availableWidth / vw, availableHeight / vh)
    : Math.max(availableWidth / vw, availableHeight / vh);
  const zoom = clamp(layout?.zoom ?? 1, 0.5, 3);
  const drawWidth = vw * baseScale * zoom;
  const drawHeight = vh * baseScale * zoom;
  const x = width / 2 + (clamp(layout?.x ?? 0, -150, 150) / 100) * (width / 2);
  const y = height / 2 + (clamp(layout?.y ?? 0, -150, 150) / 100) * (height / 2);

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function outputDimensions() {
  if (typeof projectOutputDimensions === 'function') return projectOutputDimensions();
  let automatic = state.source?.orientation || null;
  if (!automatic) {
    const first = state.timelineSegments[0];
    const media = first ? getMediaByRef(first.type, first.mediaId) : null;
    automatic = media ? effectiveOrientation(media, first.rotation || 0) : 'vertical';
  }
  const aspect = state.outputAspect === 'auto' ? automatic : state.outputAspect;
  return aspect === 'horizontal' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
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

async function exportTimeline() {
  if (!state.timelineSegments.length) return showToast('La timeline est vide.');
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    return showToast('Cet appareil ne permet pas encore l’export vidéo.');
  }

  stopTimelinePreview(true);
  const totalDuration = timelineDuration();
  if (!totalDuration) return;
  els.exportBtn.disabled = true;
  els.exportOverlay.classList.remove('hidden');
  els.exportStatus.textContent = 'Préparation du montage 1080p…';
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
  const recorderOptions = mime.type
    ? { mimeType: mime.type, videoBitsPerSecond: 14_000_000, audioBitsPerSecond: 192_000 }
    : undefined;
  const outputRecorder = new MediaRecorder(combinedStream, recorderOptions);
  const chunks = [];
  outputRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve) => { outputRecorder.onstop = resolve; });
  outputRecorder.start(1000);
  let completedDuration = 0;

  try {
    for (let index = 0; index < state.timelineSegments.length; index += 1) {
      const segment = state.timelineSegments[index];
      const media = getMediaByRef(segment.type, segment.mediaId);
      if (!media?.url) continue;
      els.exportStatus.textContent = `Export du clip ${index + 1}/${state.timelineSegments.length}`;
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
      const segmentLength = Math.max(0.01, segmentDuration(segment));
      const layout = typeof getClipLayout === 'function' ? getClipLayout(segment.id) : null;
      const rotation = typeof totalClipRotation === 'function'
        ? totalClipRotation(segment)
        : Number(segment.rotation || 0);
      await new Promise((resolve) => {
        const render = () => {
          const local = clamp(video.currentTime - segment.start, 0, segmentLength);
          let alpha = 1;
          if (segment.transition === 'fade') alpha = Math.min(1, local / 0.22, (segmentLength - local) / 0.22);
          drawVideoFrame(ctx, video, width, height, segment.fit || 'cover', Math.max(0, alpha), rotation, layout);
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
      completedDuration += segmentLength;
    }

    await sleep(220);
    outputRecorder.stop();
    await stopped;
    const output = new Blob(chunks, { type: mime.type || 'video/webm' });
    const url = URL.createObjectURL(output);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `remix-studio-1080p-${stamp}.${mime.ext}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    els.exportProgress.value = 100;
    els.exportPercent.textContent = '100%';
    els.exportStatus.textContent = `Vidéo 1080p prête (${mime.ext.toUpperCase()})`;
    showToast('Export terminé. La vidéo est dans tes téléchargements.');
    await sleep(1000);
  } catch (error) {
    console.error(error);
    if (outputRecorder.state !== 'inactive') outputRecorder.stop();
    els.exportStatus.textContent = 'Échec de l’export';
    showToast(error.message || 'L’export a échoué. Ferme les autres applications puis recommence.');
    await sleep(1300);
  } finally {
    canvasStream.getTracks().forEach((track) => track.stop());
    audioDestination.stream.getTracks().forEach((track) => track.stop());
    await audioContext.close().catch(() => {});
    els.exportOverlay.classList.add('hidden');
    els.exportBtn.disabled = !state.timelineSegments.length;
  }
}
