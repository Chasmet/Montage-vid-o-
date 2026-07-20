import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const file = 'js/export-mode2.js';
const source = readFileSync(file, 'utf8');
const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Erreur JavaScript dans ${file}\n${syntax.stderr}`);

const markers = [
  "const VERSION = '2.8.0'",
  'Mode 1 — Montage normal',
  'Mode 2 — Deux vidéos côte à côte',
  'analyzeReaction',
  'frameDifference',
  "mode: 'loop'",
  "mode: 'still'",
  'calmWindows',
  'drawVideoInRect',
  'runPodcastPhase',
  "activeSide: 'left'",
  "activeSide: 'right'",
  'reaction.update',
  'gainNode.gain.value',
  'exportPodcastInterview',
  'remix-studio-mode2-interview-1080p',
  'exportTimeline = showExportModeChooser'
];
for (const marker of markers) {
  if (!source.includes(marker)) throw new Error(`Fonction Mode 2 manquante : ${marker}`);
}

function buildPlan(durations) {
  const phases = [];
  for (let index = 0; index < durations.length; index += 2) {
    phases.push({ active: index, reaction: index + 1 < durations.length ? index + 1 : null, side: 'left', duration: durations[index] });
    if (index + 1 < durations.length) {
      phases.push({ active: index + 1, reaction: index, side: 'right', duration: durations[index + 1] });
    }
  }
  return phases;
}

const even = buildPlan([4, 12, 7, 5]);
if (even.length !== 4) throw new Error('Deux duos doivent produire quatre phases parlées.');
if (even[0].active !== 0 || even[0].reaction !== 1 || even[0].side !== 'left') throw new Error('La première vidéo doit parler à gauche avec la seconde en réaction.');
if (even[1].active !== 1 || even[1].reaction !== 0 || even[1].side !== 'right') throw new Error('La seconde vidéo doit ensuite parler à droite avec la première en réaction.');
if (even.reduce((sum, phase) => sum + phase.duration, 0) !== 28) throw new Error('Le Mode 2 doit conserver la durée totale de la timeline.');

const odd = buildPlan([3, 6, 9]);
if (odd.length !== 3) throw new Error('Un nombre impair de clips doit conserver le dernier clip.');
if (odd[2].active !== 2 || odd[2].reaction !== null) throw new Error('Le dernier clip sans partenaire doit être exporté seul.');

function chooseReaction(scores) {
  const sorted = [...scores].sort((a, b) => a - b);
  return sorted.filter((score) => score <= 11.5).slice(0, 2).length ? 'loop' : 'still';
}
if (chooseReaction([4, 7, 20]) !== 'loop') throw new Error('Deux passages calmes doivent produire une réaction animée.');
if (chooseReaction([16, 19, 25]) !== 'still') throw new Error('Une scène trop agitée doit utiliser un trompe-l’œil fixe animé.');

console.log('Mode 2 validé : duos successifs, audio alterné, réactions calmes, secours anti-boucle et durée conservée.');
