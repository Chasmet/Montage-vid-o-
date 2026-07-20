'use strict';

(() => {
  const VERSION = '2.8.1';
  const FALLBACK_CALLBACK_MS = 90;
  const STALL_DETECTION_MS = 850;
  const STALL_KICK_INTERVAL_MS = 650;
  const playbackStates = new WeakMap();
  let wakeLock = null;

  if (typeof scheduleVideoFrame !== 'function') return;

  function playbackState(video, now) {
    let item = playbackStates.get(video);
    if (!item) {
      item = {
        lastMediaTime: Number(video.currentTime) || 0,
        lastAdvanceAt: now,
        lastKickAt: 0
      };
      playbackStates.set(video, item);
    }
    return item;
  }

  function keepPlaybackMoving(video, now) {
    const item = playbackState(video, now);
    const current = Number(video.currentTime) || 0;

    if (video.paused || video.ended || video.seeking) {
      item.lastMediaTime = current;
      item.lastAdvanceAt = now;
      return;
    }

    if (Math.abs(current - item.lastMediaTime) >= 0.006) {
      item.lastMediaTime = current;
      item.lastAdvanceAt = now;
      return;
    }

    const stalledFor = now - item.lastAdvanceAt;
    if (stalledFor < STALL_DETECTION_MS || now - item.lastKickAt < STALL_KICK_INTERVAL_MS) return;

    const duration = Number(video.duration);
    const hasFiniteDuration = Number.isFinite(duration) && duration > 0;
    const remaining = hasFiniteDuration ? Math.max(0, duration - current) : Infinity;
    const step = remaining <= 0.4
      ? remaining
      : Math.min(0.8, Math.max(0.18, stalledFor / 1400));
    const target = hasFiniteDuration
      ? Math.min(duration, current + step)
      : current + step;

    item.lastKickAt = now;
    item.lastAdvanceAt = now;

    try {
      if (target > current + 0.001) video.currentTime = target;
      video.play?.().catch?.(() => {});
    } catch (error) {
      console.warn('Relance vidéo impossible pendant l’export', error);
    }
  }

  scheduleVideoFrame = function scheduleVideoFrameWithWatchdog(video, callback) {
    let finished = false;
    let videoFrameId = null;
    let animationFrameId = null;
    let timeoutId = null;

    const finish = (stamp = performance.now()) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      if (animationFrameId != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameId);
      }
      if (videoFrameId != null && typeof video.cancelVideoFrameCallback === 'function') {
        try { video.cancelVideoFrameCallback(videoFrameId); } catch { /* déjà terminé */ }
      }
      keepPlaybackMoving(video, performance.now());
      callback(stamp);
    };

    if (typeof video.requestVideoFrameCallback === 'function') {
      try {
        videoFrameId = video.requestVideoFrameCallback((stamp) => finish(stamp));
        timeoutId = setTimeout(() => finish(performance.now()), FALLBACK_CALLBACK_MS);
      } catch {
        animationFrameId = requestAnimationFrame((stamp) => finish(stamp));
      }
    } else {
      animationFrameId = requestAnimationFrame((stamp) => finish(stamp));
      timeoutId = setTimeout(() => finish(performance.now()), FALLBACK_CALLBACK_MS);
    }

    return videoFrameId ?? animationFrameId ?? timeoutId;
  };

  async function acquireWakeLock() {
    if (!navigator?.wakeLock?.request || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
    } catch (error) {
      console.debug('Verrouillage écran indisponible', error);
    }
  }

  async function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    try { await lock?.release?.(); } catch { /* déjà libéré */ }
  }

  function exportIsVisible() {
    return Boolean(els?.exportOverlay && !els.exportOverlay.classList.contains('hidden'));
  }

  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    const startObserver = () => {
      if (!els?.exportOverlay) return;
      const observer = new MutationObserver(() => {
        if (exportIsVisible()) acquireWakeLock();
        else releaseWakeLock();
      });
      observer.observe(els.exportOverlay, { attributes: true, attributeFilter: ['class'] });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && exportIsVisible()) acquireWakeLock();
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    else startObserver();
  }

  document?.documentElement?.setAttribute('data-remix-export-watchdog', VERSION);
})();
