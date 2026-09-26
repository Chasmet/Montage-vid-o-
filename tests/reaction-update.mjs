import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import vm from 'node:vm';

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
const nativeMic = read('app/src/main/java/com/chasmet/remixstudio/NativeReactionMic.java');
const init = read('js/init.js');

for (const path of ['js/reaction.js', 'js/app-settings.js']) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status) throw new Error(`${path} : ${result.stderr}`);
}

for (const id of ['reactionTab', 'reactionInput', 'reactionCanvas', 'reactionSource', 'reactionCameraVideo',
  'reactionCameraPlaceholder', 'reactionVideoPlaceholder', 'reactionCameraQuick', 'reactionImportQuick',
  'reactionStage', 'reactionCameraHalf', 'reactionVideoHalf', 'reactionCameraFrame', 'reactionVideoFrame',
  'reactionOutputVertical', 'reactionOutputHorizontal', 'reactionFramingClean', 'reactionFramingCrop', 'reactionFramingFree',
  'reactionCameraZoom', 'reactionCameraFitContain', 'reactionCameraFitCover', 'reactionCameraReset',
  'reactionFitCover', 'reactionFitContain', 'reactionReset', 'reactionSeek', 'reactionVolume', 'reactionMicGain', 'reactionZoom', 'reactionMute',
  'reactionBack', 'reactionForward', 'reactionRecord', 'reactionPause', 'reactionStop',
  'settingsBtn', 'autoUpdateToggle', 'checkUpdateBtn']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Commande manquante : ${id}`);
}

for (const marker of ['canvas.captureStream(30)', 'createMediaElementSource(video)',
  'createMediaStreamDestination()', 'video.pause();',
  'video.currentTime', 'MediaRecorder.isTypeSupported',
  "facingMode: { ideal: 'user' }", 'saveRemixBlobToAndroid', 'recorder.start(500)',
  'requestReactionPermissions', "cameraFit = 'cover'", "videoFit = 'contain'", "videoFit = 'cover'",
  'sourceAspect = video.videoWidth / video.videoHeight', 'fitSharedFrame', 'outputFrameForSlot', 'syncSharedPreviewFrameSize',
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
if (!reaction.includes('drawForegroundInSharedFrame') ||
    !reaction.includes('const cameraFrameRegion = outputFrameForSlot(slots.camera)') ||
    !reaction.includes('const videoFrameRegion = outputFrameForSlot(slots.video)') ||
    !reaction.includes("outputFraming === 'clean'") ||
    !reaction.includes("outputFraming === 'crop'") ||
    !reaction.includes("outputFraming === 'free'"))
  throw new Error('Les modes Propre, Recadré et Libre doivent contrôler le cadrage final.');
if (reaction.includes('drawBlurredSlotBackground') || reaction.includes("ctx.filter = 'blur(") || reaction.includes('const factor = 1.28'))
  throw new Error('Aucun flou, duplication ou ancien mode Smart ne doit rester dans la sortie Réaction.');
if (reaction.includes("'video/webm") || !reaction.includes("Remix-Reaction-${suffix}-${Date.now()}.mp4"))
  throw new Error('L’export Réaction doit être MP4 direct sans fallback WebM.');
if (reaction.includes('recorder.pause()') || reaction.includes('recorder.resume()'))
  throw new Error('Pause vidéo ne doit jamais suspendre MediaRecorder ni couper le micro.');
for (const marker of ['createBiquadFilter()', 'createDynamicsCompressor()', 'micHighpass.frequency.value = 80',
  'micCompressor.threshold.value = -26', 'micGain = audio.createGain()',
  'ensureDedicatedMicrophone()', "getUserMedia({ video: false, audio: constraints })", 'createMediaStreamSource(micStream)',
  'keepAudioEngineAlive()', 'keepAliveOscillator.frequency.value = 20', 'masterCompressor.threshold.value = -8',
  "status('Vidéo en pause. Seul le micro est enregistré.')", 'audioBitsPerSecond: 192_000']) {
  if (!reaction.includes(marker)) throw new Error(`Chaîne audio Réaction incomplète : ${marker}`);
}
if (!html.includes('id="reactionMicGain"') || !html.includes('value="180"') || !html.includes('>⏸ Pause vidéo</button>'))
  throw new Error('Les réglages de voix et la pause vidéo doivent être explicites dans l’interface.');
if (!reaction.includes('video: videoConstraints,\n          audio: false') ||
    reaction.includes('createMediaStreamSource(cameraStream)'))
  throw new Error('Le micro doit être indépendant de la caméra et ne jamais dépendre de cameraStream.');

// The supplied reaction sample kept video frames after pause but its audio was silent.
// Capture audio natively on Android and feed the live mix while the imported video is paused.
for (const marker of ['AudioRecord', 'MediaRecorder.AudioSource.MIC', 'AudioFormat.ENCODING_PCM_16BIT',
  'AudioRecord.READ_BLOCKING', 'onNativeReactionAudio', 'Base64.NO_WRAP']) {
  if (!nativeMic.includes(marker)) throw new Error(`Capture micro Android manquante : ${marker}`);
}
for (const marker of ['new NativeReactionMic(this, webView)', 'startReactionMic()', 'stopReactionMic()']) {
  if (!mainActivity.includes(marker)) throw new Error(`Pont micro Android manquant : ${marker}`);
}
for (const marker of ['window.onNativeReactionAudio = (encoded, sampleRate)',
  'source.connect(micInput)', 'source.start(nativeMicNextTime)', 'micInput.connect(micHighpass)',
  'nativeMicActive = Boolean(window.Android?.startReactionMic?.())', 'window.Android?.stopReactionMic?.()',
  "$('reactionMicSignal').textContent"]) {
  if (!reaction.includes(marker)) throw new Error(`Mixage micro pendant pause incomplet : ${marker}`);
}
if (!html.includes('id="reactionMicSignal"')) throw new Error('Le niveau du micro doit rester visible pendant la prise.');

// Exercise the actual gain policy across playback -> pause -> playback.
const policyStart = reaction.indexOf('  function desiredMicGain()');
const policyEnd = reaction.indexOf("  // Android's native microphone", policyStart);
assert.ok(policyStart >= 0 && policyEnd > policyStart);
const gain = {
  value: 0, lastAction: '',
  cancelScheduledValues() {},
  setValueAtTime(value) { this.value = value; this.lastAction = 'set'; },
  linearRampToValueAtTime(value) { this.value = value; this.lastAction = 'ramp'; }
};
const hint = { textContent: '' };
const context = vm.createContext({
  video: { paused: false }, active: () => true,
  $: (id) => id === 'reactionMicGain' ? { value: '180' } : hint,
  micGain: { gain }, audio: { currentTime: 10 }, ensureAudioEngineRunning() {}
});
vm.runInContext(reaction.slice(policyStart, policyEnd), context);
vm.runInContext('updateMicPriority()', context);
assert.equal(gain.value, 0, 'La vidéo en lecture doit couper entièrement le micro.');
context.video.paused = true;
vm.runInContext('updateMicPriority()', context);
assert.ok(gain.value > 1, 'La pause vidéo doit ouvrir automatiquement le micro.');
assert.equal(gain.lastAction, 'ramp');
context.video.paused = false;
vm.runInContext('updateMicPriority()', context);
assert.equal(gain.value, 0, 'Reprendre la vidéo doit recouper le micro.');
assert.equal(gain.lastAction, 'set', 'La coupure du micro doit être immédiate, sans chevauchement audible.');



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
console.log('Réaction audio : micro dédié indépendant, moteur audio maintenu pendant pause, voix renforcée et MP4 direct contrôlés.');
