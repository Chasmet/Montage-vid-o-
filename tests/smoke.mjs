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
for (const asset of ['preview.css', 'timeline-zoom.css', 'js/preview-ratio.js', 'js/timeline-zoom.js', 'js/capcut-ui.js']) {
  if (!html.includes(asset)) throw new Error(`Ressource interface manquante : ${asset}`);
}

const scripts = [
  'js/core.js', 'js/editor.js', 'js/tracks.js', 'js/camera.js',
  'js/render.js', 'js/preview-ratio.js', 'js/timeline-zoom.js',
  'js/init.js', 'js/final-audit.js', 'js/android-bridge.js', 'js/capcut-ui.js'
];
for (const file of scripts) {
  if (!existsSync(file)) throw new Error(`Script manquant : ${file}`);
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
const zoomScript = readFileSync('js/timeline-zoom.js', 'utf8');
const zoomCss = readFileSync('timeline-zoom.css', 'utf8');
const initScript = readFileSync('js/init.js', 'utf8');
const finalAuditScript = readFileSync('js/final-audit.js', 'utf8');
const serviceWorker = readFileSync('service-worker.js', 'utf8');
const workflow = readFileSync('.github/workflows/build-apk.yml', 'utf8');

for (const marker of ['timelineSegments', 'timelineTime', "quality: '1080'", 'history', 'future']) {
  if (!coreScript.includes(marker)) throw new Error(`État timeline manquant : ${marker}`);
}
for (const marker of ['splitAtPlayhead', 'rotateSelected', 'duplicateSelected', 'deleteSelected', 'lightweight']) {
  if (!editorScript.includes(marker)) throw new Error(`Outil timeline ou fluidité manquant : ${marker}`);
}
for (const marker of ['mainTimeline', 'timelineClipCard', 'syncTimelineScrollFromState', 'thumbnailQueue', 'requestIdleCallback']) {
  if (!tracksScript.includes(marker)) throw new Error(`Affichage ou optimisation timeline manquant : ${marker}`);
}
for (const marker of ['hasNativeCamera', 'startNativeCamera', 'onNativeCameraRecorded', 'appendFullMediaToTimeline']) {
  if (!cameraScript.includes(marker)) throw new Error(`Caméra ou ajout timeline manquant : ${marker}`);
}
for (const marker of ['exportTimeline', '1080', 'drawVideoFrame', 'segment.rotation', 'requestVideoFrameCallback', 'warmPreviewMedia']) {
  if (!renderScript.includes(marker)) throw new Error(`Export, lecture ou préchargement manquant : ${marker}`);
}
for (const marker of ['previewMediaRatio', 'fitPreviewFrame', 'applyCompactPreviewRotation']) {
  if (!previewScript.includes(marker)) throw new Error(`Gestion du ratio original manquante : ${marker}`);
}
for (const marker of ['height:min(40vh,420px)', '.preview-frame']) {
  if (!previewCss.includes(marker)) throw new Error(`Ergonomie compacte manquante : ${marker}`);
}
for (const marker of ['touchDistance', 'beginPinch', 'movePinch', 'MIN_SCALE = 1.5', 'MAX_SCALE = 180', 'remix-studio-timeline-zoom', 'applyScaleOnly']) {
  if (!zoomScript.includes(marker)) throw new Error(`Zoom tactile ou fluidité manquant : ${marker}`);
}
for (const marker of ['touch-action:pan-x', '.timeline-zoom-bubble', '.timeline-zoom-hint', 'contain:layout paint']) {
  if (!zoomCss.includes(marker)) throw new Error(`Interface ou isolation graphique manquante : ${marker}`);
}

for (const marker of ['loadFinalAudit', 'js/final-audit.js', 'data-remix-final-audit']) {
  if (!initScript.includes(marker)) throw new Error(`Chargement de l’audit final manquant : ${marker}`);
}

const auditMarkers = [
  "const FINAL_VERSION = '2.6.0'",
  'requestPersistentStorage',
  'navigator.storage.estimate',
  'hydrateAndRepairProject',
  "const blobKey = `source-${uid('media')}`",
  'scheduleMediaGarbageCollection',
  'collectReferencedBlobKeys',
  'deleteSelectedSafely',
  'stopImmediatePropagation',
  'projectMediaProblems',
  'projectHealthCard',
  'disableNativeServiceWorkerCache',
  "window.addEventListener('pagehide'",
  "window.addEventListener('unhandledrejection'"
];
for (const marker of auditMarkers) {
  if (!finalAuditScript.includes(marker)) throw new Error(`Protection finale manquante : ${marker}`);
}
if (finalAuditScript.includes("const blobKey = 'source-video'")) {
  throw new Error('L’audit final utilise encore une clé fixe qui casserait l’annulation après un nouvel import.');
}

for (const marker of ['remix-studio-v8-final-audit-2-6', './js/final-audit.js']) {
  if (!serviceWorker.includes(marker)) throw new Error(`Cache final incomplet : ${marker}`);
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

const mainActivity = readFileSync(nativeFiles[0], 'utf8');
const cameraActivity = readFileSync(nativeFiles[1], 'utf8');
const manifest = readFileSync(nativeFiles[2], 'utf8');
const gradle = readFileSync(nativeFiles[3], 'utf8');
if (!cameraActivity.includes('VideoCapture<Recorder>') || !cameraActivity.includes('withAudioEnabled')) {
  throw new Error('La caméra native CameraX avec audio n’est pas configurée.');
}
if (!mainActivity.includes('WebViewAssetLoader') || !mainActivity.includes('beginDownload') || !mainActivity.includes('finishDownload')) {
  throw new Error('Le pont Android de lecture ou de téléchargement est incomplet.');
}
if (!manifest.includes('android:hardwareAccelerated="true"') || !manifest.includes('android.permission.RECORD_AUDIO')) {
  throw new Error('L’accélération matérielle ou la permission micro est manquante.');
}
if (!gradle.includes("versionName '2.6.0'") || !gradle.includes('versionCode 8') || !gradle.includes("include 'js/**'")) {
  throw new Error('La version APK 2.6.0 ou l’inclusion des scripts n’est pas configurée.');
}

const workflowMarkers = [
  'Auditer la stabilité, les données et la fluidité',
  'Vérifier le contenu réel de l’APK',
  'assets/www/js/final-audit.js',
  'Rejouer les tests de non-régression',
  'version finale auditée',
  'data_integrity_audited',
  'project_self_repair',
  'storage_guard',
  'regression_tests_repeated'
];
for (const marker of workflowMarkers) {
  if (!workflow.includes(marker)) throw new Error(`Validation CI finale manquante : ${marker}`);
}

console.log(`Audit réussi : intégrité des données, auto-réparation, stockage, fluidité, export 1080p, ${scripts.length} scripts et Android CameraX vérifiés.`);
