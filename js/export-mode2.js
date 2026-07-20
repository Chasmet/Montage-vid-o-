'use strict';

(() => {
  const VERSION = '2.8.0';
  const originalExportTimeline = exportTimeline;
  const reactionAnalysisCache = new Map();
  let podcastExportRunning = false;
  let chooser = null;

  function injectPodcastStyles() {
    if (document.querySelector('#podcastModeStyles')) return;
    const style = document.createElement('style');
    style.id = 'podcastModeStyles';
    style.textContent = `
      .export-mode-overlay{position:fixed;inset:0;z-index:130;display:grid;place-items:end center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px)}
      .export-mode-card{width:min(100%,520px);padding:10px 12px calc(14px + env(safe-area-inset-bottom));border:1px solid rgba(255,255,255,.14);border-radius:22px;background:#11151d;box-shadow:0 25px 70px rgba(0,0,0,.65)}
      .export-mode-handle{width:45px;height:4px;margin:0 auto 13px;border-radius:99px;background:#596170}
      .export-mode-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
      .export-mode-title div{display:grid;gap:4px}.export-mode-title strong{font-size:1rem}.export-mode-title small{color:#9ea6b5;font-size:.7rem;line-height:1.4}
      .export-mode-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.12);border-radius:50%;background:#202632;color:#fff;font-size:1.35rem}
      .export-mode-choice{width:100%;display:grid;grid-template-columns:58px 1fr auto;align-items:center;gap:11px;margin-top:9px;padding:12px;border:1px solid rgba(255,255,255,.11);border-radius:15px;background:#181d27;color:#fff;text-align:left}
      .export-mode-choice:active{transform:scale(.99)}
      .export-mode-icon{width:50px;height:50px;display:grid;place-items:center;border-radius:13px;background:rgba(32,217,238,.14);color:#20d9ee;font-size:1.3rem;font-weight:900}
      .export-mode-copy{display:grid;gap:4px}.export-mode-copy strong{font-size:.86rem}.export-mode-copy small{color:#9ea6b5;font-size:.67rem;line-height:1.35}
      .export-mode-arrow{color:#20d9ee;font-size:1.4rem}
      .export-mode-choice.podcast{border-color:rgba(32,217,238,.32);background:linear-gradient(135deg,rgba(32,217,238,.12),#181d27 58%)}
      .export-mode-badge{display:inline-block;width:max-content;padding:3px 7px;border-radius:999px;background:#20d9ee;color:#001318;font-size:.56rem;font-weight:900}
    `;
    document.head.append(style);
  }

  function closeChooser() {
    chooser?.remove();
    chooser = null;
  }

  function showExportModeChooser() {
    if (!state.timelineSegments.length) return showToast('La timeline est vide.');
    injectPodcastStyles();
    closeChooser();
    chooser = document.createElement('div');
    chooser.className = 'export-mode-overlay';
    chooser.innerHTML = `
      <div class="export-mode-card" role="dialog" aria-modal="true" aria-label="Choisir le mode d’export">
        <div class="export-mode-handle"></div>
        <div class="export-mode-title">
          <div><strong>Choisir le rendu final</strong><small>La timeline reste identique. Seule la présentation de la vidéo exportée change.</small></div>
          <button class="export-mode-close" type="button" aria-label="Fermer">×</button>
        </div>
        <button class="export-mode-choice normal" type="button">
          <span class="export-mode-icon">1</span>
          <span class="export-mode-copy"><strong>Mode 1 — Montage normal</strong><small>Les clips passent les uns après les autres en plein écran.</small></span>
          <span class="export-mode-arrow">›</span>
        </button>
        <button class="export-mode-choice podcast" type="button">
          <span class="export-mode-icon">2</span>
          <span class="export-mode-copy"><span class="export-mode-badge">INTERVIEW NATURELLE</span><strong>Mode 2 — Deux vidéos côte à côte</strong><small>Un côté parle. L’autre reste vivant grâce à une réaction calme automatique, sans répéter les scènes fortes.</small></span>
          <span class="export-mode-arrow">›</span>
        </button>
      </div>
    `;
    document.body.append(chooser);
    chooser.querySelector('.export-mode-close').addEventListener('click', closeChooser);
    chooser.addEventListener('click', (event) => { if (event.target === chooser) closeChooser(); });
    chooser.querySelector('.normal').addEventListener('click', async () => {
      closeChooser();
      await originalExportTimeline();
    });
    chooser.querySelector('.podcast').addEventListener('click', async () => {
      closeChooser();
      await exportPodcastInterview();
    });
  }

  function waitForMetadata(video) {
    return new Promise((resolve, reject) => {
      if (video.readyState >= 1) return resolve();
      const timer = setTimeout(() => reject(new Error('Chargement vidéo trop long.')), 5000);
      video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
      video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Vidéo illisible.')); }, { once: true });
    });
  }

  async function createVideoForSegment(segment) {
    const media = getMediaByRef(segment.type, segment.mediaId);
    if (!media?.url) throw new Error(`Média indisponible : ${segment.label || 'clip'}`);
    const video = document.createElement('video');
    video.src = media.url;
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true;
    await waitForMetadata(video);
    return video;
  }

  function frameDifference(first, second) {
    if (!first || !second || first.length !== second.length) return 999;
    let total = 0;
    let samples = 0;
    for (let index = 0; index < first.length; index += 16) {
      total += Math.abs(first[index] - second[index]);
      total += Math.abs(first[index + 1] - second[index + 1]);
      total += Math.abs(first[index + 2] - second[index + 2]);
      samples += 3;
    }
    return samples ? total / samples : 999;
  }

  async function samplePixels(video, time, canvas, context) {
    await seekVideo(video, time);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height).data.slice();
  }

  async function analyzeReaction(segment) {
    if (reactionAnalysisCache.has(segment.id)) return reactionAnalysisCache.get(segment.id);
    const duration = segmentDuration(segment);
    const fallback = { mode: 'still', stillTime: segment.start + Math.max(0, duration * 0.65), windows: [] };
    if (duration < 0.6) {
      reactionAnalysisCache.set(segment.id, fallback);
      return fallback;
    }

    let video = null;
    try {
      video = await createVideoForSegment(segment);
      const canvas = document.createElement('canvas');
      canvas.width = 56;
      canvas.height = 32;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const windowLength = clamp(duration * 0.18, 0.55, 1.35);
      const probeGap = Math.min(0.32, windowLength * 0.45);
      const candidates = [];
      const candidateCount = duration > 8 ? 8 : 6;

      for (let index = 0; index < candidateCount; index += 1) {
        const ratio = 0.12 + (index / Math.max(1, candidateCount - 1)) * 0.72;
        const start = clamp(segment.start + duration * ratio, segment.start, Math.max(segment.start, segment.end - windowLength));
        const first = await samplePixels(video, start, canvas, context);
        const second = await samplePixels(video, Math.min(segment.end - 0.03, start + probeGap), canvas, context);
        candidates.push({ start, end: Math.min(segment.end, start + windowLength), score: frameDifference(first, second) });
      }

      candidates.sort((a, b) => a.score - b.score);
      const calmWindows = candidates.filter((candidate) => candidate.score <= 11.5).slice(0, 2);
      const best = candidates[0];
      const result = calmWindows.length
        ? { mode: 'loop', stillTime: best.start + Math.min(windowLength / 2, 0.35), windows: calmWindows }
        : { mode: 'still', stillTime: best.start + Math.min(windowLength / 2, 0.35), windows: [] };
      reactionAnalysisCache.set(segment.id, result);
      return result;
    } catch (error) {
      console.warn('Analyse de réaction indisponible', error);
      reactionAnalysisCache.set(segment.id, fallback);
      return fallback;
    } finally {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    }
  }

  async function createReactionController(segment) {
    const plan = await analyzeReaction(segment);
    const video = await createVideoForSegment(segment);
    video.muted = true;
    video.volume = 0;
    let windowIndex = 0;

    if (plan.mode === 'loop' && plan.windows.length) {
      await seekVideo(video, plan.windows[0].start);
      await video.play().catch(() => {});
    } else {
      await seekVideo(video, plan.stillTime);
      video.pause();
    }

    return {
      video,
      plan,
      async update() {
        if (plan.mode !== 'loop' || !plan.windows.length) return;
        const currentWindow = plan.windows[windowIndex];
        if (video.currentTime < currentWindow.end - 0.03 && !video.ended) return;
        windowIndex = (windowIndex + 1) % plan.windows.length;
        await seekVideo(video, plan.windows[windowIndex].start);
        await video.play().catch(() => {});
      },
      dispose() {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }

  function drawVideoInRect(context, video, rect, segment, dim = 0, motionTime = 0) {
    const { x, y, width, height } = rect;
    const rotation = ((Number(segment?.rotation || 0) % 360) + 360) % 360;
    const sideways = rotation === 90 || rotation === 270;
    const sourceWidth = video.videoWidth || width;
    const sourceHeight = video.videoHeight || height;
    const availableWidth = sideways ? height : width;
    const availableHeight = sideways ? width : height;
    const fit = segment?.fit === 'contain' ? 'contain' : 'cover';
    const baseScale = fit === 'contain'
      ? Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight)
      : Math.max(availableWidth / sourceWidth, availableHeight / sourceHeight);
    const gentleZoom = 1.012 + Math.sin(motionTime * 0.55) * 0.008;
    const drawWidth = sourceWidth * baseScale * gentleZoom;
    const drawHeight = sourceHeight * baseScale * gentleZoom;
    const panX = Math.sin(motionTime * 0.38) * width * 0.008;
    const panY = Math.cos(motionTime * 0.31) * height * 0.006;

    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.fillStyle = '#000';
    context.fillRect(x, y, width, height);
    context.translate(x + width / 2 + panX, y + height / 2 + panY);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();

    if (dim > 0) {
      context.fillStyle = `rgba(0,0,0,${dim})`;
      context.fillRect(x, y, width, height);
    }
  }

  async function runPodcastPhase({ activeSegment, reactionSegment, activeSide, context, width, height, audioContext, audioDestination, completedDuration, totalDuration }) {
    const activeVideo = await createVideoForSegment(activeSegment);
    activeVideo.muted = false;
    activeVideo.volume = 1;
    const reaction = reactionSegment ? await createReactionController(reactionSegment) : null;
    let sourceNode = null;
    let gainNode = null;

    try {
      sourceNode = audioContext.createMediaElementSource(activeVideo);
      gainNode = audioContext.createGain();
      gainNode.gain.value = activeSegment.muted ? 0 : clamp(activeSegment.volume ?? 1, 0, 1.5);
      sourceNode.connect(gainNode).connect(audioDestination);
    } catch (error) {
      console.warn('Audio du mode interview non routé', error);
    }

    await seekVideo(activeVideo, activeSegment.start);
    await activeVideo.play();
    const activeLength = Math.max(0.01, segmentDuration(activeSegment));
    const leftRect = { x: 0, y: 0, width: Math.floor(width / 2), height };
    const rightRect = { x: Math.floor(width / 2), y: 0, width: width - Math.floor(width / 2), height };
    const fullRect = { x: 0, y: 0, width, height };
    let lastProgress = -1;

    await new Promise((resolve) => {
      let reactionUpdateBusy = false;
      const render = (stamp = performance.now()) => {
        const local = clamp(activeVideo.currentTime - activeSegment.start, 0, activeLength);
        context.fillStyle = '#000';
        context.fillRect(0, 0, width, height);

        if (!reactionSegment || !reaction) {
          drawVideoInRect(context, activeVideo, fullRect, activeSegment, 0, local);
        } else if (activeSide === 'left') {
          drawVideoInRect(context, activeVideo, leftRect, activeSegment, 0, local);
          drawVideoInRect(context, reaction.video, rightRect, reactionSegment, 0.17, local + 1.4);
        } else {
          drawVideoInRect(context, reaction.video, leftRect, reactionSegment, 0.17, local + 1.4);
          drawVideoInRect(context, activeVideo, rightRect, activeSegment, 0, local);
        }

        if (reactionSegment) {
          context.fillStyle = 'rgba(255,255,255,.82)';
          context.fillRect(Math.floor(width / 2) - 1, 0, 2, height);
        }

        if (reaction && !reactionUpdateBusy) {
          reactionUpdateBusy = true;
          reaction.update().finally(() => { reactionUpdateBusy = false; });
        }

        const rounded = Math.min(99, Math.round(((completedDuration + local) / totalDuration) * 100));
        if (rounded !== lastProgress) {
          lastProgress = rounded;
          els.exportProgress.value = rounded;
          els.exportPercent.textContent = `${rounded}%`;
        }

        if (activeVideo.currentTime >= activeSegment.end || activeVideo.ended) {
          activeVideo.pause();
          resolve();
        } else {
          scheduleVideoFrame(activeVideo, render);
        }
      };
      scheduleVideoFrame(activeVideo, render);
    });

    sourceNode?.disconnect();
    gainNode?.disconnect();
    reaction?.dispose();
    activeVideo.pause();
    activeVideo.removeAttribute('src');
    activeVideo.load();
    return activeLength;
  }

  async function exportPodcastInterview() {
    if (podcastExportRunning) return;
    if (state.timelineSegments.length < 2) return showToast('Le Mode 2 nécessite au moins deux clips.');
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      return showToast('Cet appareil ne permet pas le Mode 2.');
    }

    podcastExportRunning = true;
    stopTimelinePreview(true);
    els.exportBtn.disabled = true;
    els.exportOverlay.classList.remove('hidden');
    els.exportStatus.textContent = 'Analyse des réactions naturelles…';
    els.exportProgress.value = 0;
    els.exportPercent.textContent = '0%';

    const { width, height } = outputDimensions();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    const canvasStream = canvas.captureStream(30);
    const audioContext = new AudioContext({ latencyHint: 'playback' });
    await audioContext.resume();
    const audioDestination = audioContext.createMediaStreamDestination();
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
    const mime = exportMime();
    const recorderOptions = mime.type
      ? { mimeType: mime.type, videoBitsPerSecond: 15_000_000, audioBitsPerSecond: 192_000 }
      : undefined;
    const outputRecorder = new MediaRecorder(combinedStream, recorderOptions);
    const chunks = [];
    outputRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise((resolve) => { outputRecorder.onstop = resolve; });
    outputRecorder.start(1000);

    const segments = state.timelineSegments.filter((segment) => segmentDuration(segment) > 0.04);
    const totalDuration = segments.reduce((sum, segment) => sum + segmentDuration(segment), 0);
    let completedDuration = 0;

    try {
      for (let index = 0; index < segments.length; index += 2) {
        const left = segments[index];
        const right = segments[index + 1] || null;
        const pairNumber = Math.floor(index / 2) + 1;
        const pairCount = Math.ceil(segments.length / 2);

        els.exportStatus.textContent = `Mode 2 · duo ${pairNumber}/${pairCount} · côté gauche`;
        completedDuration += await runPodcastPhase({
          activeSegment: left,
          reactionSegment: right,
          activeSide: 'left',
          context,
          width,
          height,
          audioContext,
          audioDestination,
          completedDuration,
          totalDuration
        });

        if (right) {
          els.exportStatus.textContent = `Mode 2 · duo ${pairNumber}/${pairCount} · côté droit`;
          completedDuration += await runPodcastPhase({
            activeSegment: right,
            reactionSegment: left,
            activeSide: 'right',
            context,
            width,
            height,
            audioContext,
            audioDestination,
            completedDuration,
            totalDuration
          });
        }
      }

      await sleep(180);
      outputRecorder.stop();
      await stopped;
      const output = new Blob(chunks, { type: mime.type || 'video/webm' });
      const url = URL.createObjectURL(output);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `remix-studio-mode2-interview-1080p-${stamp}.${mime.ext}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      els.exportProgress.value = 100;
      els.exportPercent.textContent = '100%';
      els.exportStatus.textContent = 'Interview naturelle 1080p prête';
      showToast('Mode 2 terminé. Les deux côtés restent animés naturellement.');
      await sleep(900);
    } catch (error) {
      console.error(error);
      if (outputRecorder.state !== 'inactive') outputRecorder.stop();
      els.exportStatus.textContent = 'Échec du Mode 2';
      showToast(error.message || 'Le Mode 2 a échoué. Ferme les autres applications puis recommence.');
      await sleep(1100);
    } finally {
      canvasStream.getTracks().forEach((track) => track.stop());
      audioDestination.stream.getTracks().forEach((track) => track.stop());
      await audioContext.close().catch(() => {});
      els.exportOverlay.classList.add('hidden');
      els.exportBtn.disabled = !state.timelineSegments.length;
      podcastExportRunning = false;
    }
  }

  exportTimeline = showExportModeChooser;
  document.documentElement.dataset.remixPodcastModeVersion = VERSION;
})();
