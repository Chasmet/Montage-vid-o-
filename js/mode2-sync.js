'use strict';

(() => {
  const VERSION = '2.9.0';
  const plans = new Map();
  let running = false;

  function waitMeta(video) {
    return new Promise((resolve, reject) => {
      if (video.readyState >= 1) return resolve();
      const timer = setTimeout(() => reject(new Error('Chargement vidéo trop long.')), 6500);
      video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
      video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Vidéo illisible.')); }, { once: true });
    });
  }

  async function videoFor(segment) {
    const media = getMediaByRef(segment.type, segment.mediaId);
    if (!media?.url) throw new Error(`Média indisponible : ${segment.label || 'clip'}`);
    const video = document.createElement('video');
    video.src = media.url;
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true;
    await waitMeta(video);
    return video;
  }

  function dispose(video) {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function frameDiff(a, b) {
    if (!a || !b || a.length !== b.length) return 999;
    let total = 0;
    let count = 0;
    for (let i = 0; i < a.length; i += 16) {
      total += Math.abs(a[i] - b[i]);
      total += Math.abs(a[i + 1] - b[i + 1]);
      total += Math.abs(a[i + 2] - b[i + 2]);
      count += 3;
    }
    return count ? total / count : 999;
  }

  async function pixels(video, time, canvas, ctx) {
    await seekVideo(video, time);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice();
  }

  async function planFor(segment) {
    if (plans.has(segment.id)) return plans.get(segment.id);
    const duration = segmentDuration(segment);
    const fallback = { mode: 'still', time: segment.start + duration * 0.65, windows: [] };
    if (duration < 0.6) return fallback;
    let video = null;
    try {
      video = await videoFor(segment);
      const canvas = document.createElement('canvas');
      canvas.width = 56;
      canvas.height = 32;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const length = clamp(duration * 0.18, 0.55, 1.25);
      const gap = Math.min(0.3, length * 0.45);
      const candidates = [];
      const count = duration > 8 ? 8 : 6;
      for (let i = 0; i < count; i += 1) {
        const ratio = 0.12 + (i / Math.max(1, count - 1)) * 0.72;
        const start = clamp(segment.start + duration * ratio, segment.start, Math.max(segment.start, segment.end - length));
        const a = await pixels(video, start, canvas, ctx);
        const b = await pixels(video, Math.min(segment.end - 0.03, start + gap), canvas, ctx);
        candidates.push({ start, end: Math.min(segment.end, start + length), score: frameDiff(a, b) });
      }
      candidates.sort((a, b) => a.score - b.score);
      const calm = candidates.filter((item) => item.score <= 11.5).slice(0, 2);
      const best = candidates[0];
      const result = calm.length
        ? { mode: 'loop', time: best.start + Math.min(length / 2, 0.35), windows: calm }
        : { mode: 'still', time: best.start + Math.min(length / 2, 0.35), windows: [] };
      plans.set(segment.id, result);
      return result;
    } catch (error) {
      console.warn('Réaction calme indisponible', error);
      plans.set(segment.id, fallback);
      return fallback;
    } finally {
      dispose(video);
    }
  }

  async function analyseAll(segments) {
    const result = new Map();
    const unique = [...new Map(segments.map((segment) => [segment.id, segment])).values()];
    for (let i = 0; i < unique.length; i += 1) {
      els.exportStatus.textContent = `Analyse avant export ${i + 1}/${unique.length}…`;
      els.exportProgress.value = Math.round(((i + 1) / unique.length) * 8);
      els.exportPercent.textContent = `${Math.round(((i + 1) / unique.length) * 8)}%`;
      result.set(unique[i].id, await planFor(unique[i]));
    }
    return result;
  }

  async function reactionFor(segment, plan) {
    const video = await videoFor(segment);
    video.muted = true;
    video.volume = 0;
    let index = 0;
    if (plan.mode === 'loop' && plan.windows.length) await seekVideo(video, plan.windows[0].start);
    else await seekVideo(video, plan.time);
    video.pause();
    return {
      video,
      async start() {
        if (plan.mode === 'loop' && plan.windows.length) await video.play().catch(() => {});
      },
      async update() {
        if (plan.mode !== 'loop' || !plan.windows.length) return;
        const window = plan.windows[index];
        if (video.currentTime < window.end - 0.03 && !video.ended) return;
        index = (index + 1) % plan.windows.length;
        await seekVideo(video, plan.windows[index].start);
        await video.play().catch(() => {});
      },
      dispose() { dispose(video); }
    };
  }

  function drawRect(ctx, video, rect, segment, dim, t) {
    const rotation = ((Number(segment.rotation || 0) % 360) + 360) % 360;
    const sideways = rotation === 90 || rotation === 270;
    const sw = video.videoWidth || rect.width;
    const sh = video.videoHeight || rect.height;
    const aw = sideways ? rect.height : rect.width;
    const ah = sideways ? rect.width : rect.height;
    const contain = segment.fit === 'contain';
    const scale = contain ? Math.min(aw / sw, ah / sh) : Math.max(aw / sw, ah / sh);
    const zoom = 1.01 + Math.sin(t * 0.55) * 0.006;
    const dw = sw * scale * zoom;
    const dh = sh * scale * zoom;
    const px = Math.sin(t * 0.38) * rect.width * 0.006;
    const py = Math.cos(t * 0.31) * rect.height * 0.004;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.translate(rect.x + rect.width / 2 + px, rect.y + rect.height / 2 + py);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    if (dim) {
      ctx.fillStyle = `rgba(0,0,0,${dim})`;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  }

  function drawPhase(phase, local) {
    const { ctx, width, height, active, activeSegment, reaction, reactionSegment, side } = phase;
    const half = Math.floor(width / 2);
    const left = { x: 0, y: 0, width: half, height };
    const right = { x: half, y: 0, width: width - half, height };
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    if (!reaction) drawRect(ctx, active, { x: 0, y: 0, width, height }, activeSegment, 0, local);
    else if (side === 'left') {
      drawRect(ctx, active, left, activeSegment, 0, local);
      drawRect(ctx, reaction.video, right, reactionSegment, 0.15, local + 1.2);
    } else {
      drawRect(ctx, reaction.video, left, reactionSegment, 0.15, local + 1.2);
      drawRect(ctx, active, right, activeSegment, 0, local);
    }
    if (reaction) {
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.fillRect(half - 1, 0, 2, height);
    }
  }

  async function prepare(spec, reactionPlans, env, completed, total) {
    const active = await videoFor(spec.active);
    active.muted = false;
    active.volume = 1;
    const reaction = spec.reaction ? await reactionFor(spec.reaction, reactionPlans.get(spec.reaction.id)) : null;
    const source = env.audio.createMediaElementSource(active);
    const gain = env.audio.createGain();
    gain.gain.value = spec.active.muted ? 0 : clamp(spec.active.volume ?? 1, 0, 1.5);
    source.connect(gain).connect(env.destination);
    await seekVideo(active, spec.active.start);
    active.pause();
    return { ...env, active, activeSegment: spec.active, reaction, reactionSegment: spec.reaction, side: spec.side, source, gain, completed, total, length: Math.max(0.01, segmentDuration(spec.active)) };
  }

  async function runPhase(phase) {
    let busy = false;
    let last = -1;
    drawPhase(phase, 0);
    await Promise.all([phase.reaction?.start() || Promise.resolve(), phase.active.play()]);
    await new Promise((resolve) => {
      const render = () => {
        const local = clamp(phase.active.currentTime - phase.activeSegment.start, 0, phase.length);
        drawPhase(phase, local);
        if (phase.reaction && !busy) {
          busy = true;
          phase.reaction.update().finally(() => { busy = false; });
        }
        const progress = Math.min(99, Math.round(((phase.completed + local) / phase.total) * 100));
        if (progress !== last) {
          last = progress;
          els.exportProgress.value = progress;
          els.exportPercent.textContent = `${progress}%`;
        }
        if (phase.active.currentTime >= phase.activeSegment.end - 0.018 || phase.active.ended) {
          phase.active.pause();
          drawPhase(phase, phase.length);
          resolve();
        } else scheduleVideoFrame(phase.active, render);
      };
      scheduleVideoFrame(phase.active, render);
    });
    return phase.length;
  }

  function disposePhase(phase) {
    if (!phase) return;
    phase.source?.disconnect();
    phase.gain?.disconnect();
    phase.reaction?.dispose();
    dispose(phase.active);
  }

  function phaseSpecs(segments) {
    const result = [];
    const pairCount = Math.ceil(segments.length / 2);
    for (let i = 0; i < segments.length; i += 2) {
      const left = segments[i];
      const right = segments[i + 1] || null;
      const pair = Math.floor(i / 2) + 1;
      result.push({ active: left, reaction: right, side: 'left', pair, pairCount, label: 'gauche' });
      if (right) result.push({ active: right, reaction: left, side: 'right', pair, pairCount, label: 'droit' });
    }
    return result;
  }

  function recorderEvent(recorder, event, timeout = 350) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        recorder.removeEventListener(event, finish);
        resolve();
      };
      const timer = setTimeout(finish, timeout);
      recorder.addEventListener(event, finish, { once: true });
    });
  }

  async function pauseRecorder(recorder) {
    if (recorder.state !== 'recording') return;
    const event = recorderEvent(recorder, 'pause');
    recorder.pause();
    if (recorder.state !== 'paused') await event;
  }

  async function resumeRecorder(recorder) {
    if (recorder.state !== 'paused') return;
    const event = recorderEvent(recorder, 'resume');
    recorder.resume();
    if (recorder.state !== 'recording') await event;
  }

  async function exportSynchronizedMode2() {
    if (running) return;
    const segments = state.timelineSegments.filter((segment) => segmentDuration(segment) > 0.04);
    if (segments.length < 2) return showToast('Le Mode 2 nécessite au moins deux clips.');
    running = true;
    stopTimelinePreview(true);
    els.exportBtn.disabled = true;
    els.exportOverlay.classList.remove('hidden');
    els.exportStatus.textContent = 'Analyse avant export synchronisé…';
    els.exportProgress.value = 0;
    els.exportPercent.textContent = '0%';
    let env = null;
    let recorder = null;
    let phase = null;
    let nextPromise = null;
    try {
      const audio = new AudioContext({ latencyHint: 'playback' });
      await audio.resume();
      const reactionPlans = await analyseAll(segments);
      const { width, height } = outputDimensions();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      const stream = canvas.captureStream(30);
      const destination = audio.createMediaStreamDestination();
      const mixed = new MediaStream([...stream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      const mime = exportMime();
      recorder = new MediaRecorder(mixed, mime.type ? { mimeType: mime.type, videoBitsPerSecond: 15_000_000, audioBitsPerSecond: 192_000 } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      env = { audio, destination, stream, ctx, width, height, mime };
      const specs = phaseSpecs(segments);
      const total = segments.reduce((sum, segment) => sum + segmentDuration(segment), 0);
      let completed = 0;
      const make = (spec, before) => prepare(spec, reactionPlans, env, before, total);
      phase = await make(specs[0], completed);
      drawPhase(phase, 0);
      recorder.start(500);
      if (specs[1]) nextPromise = make(specs[1], phase.length);
      for (let i = 0; i < specs.length; i += 1) {
        const spec = specs[i];
        if (i > 0) {
          phase = nextPromise ? await nextPromise : await make(spec, completed);
          drawPhase(phase, 0);
          await resumeRecorder(recorder);
        }
        els.exportStatus.textContent = `Mode 2 synchronisé · duo ${spec.pair}/${spec.pairCount} · côté ${spec.label}`;
        if (specs[i + 1]) nextPromise = make(specs[i + 1], completed + phase.length);
        else nextPromise = null;
        completed += await runPhase(phase);
        if (i < specs.length - 1) await pauseRecorder(recorder);
        disposePhase(phase);
        phase = null;
      }
      if (recorder.state === 'paused') await resumeRecorder(recorder);
      recorder.stop();
      await stopped;
      const output = new Blob(chunks, { type: env.mime.type || 'video/webm' });
      const url = URL.createObjectURL(output);
      const link = document.createElement('a');
      link.href = url;
      link.download = `remix-studio-mode2-synchronise-1080p-${new Date().toISOString().replace(/[:.]/g, '-')}.${env.mime.ext}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      els.exportProgress.value = 100;
      els.exportPercent.textContent = '100%';
      els.exportStatus.textContent = 'Interview synchronisée 1080p prête';
      showToast('Mode 2 terminé : les temps de préparation ont été supprimés.');
      await sleep(900);
    } catch (error) {
      console.error(error);
      if (recorder?.state && recorder.state !== 'inactive') recorder.stop();
      showToast(error.message || 'Le Mode 2 synchronisé a échoué.');
      await sleep(1000);
    } finally {
      disposePhase(phase);
      nextPromise?.then(disposePhase).catch(() => {});
      env?.stream.getTracks().forEach((track) => track.stop());
      env?.destination.stream.getTracks().forEach((track) => track.stop());
      await env?.audio.close().catch(() => {});
      els.exportOverlay.classList.add('hidden');
      els.exportBtn.disabled = !state.timelineSegments.length;
      running = false;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.export-mode-choice.podcast');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelector('.export-mode-overlay')?.remove();
    exportSynchronizedMode2();
  }, true);

  document.documentElement.dataset.remixMode2Sync = VERSION;
})();
