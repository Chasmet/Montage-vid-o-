import assert from 'node:assert/strict';

const EDGE_TOLERANCE = 0.08;
const duration = (segment) => Math.max(0, segment.end - segment.start);
const timelineDuration = (segments) => segments.reduce((sum, segment) => sum + duration(segment), 0);

function infoAt(segments, projectTime) {
  const total = timelineDuration(segments);
  const safeTime = Math.min(Math.max(projectTime, 0), total);
  let cursor = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const segmentDuration = duration(segment);
    const end = cursor + segmentDuration;
    if (safeTime < end || index === segments.length - 1) {
      return {
        segment,
        index,
        local: Math.min(Math.max(safeTime - cursor, 0), segmentDuration)
      };
    }
    cursor = end;
  }
  return null;
}

function insertionIndexAtCursor(segments, projectTime, lastInsertedSegmentId = null) {
  if (!segments.length) return 0;
  const info = infoAt(segments, projectTime);
  if (!info) return segments.length;
  const segmentDuration = duration(info.segment);
  if (info.local <= EDGE_TOLERANCE) {
    return info.segment.id === lastInsertedSegmentId ? info.index + 1 : info.index;
  }
  if (segmentDuration - info.local <= EDGE_TOLERANCE) return info.index + 1;
  return info.index + 1;
}

function insert(segments, index, id) {
  const copy = structuredClone(segments);
  copy.splice(index, 0, { id, start: 0, end: 3 });
  return copy;
}

const splitTimeline = [
  { id: 'gauche', start: 0, end: 5 },
  { id: 'droite', start: 5, end: 10 }
];

assert.equal(insertionIndexAtCursor(splitTimeline, 5), 1, 'Le média doit être placé entre les deux parties divisées.');
assert.deepEqual(
  insert(splitTimeline, insertionIndexAtCursor(splitTimeline, 5), 'camera'),
  [
    { id: 'gauche', start: 0, end: 5 },
    { id: 'camera', start: 0, end: 3 },
    { id: 'droite', start: 5, end: 10 }
  ],
  'La prise caméra ne doit plus partir au fond de la timeline.'
);

assert.equal(insertionIndexAtCursor(splitTimeline, 2.5), 1, 'Au milieu d’un clip, le média est ajouté juste après ce clip.');
assert.equal(insertionIndexAtCursor(splitTimeline, 10), 2, 'À la fin du projet, le média est ajouté à la fin.');
assert.equal(insertionIndexAtCursor([], 0), 0, 'Le premier média démarre une timeline vide.');

const withImportedVideo = insert(splitTimeline, 1, 'import-1');
assert.equal(
  insertionIndexAtCursor(withImportedVideo, 5, 'import-1'),
  2,
  'Une deuxième insertion immédiate doit rester dans le bon ordre après la première.'
);
assert.deepEqual(
  insert(withImportedVideo, 2, 'camera-2').map((segment) => segment.id),
  ['gauche', 'import-1', 'camera-2', 'droite'],
  'Les vidéos importées et les prises caméra doivent s’enchaîner dans l’ordre de création.'
);

console.log('Tests insertion curseur réussis : import et caméra restent à côté de la coupe.');
