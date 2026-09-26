import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(path, 'utf8');
const html = read('index.html');
const reaction = read('js/reaction.js');
const settings = read('js/app-settings.js');
const bridge = read('js/android-bridge.js');
const manager = read('app/src/main/java/com/chasmet/remixstudio/UpdateManager.java');
const manifest = read('app/src/main/AndroidManifest.xml');
const workflow = read('.github/workflows/build-apk.yml');
const worker = read('service-worker.js');\nconst mainActivity = read('app/src/main/java/com/chasmet/remixstudio/MainActivity.java');\nconst init = read('js/init.js');

for (const path of ['js/reaction.js', 'js/app-settings.js']) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status) throw new Error(`${path} : ${result.stderr}`);
}

for (const id of ['reactionTab', 'reactionInput', 'reactionCanvas', 'reactionSource', 'reactionCameraVideo',
  'reactionSeek', 'reactionVolume', 'reactionZoom', 'reactionMute', 'reactionBack', 'reactionForward',
  'reactionRecord', 'reactionPause', 'reactionStop', 'settingsBtn', 'autoUpdateToggle', 'checkUpdateBtn']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Commande manquante : ${id}`);
}

for (const marker of ['canvas.captureStream(30)', 'createMediaElementSource(video)',
  'createMediaStreamSource(cameraStream)', 'createMediaStreamDestination()', 'recorder.pause()',
  'recorder.resume()', 'video.pause(); recorder.pause()', 'video.currentTime', 'MediaRecorder.isTypeSupported',
  "mimeType.startsWith('video/mp4')", 'facingMode: \'user\'', 'saveRemixBlobToAndroid', 'recorder.start(500)']) {
  if (!reaction.includes(marker)) throw new Error(`Enregistrement incomplet : ${marker}`);
}

for (const marker of ['releases?per_page=20', 'findNewestSignedRelease', 'RemixStudio.apk.sha256', 'SHA-256', 'validatePackage(target)',
  'getPackageArchiveInfo', 'candidate.packageName', 'getApkContentsSigners', 'next <= current',
  'FileProvider.getUriForFile', 'canRequestPackageInstalls', 'REQUEST_INSTALL_PACKAGES']) {
  if (!(manager + manifest).includes(marker)) throw new Error(`Mise à jour non sécurisée : ${marker}`);
}

for (const marker of ['RELEASE_KEYSTORE_BASE64', 'SIGNING_READY', 'assembleRelease',
  'RemixStudio-debug.apk', 'gh release create "v${CI_VERSION_NAME}"', 'sha256sum',
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

console.log('Réaction 9:16, mixage et circuit de mise à jour contrôlés.');
