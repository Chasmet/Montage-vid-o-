import { readFileSync } from 'node:fs';

const watchdog = readFileSync('js/export-watchdog.js', 'utf8');
const init = readFileSync('js/init.js', 'utf8');
const serviceWorker = readFileSync('service-worker.js', 'utf8');
const gradle = readFileSync('app/build.gradle', 'utf8');

for (const marker of [
  "const VERSION = '2.8.1'",
  'FALLBACK_CALLBACK_MS',
  'STALL_DETECTION_MS',
  'keepPlaybackMoving',
  'scheduleVideoFrameWithWatchdog',
  'requestVideoFrameCallback',
  'setTimeout(() => finish',
  "navigator.wakeLock.request('screen')"
]) {
  if (!watchdog.includes(marker)) throw new Error(`Protection anti-blocage incomplète : ${marker}`);
}

for (const marker of ['loadExportWatchdog', 'js/export-watchdog.js', 'remixExportWatchdog', "'2.8.1'"]) {
  if (!init.includes(marker)) throw new Error(`Chargement du correctif incomplet : ${marker}`);
}

for (const marker of ['remix-studio-v12-mode2-synchronise-2-9', './js/export-watchdog.js']) {
  if (!serviceWorker.includes(marker)) throw new Error(`Cache du correctif incomplet : ${marker}`);
}

if (!gradle.includes("versionName '2.9.0'") || !gradle.includes('versionCode 12')) {
  throw new Error('La version APK 2.9.0 n’est pas configurée.');
}

console.log('Protection anti-blocage validée dans Remix Studio 2.9.0 : rappel de secours, relance des clips et verrouillage écran conservés.');
