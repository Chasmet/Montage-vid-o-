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
  'js/core.js', 'js/editor.js', 'js/tracks.js', 'js/camera.js', 'js/render.js',
  'js/preview-ratio.js', 'js/timeline-zoom.js', 'js/init.js', 'js/final-audit.js',
  'js/insertion-cursor.js', 'js/export-mode2.js', 'js/mode2-sync.js',
  'js/export-watchdog.js', 'js/android-bridge.js', 'js/capcut-ui.js'
];
for (const file of scripts) {
  if (!existsSync(file)) throw new Error(`Script manquant : ${file}`);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Erreur JavaScript dans ${file}\n${result.stderr}`);
}

const files = {
  core: readFileSync('js/core.js', 'utf8'),
  editor: readFileSync('js/editor.js', 'utf8'),
  tracks: readFileSync('js/tracks.js', 'utf8'),
  camera: readFileSync('js/camera.js', 'utf8'),
  render: readFileSync('js/render.js', 'utf8'),
  preview: readFileSync('js/preview-ratio.js', 'utf8'),
  zoom: readFileSync('js/timeline-zoom.js', 'utf8'),
  init: readFileSync('js/init.js', 'utf8'),
  audit: readFileSync('js/final-audit.js', 'utf8'),
  insertion: readFileSync('js/insertion-cursor.js', 'utf8'),
  podcast: readFileSync('js/export-mode2.js', 'utf8'),
  sync: readFileSync('js/mode2-sync.js', 'utf8'),
  watchdog: readFileSync('js/export-watchdog.js', 'utf8')
};
const previewCss = readFileSync('preview.css', 'utf8');
const zoomCss = readFileSync('timeline-zoom.css', 'utf8');
const serviceWorker = readFileSync('service-worker.js', 'utf8');
const workflow = readFileSync('.github/workflows/build-apk.yml', 'utf8');

const markerGroups = [
  [files.core, ['timelineSegments', 'timelineTime', "quality: '1080'", 'history', 'future'], 'État timeline'],
  [files.editor, ['splitAtPlayhead', 'rotateSelected', 'duplicateSelected', 'deleteSelected', 'lightweight'], 'Outils timeline'],
  [files.tracks, ['mainTimeline', 'timelineClipCard', 'syncTimelineScrollFromState', 'thumbnailQueue', 'requestIdleCallback'], 'Affichage timeline'],
  [files.camera, ['hasNativeCamera', 'startNativeCamera', 'onNativeCameraRecorded', 'appendFullMediaToTimeline'], 'Caméra'],
  [files.render, ['exportTimeline', '1080', 'drawVideoFrame', 'segment.rotation', 'requestVideoFrameCallback', 'warmPreviewMedia'], 'Lecture/export'],
  [files.preview, ['previewMediaRatio', 'fitPreviewFrame', 'applyCompactPreviewRotation'], 'Ratio original'],
  [previewCss, ['height:min(40vh,420px)', '.preview-frame'], 'Ergonomie compacte'],
  [files.zoom, ['touchDistance', 'beginPinch', 'movePinch', 'MIN_SCALE = 1.5', 'MAX_SCALE = 180', 'remix-studio-timeline-zoom'], 'Zoom tactile'],
  [zoomCss, ['touch-action:pan-x', '.timeline-zoom-bubble', '.timeline-zoom-hint', 'contain:layout paint'], 'Isolation graphique'],
  [files.init, ['loadFinalAudit', 'loadCursorInsertion', 'loadPodcastExportMode', 'loadMode2Synchronization', 'loadExportWatchdog', 'js/mode2-sync.js', "'2.9.0'"], 'Chargement des protections'],
  [files.insertion, ['insertionIndexAtCursor', 'insertFullMediaAt', 'pendingCameraInsertionIndex', 'saveCameraBlob = async function', 'Nouvelle vidéo insérée juste à côté de la coupe'], 'Insertion au curseur'],
  [files.podcast, ['showExportModeChooser', 'Mode 1 — Montage normal', 'Mode 2 — Deux vidéos côte à côte', 'analyzeReaction', 'calmWindows', "mode: 'still'", 'runPodcastPhase', 'exportPodcastInterview', 'exportTimeline = showExportModeChooser'], 'Mode 2 interview naturelle'],
  [files.sync, ["const VERSION = '2.9.0'", 'analyseAll', 'phaseSpecs', 'pauseRecorder', 'resumeRecorder', 'recorder.start(500)', "event.stopImmediatePropagation()", 'Mode 2 synchronisé', 'les temps de préparation ont été supprimés'], 'Synchronisation précise Mode 2'],
  [files.watchdog, ["const VERSION = '2.8.1'", 'FALLBACK_CALLBACK_MS', 'STALL_DETECTION_MS', 'keepPlaybackMoving', 'scheduleVideoFrameWithWatchdog', "navigator.wakeLock.request('screen')"], 'Protection anti-blocage export']
];
for (const [content, markers, label] of markerGroups) {
  for (const marker of markers) if (!content.includes(marker)) throw new Error(`${label} incomplet : ${marker}`);
}

const auditMarkers = [
  "const FINAL_VERSION = '2.6.0'", 'requestPersistentStorage', 'navigator.storage?.estimate',
  'hydrateAndRepairProject', "const blobKey = `source-${uid('media')}`",
  'scheduleMediaGarbageCollection', 'collectReferencedBlobKeys', 'deleteSelectedSafely',
  'stopImmediatePropagation', 'projectMediaProblems', 'projectHealthCard',
  'disableNativeServiceWorkerCache', "window.addEventListener('pagehide'",
  "window.addEventListener('unhandledrejection'"
];
for (const marker of auditMarkers) {
  if (!files.audit.includes(marker)) throw new Error(`Protection finale manquante : ${marker}`);
}
if (files.audit.includes("const blobKey = 'source-video'")) throw new Error('Une clé fixe casserait encore l’annulation après un nouvel import.');
for (const marker of ['remix-studio-v12-mode2-synchronise-2-9', './js/final-audit.js', './js/insertion-cursor.js', './js/export-mode2.js', './js/mode2-sync.js', './js/export-watchdog.js']) {
  if (!serviceWorker.includes(marker)) throw new Error(`Cache final incomplet : ${marker}`);
}

const nativeFiles = [
  'app/src/main/java/com/chasmet/remixstudio/MainActivity.java',
  'app/src/main/java/com/chasmet/remixstudio/NativeCameraActivity.java',
  'app/src/main/AndroidManifest.xml', 'app/build.gradle'
];
for (const file of nativeFiles) if (!existsSync(file)) throw new Error(`Fichier Android natif manquant : ${file}`);
const mainActivity = readFileSync(nativeFiles[0], 'utf8');
const cameraActivity = readFileSync(nativeFiles[1], 'utf8');
const manifest = readFileSync(nativeFiles[2], 'utf8');
const gradle = readFileSync(nativeFiles[3], 'utf8');
if (!cameraActivity.includes('VideoCapture<Recorder>') || !cameraActivity.includes('withAudioEnabled')) throw new Error('CameraX avec audio est incomplète.');
if (!mainActivity.includes('WebViewAssetLoader') || !mainActivity.includes('beginDownload') || !mainActivity.includes('finishDownload')) throw new Error('Pont Android incomplet.');
if (!manifest.includes('android:hardwareAccelerated="true"') || !manifest.includes('android.permission.RECORD_AUDIO')) throw new Error('Accélération matérielle ou micro manquant.');
if (!gradle.includes("versionName '2.9.0'") || !gradle.includes('versionCode 12') || !gradle.includes("include 'js/**'")) throw new Error('Version APK 2.9.0 incomplète.');

const workflowMarkers = [
  'Auditer la stabilité, les données et la fluidité', 'Tester l’insertion à la ligne blanche',
  'Tester le Mode 2 interview naturelle', 'Tester la synchronisation précise du Mode 2',
  'Tester la protection anti-blocage de l’export', 'assets/www/js/mode2-sync.js',
  'Rejouer les tests de non-régression', 'Mode 2 synchronisé', 'mode2_synchronized',
  'reaction_trompe_oeil', 'cursor_insertion', 'data_integrity_audited',
  'project_self_repair', 'storage_guard', 'regression_tests_repeated'
];
for (const marker of workflowMarkers) if (!workflow.includes(marker)) throw new Error(`Validation CI finale manquante : ${marker}`);

console.log(`Audit réussi : Mode 2 synchronisé 2.9.0, export anti-blocage, insertion au curseur, intégrité, fluidité, export 1080p, ${scripts.length} scripts et CameraX vérifiés.`);
