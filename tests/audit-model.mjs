import assert from 'node:assert/strict';

function mediaKey(prefix, timestamp, randomPart) {
  return `${prefix}_${timestamp}_${randomPart}`;
}

function collectBlobKeys(project, destination = new Set()) {
  if (project?.source?.blobKey) destination.add(project.source.blobKey);
  for (const clip of project?.cameraClips || []) {
    if (clip?.blobKey) destination.add(clip.blobKey);
  }
  return destination;
}

function referencedKeys(state, history, future) {
  const keys = collectBlobKeys(state);
  for (const raw of [...history, ...future]) collectBlobKeys(JSON.parse(raw), keys);
  return keys;
}

function repairProject(project, availableKeys) {
  const next = structuredClone(project);
  const missingSource = Boolean(next.source?.blobKey && !availableKeys.has(next.source.blobKey));
  const missingCameraIds = new Set(
    (next.cameraClips || [])
      .filter((clip) => clip.blobKey && !availableKeys.has(clip.blobKey))
      .map((clip) => clip.id)
  );
  if (missingSource) {
    next.source = null;
    next.timelineSegments = next.timelineSegments.filter((segment) => segment.type !== 'source');
  }
  if (missingCameraIds.size) {
    next.cameraClips = next.cameraClips.filter((clip) => !missingCameraIds.has(clip.id));
    next.timelineSegments = next.timelineSegments.filter((segment) => !missingCameraIds.has(segment.mediaId));
  }
  const duration = next.timelineSegments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);
  next.timelineTime = Math.min(Math.max(0, next.timelineTime || 0), duration);
  if (!next.timelineSegments.some((segment) => segment.id === next.selectedId)) {
    next.selectedId = next.timelineSegments[0]?.id || null;
  }
  return next;
}

const original = {
  source: { blobKey: 'source-old' },
  cameraClips: [],
  timelineSegments: [{ id: 'source-clip-old', type: 'source', mediaId: 'source', start: 0, end: 12 }],
  selectedId: 'source-clip-old',
  timelineTime: 4
};
const history = [JSON.stringify(original)];
const afterNewImport = {
  source: { blobKey: 'source-new' },
  cameraClips: [],
  timelineSegments: [{ id: 'source-clip-new', type: 'source', mediaId: 'source', start: 0, end: 20 }],
  selectedId: 'source-clip-new',
  timelineTime: 0
};
assert.deepEqual([...referencedKeys(afterNewImport, history, [])].sort(), ['source-new', 'source-old']);
assert.equal(JSON.parse(history[0]).source.blobKey, 'source-old', 'Annuler doit retrouver le média importé précédent.');

const cameraBeforeDelete = {
  source: null,
  cameraClips: [{ id: 'cam-1', blobKey: 'camera-cam-1' }],
  timelineSegments: [{ id: 'cam-segment', type: 'camera', mediaId: 'cam-1', start: 0, end: 8 }],
  selectedId: 'cam-segment',
  timelineTime: 2
};
const deleteHistory = [JSON.stringify(cameraBeforeDelete)];
const cameraAfterDelete = { source: null, cameraClips: [], timelineSegments: [], selectedId: null, timelineTime: 0 };
assert.ok(referencedKeys(cameraAfterDelete, deleteHistory, []).has('camera-cam-1'), 'Le média caméra doit rester disponible pour Annuler.');

const blobsInStorage = new Set(['source-new', 'source-old', 'camera-unused']);
const kept = referencedKeys(afterNewImport, history, []);
const garbage = [...blobsInStorage].filter((key) => !kept.has(key));
assert.deepEqual(garbage, ['camera-unused'], 'Le nettoyage ne doit supprimer que les médias réellement orphelins.');

const damaged = {
  source: { blobKey: 'missing-source' },
  cameraClips: [
    { id: 'cam-ok', blobKey: 'camera-ok' },
    { id: 'cam-missing', blobKey: 'camera-missing' }
  ],
  timelineSegments: [
    { id: 's1', type: 'source', mediaId: 'source', start: 0, end: 5 },
    { id: 'c1', type: 'camera', mediaId: 'cam-ok', start: 0, end: 7 },
    { id: 'c2', type: 'camera', mediaId: 'cam-missing', start: 0, end: 9 }
  ],
  selectedId: 'c2',
  timelineTime: 100
};
const repaired = repairProject(damaged, new Set(['camera-ok']));
assert.equal(repaired.source, null);
assert.deepEqual(repaired.cameraClips.map((clip) => clip.id), ['cam-ok']);
assert.deepEqual(repaired.timelineSegments.map((segment) => segment.id), ['c1']);
assert.equal(repaired.selectedId, 'c1');
assert.equal(repaired.timelineTime, 7);

const generated = new Set();
for (let index = 0; index < 5000; index += 1) {
  generated.add(mediaKey('source', 1_700_000_000_000 + index, index.toString(36).padStart(6, '0')));
}
assert.equal(generated.size, 5000, 'Les clés média doivent être uniques.');

const invalidDurations = [
  { start: 2, end: 1 },
  { start: 0, end: 0.01 },
  { start: 4, end: 4 }
].filter((segment) => Math.max(0, segment.end - segment.start) <= 0.04);
assert.equal(invalidDurations.length, 3, 'Le précontrôle export doit détecter les clips trop courts ou inversés.');

console.log('Scénarios réussis : nouvel import + annulation, caméra + annulation, nettoyage, réparation, clés uniques et validation export.');
