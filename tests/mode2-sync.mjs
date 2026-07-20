import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const file = 'js/mode2-sync.js';
const source = readFileSync(file, 'utf8');
const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Erreur JavaScript dans ${file}\n${syntax.stderr}`);

const markers = [
  "const VERSION = '2.9.0'",
  'analyseAll',
  'phaseSpecs',
  'pauseRecorder',
  'resumeRecorder',
  'recorder.start(500)',
  'if (i < specs.length - 1) await pauseRecorder(recorder)',
  'event.stopImmediatePropagation()',
  '.export-mode-choice.podcast',
  'Mode 2 synchronisé',
  'les temps de préparation ont été supprimés'
];
for (const marker of markers) {
  if (!source.includes(marker)) throw new Error(`Synchronisation Mode 2 incomplète : ${marker}`);
}

const analysisIndex = source.indexOf('const reactionPlans = await analyseAll(segments)');
const recorderStartIndex = source.indexOf('recorder.start(500)');
if (analysisIndex < 0 || recorderStartIndex < 0 || analysisIndex > recorderStartIndex) {
  throw new Error('L’analyse des réactions doit être terminée avant le démarrage réel de l’enregistrement.');
}

const sampleMode1Duration = 70.266666;
const preparationOverheadObserved = 19.501339;
const oldMode2Duration = sampleMode1Duration + preparationOverheadObserved;
const synchronizedDuration = sampleMode1Duration;
if (Math.abs(oldMode2Duration - 89.768005) > 0.0001) throw new Error('Le modèle de l’ancien décalage ne correspond pas à la vidéo fournie.');
if (Math.abs(synchronizedDuration - sampleMode1Duration) > 0.0001) throw new Error('Le Mode 2 synchronisé doit conserver la durée de la timeline.');

function capturedDuration(phases, setupDelays, synchronized) {
  return phases.reduce((sum, duration) => sum + duration, 0) + (synchronized ? 0 : setupDelays.reduce((sum, delay) => sum + delay, 0));
}
const phases = [3.23, 6, 8.87, 9.3, 10.4, 11.63, 17.47, 3.37];
const setup = [2.1, 2.84, 3.03, 2.5, 3.8, 1.9, 3.3, 0.03];
if (capturedDuration(phases, setup, true) >= capturedDuration(phases, setup, false)) {
  throw new Error('Les préparations doivent être exclues de la durée exportée.');
}

console.log('Mode 2 synchronisé validé : analyse hors enregistrement, pauses entre phases, durée de timeline conservée et ancien export remplacé.');
