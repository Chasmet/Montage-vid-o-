els.previewFrame = document.getElementById('previewFrame');

function previewMediaRatio(media, rotation = 0) {
  let ratio = Number(media?.width) / Math.max(1, Number(media?.height));
  if (!Number.isFinite(ratio) || ratio <= 0) ratio = media?.orientation === 'horizontal' ? 16 / 9 : 9 / 16;
  if (Number(rotation) % 180 !== 0) ratio = 1 / ratio;
  return clamp(ratio, 0.2, 5);
}

function fitPreviewFrame(ratio = 9 / 16) {
  if (!els.stage || !els.previewFrame) return;
  const availableWidth = Math.max(1, els.stage.clientWidth * 0.94);
  const availableHeight = Math.max(1, els.stage.clientHeight * 0.96);
  let width = availableWidth;
  let height = width / ratio;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * ratio;
  }
  els.previewFrame.style.width = `${Math.max(1, Math.round(width))}px`;
  els.previewFrame.style.height = `${Math.max(1, Math.round(height))}px`;
}

setStageOrientation = function setCompactStageOrientation(orientation) {
  fitPreviewFrame(orientation === 'horizontal' ? 16 / 9 : 9 / 16);
};

applyPreviewRotation = function applyCompactPreviewRotation(segment = null) {
  const media = segment ? getMediaByRef(segment.type, segment.mediaId) : null;
  const rotation = Number(segment?.rotation || 0);
  const ratio = previewMediaRatio(media, rotation);
  fitPreviewFrame(ratio);

  const sideways = rotation === 90 || rotation === 270;
  if (sideways) {
    els.mainVideo.style.width = `${els.previewFrame.clientHeight}px`;
    els.mainVideo.style.height = `${els.previewFrame.clientWidth}px`;
  } else {
    els.mainVideo.style.width = '100%';
    els.mainVideo.style.height = '100%';
  }
  els.mainVideo.style.objectFit = segment?.fit || 'contain';
  els.mainVideo.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
};

function refreshCompactPreview() {
  const segment = getSelectedItem();
  if (segment) {
    applyPreviewRotation(segment);
    return;
  }
  const orientation = state.source?.orientation || 'vertical';
  setStageOrientation(orientation);
}

window.addEventListener('resize', refreshCompactPreview);
document.addEventListener('fullscreenchange', () => requestAnimationFrame(refreshCompactPreview));
requestAnimationFrame(() => requestAnimationFrame(refreshCompactPreview));
