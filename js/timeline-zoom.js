'use strict';

(() => {
  const DEFAULT_SCALE = 46;
  const MIN_SCALE = 1.5;
  const MAX_SCALE = 180;
  const STORAGE_KEY = 'remix-studio-timeline-zoom';
  const RULER_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];

  let timelineZoomScale = clamp(Number(safeStorage.get(STORAGE_KEY)) || DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
  let internalScroll = false;
  let legacyScrollRelease = null;
  let zoomFrame = null;
  let pendingScale = timelineZoomScale;
  let hideBubbleTimer = null;

  const pinch = {
    active: false,
    startDistance: 0,
    startScale: timelineZoomScale,
    timelineTime: 0
  };

  const shell = els.timelineScroll?.closest('.timeline-shell');
  const bubble = document.createElement('div');
  bubble.id = 'timelineZoomBubble';
  bubble.className = 'timeline-zoom-bubble';
  bubble.setAttribute('role', 'status');
  shell?.append(bubble);

  const hint = document.createElement('span');
  hint.id = 'timelineZoomHint';
  hint.className = 'timeline-zoom-hint';
  hint.textContent = 'Pince à 2 doigts';
  els.timelinePositionLabel?.insertAdjacentElement('afterend', hint);

  function zoomPercent() {
    return Math.round((timelineZoomScale / DEFAULT_SCALE) * 100);
  }

  function updateZoomIndicator(visible = false) {
    bubble.textContent = `Timeline ${zoomPercent()} %`;
    hint.textContent = `Zoom ${zoomPercent()} %`;
    shell?.classList.toggle('timeline-zooming', visible);
    clearTimeout(hideBubbleTimer);
    if (visible) {
      hideBubbleTimer = setTimeout(() => shell?.classList.remove('timeline-zooming'), 650);
    }
  }

  function rulerStep(total) {
    const minimumSecondsForSpacing = 68 / Math.max(MIN_SCALE, timelineZoomScale);
    const minimumSecondsForLimit = total / 320;
    const target = Math.max(minimumSecondsForSpacing, minimumSecondsForLimit);
    return RULER_STEPS.find((step) => step >= target) || RULER_STEPS.at(-1);
  }

  function setInternalScroll(time) {
    if (!els.timelineScroll) return;
    internalScroll = true;
    timelineScrollSync = true;
    els.timelineScroll.scrollLeft = clamp(time, 0, timelineDuration()) * timelineZoomScale;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      internalScroll = false;
      timelineScrollSync = false;
    }));
  }

  function applyTimelineZoomLayout(preserveTime = state.timelineTime) {
    const total = timelineDuration();
    const width = Math.max(1, total * timelineZoomScale);

    els.mainTimeline.style.width = `${width}px`;
    if (els.mainTimeline.parentElement) {
      els.mainTimeline.parentElement.style.width = `${Math.max(width, state.timelineSegments.length ? width : 280)}px`;
    }

    $$('.timeline-clip').forEach((card) => {
      const duration = Number(card.dataset.duration) || 0;
      card.style.width = `${Math.max(3, duration * timelineZoomScale)}px`;
    });

    renderRuler(total);
    setInternalScroll(preserveTime);
    updateZoomIndicator(pinch.active);
  }

  const baseTimelineClipCard = timelineClipCard;
  timelineClipCard = function zoomableTimelineClipCard(item) {
    const card = baseTimelineClipCard(item);
    const duration = segmentDuration(item);
    card.dataset.duration = String(duration);
    card.style.width = `${Math.max(3, duration * timelineZoomScale)}px`;
    return card;
  };

  renderRuler = function zoomableRenderRuler(total) {
    els.timelineRuler.innerHTML = '';
    const width = Math.max(1, total * timelineZoomScale);
    els.timelineRuler.style.width = `${width}px`;
    const step = rulerStep(total);
    const max = Math.ceil(total / step) * step;

    for (let time = 0; time <= max + 0.0001; time += step) {
      const tick = document.createElement('span');
      tick.className = 'ruler-tick';
      tick.style.left = `${time * timelineZoomScale}px`;
      tick.textContent = formatTime(time);
      els.timelineRuler.append(tick);
    }
  };

  const baseRenderTimeline = renderTimeline;
  renderTimeline = function zoomableRenderTimeline() {
    baseRenderTimeline();
    applyTimelineZoomLayout(state.timelineTime);
  };

  syncTimelineScrollFromState = function zoomableSyncTimelineScrollFromState() {
    setInternalScroll(state.timelineTime);
  };

  function touchDistance(touches) {
    const first = touches[0];
    const second = touches[1];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  }

  function beginPinch(event) {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    stopTimelinePreview(true);
    pinch.active = true;
    pinch.startDistance = Math.max(1, touchDistance(event.touches));
    pinch.startScale = timelineZoomScale;
    pinch.timelineTime = state.timelineTime;
    pendingScale = timelineZoomScale;
    shell?.classList.add('timeline-zooming');
    navigator.vibrate?.(8);
    updateZoomIndicator(true);
  }

  function movePinch(event) {
    if (!pinch.active || event.touches.length !== 2) return;
    event.preventDefault();
    const distance = Math.max(1, touchDistance(event.touches));
    pendingScale = clamp(pinch.startScale * (distance / pinch.startDistance), MIN_SCALE, MAX_SCALE);
    if (zoomFrame) return;

    zoomFrame = requestAnimationFrame(() => {
      timelineZoomScale = pendingScale;
      applyTimelineZoomLayout(pinch.timelineTime);
      zoomFrame = null;
    });
  }

  function endPinch(event) {
    if (!pinch.active || event.touches.length >= 2) return;
    pinch.active = false;
    if (zoomFrame) {
      cancelAnimationFrame(zoomFrame);
      zoomFrame = null;
      timelineZoomScale = pendingScale;
      applyTimelineZoomLayout(pinch.timelineTime);
    }
    safeStorage.set(STORAGE_KEY, String(timelineZoomScale));
    updateZoomIndicator(true);
    navigator.vibrate?.(6);
  }

  function suppressLegacyScrollListener() {
    timelineScrollSync = true;
    clearTimeout(legacyScrollRelease);
    legacyScrollRelease = setTimeout(() => {
      if (!internalScroll && !pinch.active) timelineScrollSync = false;
    }, 0);
  }

  function handleTimelineScroll() {
    if (internalScroll || pinch.active) {
      timelineScrollSync = true;
      return;
    }

    suppressLegacyScrollListener();
    const time = clamp(els.timelineScroll.scrollLeft / timelineZoomScale, 0, timelineDuration());
    state.timelineTime = time;
    updateProjectLabels();
    clearTimeout(timelineSeekTimer);
    timelineSeekTimer = setTimeout(() => {
      setTimelineTime(time, { preview: true, syncScroll: false, select: true, force: false });
    }, 55);
  }

  els.timelineScroll.addEventListener('touchstart', beginPinch, { passive: false });
  els.timelineScroll.addEventListener('touchmove', movePinch, { passive: false });
  els.timelineScroll.addEventListener('touchend', endPinch, { passive: false });
  els.timelineScroll.addEventListener('touchcancel', endPinch, { passive: false });
  els.timelineScroll.addEventListener('scroll', handleTimelineScroll, { passive: true });

  els.timelineScroll.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    stopTimelinePreview(true);
    timelineZoomScale = clamp(timelineZoomScale * (event.deltaY > 0 ? 0.88 : 1.12), MIN_SCALE, MAX_SCALE);
    applyTimelineZoomLayout(state.timelineTime);
    safeStorage.set(STORAGE_KEY, String(timelineZoomScale));
    updateZoomIndicator(true);
  }, { passive: false });

  updateZoomIndicator(false);
})();
