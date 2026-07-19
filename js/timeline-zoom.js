'use strict';

(() => {
  const DEFAULT_SCALE = 46;
  const MIN_SCALE = 1.5;
  const MAX_SCALE = 180;
  const STORAGE_KEY = 'remix-studio-timeline-zoom';
  const RULER_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];
  const SCRUB_PREVIEW_DELAY = 82;

  let timelineZoomScale = clamp(Number(safeStorage.get(STORAGE_KEY)) || DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
  let internalScroll = false;
  let zoomFrame = null;
  let scrollFrame = null;
  let pendingScale = timelineZoomScale;
  let pendingScrollTime = 0;
  let hideBubbleTimer = null;
  let lastDisplayedPercent = -1;
  let zoomCards = [];

  const pinch = {
    active: false,
    moved: false,
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
    const percent = zoomPercent();
    if (percent !== lastDisplayedPercent) {
      bubble.textContent = `Timeline ${percent} %`;
      hint.textContent = `Zoom ${percent} %`;
      lastDisplayedPercent = percent;
    }
    shell?.classList.toggle('timeline-zooming', visible);
    clearTimeout(hideBubbleTimer);
    if (visible && !pinch.active) {
      hideBubbleTimer = setTimeout(() => shell?.classList.remove('timeline-zooming'), 600);
    }
  }

  function rulerStep(total) {
    const minimumSecondsForSpacing = 72 / Math.max(MIN_SCALE, timelineZoomScale);
    const minimumSecondsForLimit = total / 260;
    const target = Math.max(minimumSecondsForSpacing, minimumSecondsForLimit);
    return RULER_STEPS.find((step) => step >= target) || RULER_STEPS.at(-1);
  }

  function setInternalScroll(time) {
    if (!els.timelineScroll) return;
    internalScroll = true;
    timelineScrollSync = true;
    const target = clamp(time, 0, timelineDuration()) * timelineZoomScale;
    if (Math.abs(els.timelineScroll.scrollLeft - target) > 0.5) {
      els.timelineScroll.scrollLeft = target;
    }
    requestAnimationFrame(() => {
      internalScroll = false;
      timelineScrollSync = false;
    });
  }

  function cacheZoomCards() {
    zoomCards = $$('.timeline-clip').map((card) => ({
      card,
      duration: Number(card.dataset.duration) || 0
    }));
  }

  function applyTimelineZoomLayout(preserveTime = state.timelineTime, refreshRuler = false) {
    const total = timelineDuration();
    const width = Math.max(1, total * timelineZoomScale);

    els.mainTimeline.style.width = `${width}px`;
    if (els.mainTimeline.parentElement) {
      els.mainTimeline.parentElement.style.width = `${Math.max(width, state.timelineSegments.length ? width : 280)}px`;
    }

    if (!zoomCards.length) cacheZoomCards();
    for (const entry of zoomCards) {
      entry.card.style.width = `${Math.max(3, entry.duration * timelineZoomScale)}px`;
    }

    if (refreshRuler) renderRuler(total);
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
    const fragment = document.createDocumentFragment();
    const width = Math.max(1, total * timelineZoomScale);
    const step = rulerStep(total);
    const max = Math.ceil(total / step) * step;

    for (let time = 0; time <= max + 0.0001; time += step) {
      const tick = document.createElement('span');
      tick.className = 'ruler-tick';
      tick.style.left = `${time * timelineZoomScale}px`;
      tick.textContent = formatTime(time);
      fragment.append(tick);
    }

    els.timelineRuler.replaceChildren(fragment);
    els.timelineRuler.style.width = `${width}px`;
  };

  const baseRenderTimeline = renderTimeline;
  renderTimeline = function zoomableRenderTimeline() {
    baseRenderTimeline();
    cacheZoomCards();
    applyTimelineZoomLayout(state.timelineTime, true);
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
    cacheZoomCards();
    pinch.active = true;
    pinch.moved = false;
    pinch.startDistance = Math.max(1, touchDistance(event.touches));
    pinch.startScale = timelineZoomScale;
    pinch.timelineTime = state.timelineTime;
    pendingScale = timelineZoomScale;
    shell?.classList.add('timeline-zooming', 'timeline-interacting');
    navigator.vibrate?.(6);
    updateZoomIndicator(true);
  }

  function movePinch(event) {
    if (!pinch.active || event.touches.length !== 2) return;
    event.preventDefault();
    const distance = Math.max(1, touchDistance(event.touches));
    pendingScale = clamp(pinch.startScale * (distance / pinch.startDistance), MIN_SCALE, MAX_SCALE);
    pinch.moved = pinch.moved || Math.abs(pendingScale - pinch.startScale) > 0.2;
    if (zoomFrame) return;

    zoomFrame = requestAnimationFrame(() => {
      timelineZoomScale = pendingScale;
      // Pendant le geste, on redimensionne uniquement les clips. La règle est reconstruite une seule fois à la fin.
      applyTimelineZoomLayout(pinch.timelineTime, false);
      zoomFrame = null;
    });
  }

  function endPinch(event) {
    if (!pinch.active || event.touches.length >= 2) return;
    pinch.active = false;
    if (zoomFrame) {
      cancelAnimationFrame(zoomFrame);
      zoomFrame = null;
    }
    timelineZoomScale = pendingScale;
    applyTimelineZoomLayout(pinch.timelineTime, true);
    safeStorage.set(STORAGE_KEY, String(timelineZoomScale));
    shell?.classList.remove('timeline-interacting');
    updateZoomIndicator(true);
    if (pinch.moved) navigator.vibrate?.(4);
  }

  function commitScrubPreview(time, force = false) {
    clearTimeout(timelineSeekTimer);
    timelineSeekTimer = setTimeout(() => {
      setTimelineTime(time, {
        preview: true,
        syncScroll: false,
        select: true,
        force,
        lightweight: !force
      });
    }, force ? 18 : SCRUB_PREVIEW_DELAY);
  }

  function handleTimelineScroll() {
    if (internalScroll || pinch.active || isTimelinePreviewing) return;
    pendingScrollTime = clamp(els.timelineScroll.scrollLeft / timelineZoomScale, 0, timelineDuration());
    if (scrollFrame) return;

    scrollFrame = requestAnimationFrame(() => {
      state.timelineTime = pendingScrollTime;
      updateProjectLabels();
      commitScrubPreview(pendingScrollTime, false);
      scrollFrame = null;
    });
  }

  function finalizeScrub() {
    if (pinch.active || internalScroll || isTimelinePreviewing) return;
    const time = clamp(els.timelineScroll.scrollLeft / timelineZoomScale, 0, timelineDuration());
    state.timelineTime = time;
    updateProjectLabels();
    commitScrubPreview(time, true);
  }

  els.timelineScroll.addEventListener('touchstart', beginPinch, { passive: false });
  els.timelineScroll.addEventListener('touchmove', movePinch, { passive: false });
  els.timelineScroll.addEventListener('touchend', (event) => {
    const wasPinching = pinch.active;
    endPinch(event);
    if (!wasPinching) finalizeScrub();
  }, { passive: false });
  els.timelineScroll.addEventListener('touchcancel', endPinch, { passive: false });
  els.timelineScroll.addEventListener('scroll', handleTimelineScroll, { passive: true });

  els.timelineScroll.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    stopTimelinePreview(true);
    timelineZoomScale = clamp(timelineZoomScale * (event.deltaY > 0 ? 0.88 : 1.12), MIN_SCALE, MAX_SCALE);
    cacheZoomCards();
    applyTimelineZoomLayout(state.timelineTime, true);
    safeStorage.set(STORAGE_KEY, String(timelineZoomScale));
    updateZoomIndicator(true);
  }, { passive: false });

  updateZoomIndicator(false);
})();
