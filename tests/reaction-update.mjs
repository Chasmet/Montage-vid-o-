import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(path, 'utf8');
const html = read('index.html');
const reaction = read('js/reaction.js');
const settings = read('js/app-settings.js');
const bridge = read('js/android-bridge.js');
const appManifest = read('manifest.webmanifest');
const manager = read('app/src/main/java/com/chasmet/remixstudio/UpdateManager.java');
const manifest = read('app/src/main/AndroidManifest.xml');
const workflow = read('.github/workflows/build-apk.yml');
const worker = read('service-worker.js');
const mainActivity = read('app/src/main/java/com/chasmet/remixstudio/MainActivity.java');
const init = read('js/init.js');

for (const path of ['js/reaction.js', 'js/app-settings.js']) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status) throw new Error(`${path} : ${result.stderr}`);
}

for (const id of ['reactionTab', 'reactionInput', 'reactionCanvas', 'reactionSource', 'reactionCameraVideo',
  'reactionCameraPlaceholder', 'reactionVideoPlaceholder', 'reactionCameraQuick', 'reactionImportQuick',
  'reactionStage', 'reactionCameraHalf', 'reactionVideoHalf', 'reactionCameraFrame', 'reactionVideoFrame',
  'reactionOutputVertical', 'reactionOutputHorizontal',
  'reactionCameraZoom', 'reactionCameraFitContain', 'reactionCameraFitCover', 'reactionCameraReset',
  'reactionFitCover', 'reactionFitContain', 'reactionReset', 'reactionSeek', 'reactionVolume', 'reactionZoom', 'reactionMute',
  'reactionBack', 'reactionForward', 'reactionRecord', 'reactionPause', 'reactionStop',
  'settingsBtn', 'autoUpdateToggle', 'checkUpdateBtn']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Commande manquante : ${id}`);
}

for (const marker of ['canvas.captureStream(30)', 'createMediaElementSource(video)',
  'createMediaStreamDestination()', 'recorder.pause()', 'recorder.resume()', 'video.pause();',
  'video.currentTime', 'MediaRecorder.isTypeSupported',
  "facingMode: { ideal: 'user' }", 'saveRemixBlobToAndroid', 'recorder.start(500)',
  'requestReactionPermissions', "cameraFit = 'contain'", "videoFit = 'contain'", "videoFit = 'cover'",
  'sourceAspect = video.videoWidth / video.videoHeight', 'fitSharedFrame', 'syncSharedPreviewFrameSize',
  "setOutputLayout('horizontal')", "setOutputLayout('vertical')", 'canvas.width = horizontal ? 1920 : 1080',
  'canvas.height = horizontal ? 1080 : 1920', "bindDrag(cameraFrame, 'camera')", "bindDrag(videoFrame, 'video')",
  'aspectRatio: { ideal: sourceAspect }', 'waitForFirstFrame', "$('reactionCameraPlaceholder').addEventListener('click', startCamera)",
  "$('reactionVideoPlaceholder').addEventListener('click'"]) {
  if (!reaction.includes(marker)) throw new Error(`Enregistrement incomplet : ${marker}`);
}

for (const marker of ['releases?per_page=20', 'findNewestSignedRelease', 'RemixStudio.apk.sha256', 'SHA-256', 'validatePackage(target)',
  'getPackageArchiveInfo', 'candidate.packageName', 'getApkContentsSigners', 'next <= current',
  'FileProvider.getUriForFile', 'canRequestPackageInstalls', 'REQUEST_INSTALL_PACKAGES']) {
  if (!(manager + manifest).includes(marker)) throw new Error(`Mise à jour non sécurisée : ${marker}`);
}

for (const marker of ['signing/remix-release.jks', 'SIGNING_READY=true', 'assembleRelease',
  'RemixStudio.apk', 'gh release create "$TAG"', 'gh release edit "$TAG" --latest', 'sha256sum',
  'ef47f7fe94c262160a096e00445cb2884bf2bf8632d7f9a67aaac5cdcc22f0d1',
  'tests/reaction-update.mjs']) {
  if (!workflow.includes(marker)) throw new Error(`Publication incomplète : ${marker}`);
}
for (const asset of ['./js/reaction.js', './js/app-settings.js']) {
  if (!worker.includes(asset)) throw new Error(`Cache du nouvel onglet incomplet : ${asset}`);
}
if (!html.includes('<script src="js/android-bridge.js"></script>') || !bridge.includes('window.saveRemixBlobToAndroid = saveBlobToAndroid'))
  throw new Error('Pont Android de sauvegarde Réaction non chargé de façon déterministe.');
if (!settings.includes('window.Android.getAutoUpdate()') || !settings.includes('window.Android.installUpdate()'))
  throw new Error('Réglages Android non reliés au pont natif.');

for (const marker of ['WebSettings.LOAD_NO_CACHE', 'index.html?apkVersion=', 'BuildConfig.VERSION_CODE']) {
  if (!mainActivity.includes(marker)) throw new Error(`Contournement du cache Android incomplet : ${marker}`);
}
if (!init.includes("!window.isRemixStudioAndroid"))
  throw new Error('Le service worker ne doit pas être réinstallé dans l’application Android.');
if (!html.includes('>⚙ Réglages</button>') || !html.includes('>● Réaction</button>'))
  throw new Error('Les entrées Réglages et Réaction doivent être visibles explicitement.');

if (!mainActivity.includes('REACTION_PERMISSION_REQUEST') || !mainActivity.includes('requestReactionPermissions()'))
  throw new Error('Le bouton Réaction doit demander explicitement Caméra + Microphone à Android.');
if (!manifest.includes('android:icon="@drawable/app_logo"') || !appManifest.includes('app-logo.webp'))
  throw new Error('Le nouveau logo doit être intégré à Android et au manifeste web.');
if (!html.includes('reaction-record-controls') || !html.includes('>● REC</button>'))
  throw new Error('Les commandes d’enregistrement doivent être immédiatement sous l’aperçu.');
if (!html.includes('width="1080" height="1920"'))
  throw new Error('Le canvas Réaction doit démarrer en 1080x1920.');
if (!reaction.includes("outputLayout === 'horizontal'") ||
    !reaction.includes("camera: { x: 0, y: 0, w: canvas.width / 2, h: canvas.height }") ||
    !reaction.includes("video: { x: canvas.width / 2, y: 0, w: canvas.width / 2, h: canvas.height }"))
  throw new Error('L’export 16:9 doit remplir le canvas avec deux moitiés strictement identiques.');
if (!reaction.includes('ctx.filter = \'blur(32px) brightness(0.55) saturate(0.9)\'') ||
    !reaction.includes('const foregroundScale = Math.min(w / element.videoWidth, h / element.videoHeight) * zoom') ||
    !reaction.includes('cameraFit,\n      true') ||
    !reaction.includes('videoFit,\n      false'))
  throw new Error('L’export doit garder les deux images entières et remplir le fond avec une copie floutée.');
if (reaction.includes("'video/webm") || !reaction.includes("Remix-Reaction-${suffix}-${Date.now()}.mp4"))
  throw new Error('L’export Réaction doit être MP4 direct sans fallback WebM.');

if (!html.includes('sources complètes 9:16 / 19:9') ||
    !html.includes('9:16 vertical') || !html.includes('16:9 horizontal') ||
    !html.includes('même cadre que la vidéo'))
  throw new Error('Le choix de format final et le cadrage identique caméra/vidéo doivent être visibles.');

if (!read('style.css').includes('height:clamp(250px,42dvh,320px)'))
  throw new Error('L’aperçu Réaction doit être compact sur téléphone.');
const gradle = read('app/build.gradle');
if (!gradle.includes("rootProject.file('signing/remix-release.jks')") ||
    !gradle.includes('signingConfig signingConfigs.persistent'))
  throw new Error('Les APK debug et release doivent partager la signature permanente.');
console.log('Réaction corrigée : image entière sans zoom forcé, fond flouté sans bandes noires, MP4 direct et mise à jour signée contrôlés.');
