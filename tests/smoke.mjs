import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync('index.html', 'utf8');
const requiredIds = [
  'saveStatus', 'undoBtn', 'redoBtn', 'previewTitle', 'stage', 'mainVideo',
  'cameraPreview', 'referencePreview', 'emptyStage', 'recordBadge', 'countdown',
  'jumpStartBtn', 'playBtn', 'jumpEndBtn', 'currentTime', 'durationTime',
  'videoInput', 'cameraBtn', 'recordBtn', 'stopRecordBtn', 'markCurrentBtn',
  'trimStartNumber', 'trimEndNumber', 'clipLabel', 'trimStartRange', 'trimEndRange',
  'setInBtn', 'setOutBtn', 'keepSourceBtn', 'addSelectedToFinalBtn',
  'cameraOrientation', 'cameraSelect', 'micSelect', 'countdownSelect',
  'referenceToggle', 'noiseToggle', 'sourceTrack', 'cameraTrack', 'finalTrack',
  'clearProjectBtn', 'previewFinalBtn', 'inspectorTitle', 'volumeRange',
  'fitSelect', 'transitionSelect', 'muteToggle', 'moveLeftBtn', 'moveRightBtn',
  'duplicateBtn', 'deleteClipBtn', 'outputAspect', 'qualitySelect', 'exportBtn',
  'exportProgressWrap', 'exportStatus', 'exportPercent', 'exportProgress', 'toast'
];

const missing = requiredIds.filter((id) => !html.includes(`id="${id}"`));
if (missing.length) throw new Error(`Éléments HTML manquants : ${missing.join(', ')}`);
if (!html.includes('js/capcut-ui.js')) throw new Error('Le contrôleur de la nouvelle interface n’est pas chargé.');

const scripts = [
  'js/core.js', 'js/editor.js', 'js/tracks.js', 'js/camera.js',
  'js/render.js', 'js/init.js', 'js/android-bridge.js', 'js/capcut-ui.js'
];
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Erreur JavaScript dans ${file}\n${result.stderr}`);
}

const cameraScript = readFileSync('js/camera.js', 'utf8');
for (const marker of ['hasNativeCamera', 'startNativeCamera', 'onNativeCameraRecorded']) {
  if (!cameraScript.includes(marker)) throw new Error(`Pont caméra native manquant : ${marker}`);
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

console.log(`Validation réussie : interface, ${scripts.length} scripts et caméra Android native vérifiés.`);
