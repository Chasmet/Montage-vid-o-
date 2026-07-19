import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync('index.html', 'utf8');
const requiredIds = [
  'saveStatus', 'undoBtn', 'redoBtn', 'previewTitle', 'projectDurationLabel',
  'stage', 'previewFrame', 'mainVideo', 'cameraPreview', 'referencePreview', 'emptyStage',
  'recordBadge', 'countdown', 'fullscreenBtn', 'jumpStartBtn', 'playBtn',
  'jumpEndBtn', 'currentTime', 'durationTime', 'selectedClipLabel', 'videoInput',
  'quickCameraBtn', 'fitTimelineBtn', 'timelineScroll', 'timelineRuler',
  'mainTimeline', 'timelinePositionLabel', 'timelineClipCount', 'splitBtn',
  'volumeToolBtn', 'rotateBtn', 'duplicateBtn', 'deleteClipBtn', 'projectToolBtn',
  'volumeSheet', 'cameraSheet', 'projectSheet', 'inspectorTitle', 'volumeRange',
  'fitSelect', 'muteToggle', 'cameraOrientation', 'cameraSelect', 'micSelect',
  'countdownSelect', 'referenceToggle', 'noiseToggle', 'cameraBtn', 'recordBtn',
  'stopRecordBtn', 'outputAspect', 'clearProjectBtn', 'exportBtn', 'exportOverlay',
  'exportStatus', 'exportPercent', 'exportProgress', 'toast'
];

const missing = requiredIds.filter((id) => !html.includes(`id="${id}"`));
if (missing.length) throw new Error(`Éléments HTML manquants : ${missing.join(', ')}`);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Identifiants HTML en double : ${[...new Set(duplicates)].join(', ')}`);

for (const oldId of ['sourceTrack', 'cameraTrack', 'finalTrack', 'addSelectedToFinalBtn', 'keepSourceBtn']) {
  if (html.includes(`id="${oldId}"`)) throw new Error(`Ancienne interface encore présente : ${oldId}`);
}
for (const asset of ['preview.css', 'js/preview-ratio.js', 'js/capcut-ui.js']) {
  if (!html.includes(asset)) throw new Error(`Ressource interface manquante : ${asset}`);
}

const scripts = [
  'js/core.js', 'js/editor.js', 'js/tracks.js', 'js/camera.js',
  'js/render.js', 'js/preview-ratio.js', 'js/init.js', 'js/android-bridge.js', 'js/capcut-ui.js'
];
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Erreur JavaScript dans ${file}\n${result.stderr}`);
}

const coreScript = readFileSync('js/core.js', 'utf8');
const editorScript = readFileSync('js/editor.js', 'utf8');
const tracksScript = readFileSync('js/tracks.js', 'utf8');
const cameraScript = readFileSync('js/camera.js', 'utf8');
const renderScript = readFileSync('js/render.js', 'utf8');
const previewScript = readFileSync('js/preview-ratio.js', 'utf8');
const previewCss = readFileSync('preview.css', 'utf8');

for (const marker of ['timelineSegments', 'timelineTime', "quality: '1080'"]) {
  if (!coreScript.includes(marker)) throw new Error(`État timeline manquant : ${marker}`);
}
for (const marker of ['splitAtPlayhead', 'rotateSelected', 'duplicateSelected', 'deleteSelected']) {
  if (!editorScript.includes(`function ${marker}`)) throw new Error(`Outil timeline manquant : ${marker}`);
}
for (const marker of ['mainTimeline', 'timelineClipCard', 'syncTimelineScrollFromState']) {
  if (!tracksScript.includes(marker)) throw new Error(`Affichage timeline manquant : ${marker}`);
}
for (const marker of ['hasNativeCamera', 'startNativeCamera', 'onNativeCameraRecorded', 'appendFullMediaToTimeline']) {
  if (!cameraScript.includes(marker)) throw new Error(`Caméra ou ajout timeline manquant : ${marker}`);
}
for (const marker of ['exportTimeline', '1080', 'drawVideoFrame', 'segment.rotation']) {
  if (!renderScript.includes(marker)) throw new Error(`Export 1080p ou rotation manquant : ${marker}`);
}
for (const marker of ['previewMediaRatio', 'fitPreviewFrame', 'applyCompactPreviewRotation']) {
  if (!previewScript.includes(marker)) throw new Error(`Gestion du ratio original manquante : ${marker}`);
}
for (const marker of ['height:min(40vh,420px)', '.preview-frame']) {
  if (!previewCss.includes(marker)) throw new Error(`Ergonomie compacte manquante : ${marker}`);
}

const nativeFiles = [
  'app/src/main/java/com/chasmet/remixstudio/MainActivity.java',
  'app/src/main/java/com/chasmet/remixstudio/NativeCameraActivity.java',
  'app/src/main/AndroidManifest.xml',
  'app/build.gradle'
];
for (const file of nativeFiles) {
  if (!existsSync(file)) throw new Error(`Fichier Android natif manquant : ${file}`);
}

const activity = readFileSync(nativeFiles[1], 'utf8');
if (!activity.includes('VideoCapture<Recorder>') || !activity.includes('withAudioEnabled')) {
  throw new Error('La caméra native CameraX avec audio n’est pas configurée.');
}

const gradle = readFileSync('app/build.gradle', 'utf8');
if (!gradle.includes("versionName '2.3.0'") || !gradle.includes('versionCode 5') || !gradle.includes("include 'preview.css'")) {
  throw new Error('La version APK 2.3.0 et le nouvel aperçu ne sont pas configurés.');
}

console.log(`Validation réussie : aperçu compact au ratio original, timeline unique, ${scripts.length} scripts et caméra Android native vérifiés.`);
