import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const core = readFileSync('js/core.js', 'utf8');
const audit = readFileSync('js/final-audit.js', 'utf8');
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Section absente : ${start}`);
  return source.slice(from, to);
};
const saved = {
  source: { blobKey: 'source-keep', url: null },
  cameraClips: [{ id: 'cam-keep', blobKey: 'camera-keep', url: null }],
  timelineSegments: [{ id: 'clip-keep', mediaId: 'cam-keep', type: 'camera' }],
  selectedId: 'clip-keep', timelineTime: 0
};

// Failure to open IndexedDB must keep the saved project metadata intact.
let warning = '';
const restore = vm.createContext({
  safeStorage: { get: () => JSON.stringify(saved) },
  state: {}, db: null, projectMetadataUnavailable: false,
  migrateSavedState: (value) => value,
  initialState: () => { throw Error('Project was erased'); },
  hydrateMediaUrls: () => { throw Error('IndexedDB unavailable'); },
  console: { warn() {} },
  setTimeout: (fn) => fn(),
  showToast: (message) => { warning = message; }
});
vm.runInContext(section(core, 'async function loadSavedProject()', 'function getMediaByRef('), restore);
await vm.runInContext('loadSavedProject()', restore);
assert.equal(restore.state.source.blobKey, 'source-keep');
assert.equal(restore.state.timelineSegments.length, 1);
assert.match(warning, /projet conservé/i);

// A failed read is not evidence that a blob was deleted. Never repair by
// removing clips or writing a smaller project in this situation.
let writes = 0;
const project = structuredClone(saved);
const repair = vm.createContext({
  db: {}, state: project,
  getBlob: async () => { throw Error('Transient IndexedDB read error'); },
  safeStorage: { set() { writes++; } },
  URL: { createObjectURL() { throw Error('Unexpected URL'); } }
});
vm.runInContext(section(audit, '  async function hydrateAndRepairProject(', '  hydrateMediaUrls = hydrateAndRepairProject;'), repair);
await assert.rejects(vm.runInContext('hydrateAndRepairProject()', repair), /Transient IndexedDB/);
assert.deepEqual(project, saved);
assert.equal(writes, 0);
repair.db = null;
await assert.rejects(vm.runInContext('hydrateAndRepairProject()', repair), /Stockage des vidéos indisponible/);
assert.deepEqual(project, saved);
repair.db = {};
repair.getBlob = async () => null;
repair.timelineDuration = () => 8;
repair.clamp = (value, min, max) => Math.max(min, Math.min(value, max));
repair.setTimeout = (fn) => fn();
repair.showToast = () => {};
repair.serializableState = () => project;
const missing = await vm.runInContext('hydrateAndRepairProject()', repair);
assert.equal(missing.missingSource, true);
assert.equal(missing.repaired, false);
assert.deepEqual(project, saved, 'Un média manquant ne doit pas effacer automatiquement les clips.');
assert.equal(writes, 0);
const manualRepair = await vm.runInContext('hydrateAndRepairProject({ removeMissing: true })', repair);
assert.equal(manualRepair.repaired, true);
assert.equal(project.timelineSegments.length, 0);
assert.equal(writes, 1);

// Corrupted undo data must be rejected before revoking the current media URLs.
let revoked = 0;
const undo = vm.createContext({
  restoreSnapshot: null,
  revokeProjectUrls: () => { revoked++; },
  state: { source: { url: 'blob:current' } },
  migrateSavedState: (value) => value,
  showToast() {}
});
vm.runInContext(section(audit, '  restoreSnapshot = function auditedRestoreSnapshot(raw)', '  importSource = async function auditedImportSource(file)'), undo);
vm.runInContext('restoreSnapshot("{broken")', undo);
assert.equal(revoked, 0);
assert.equal(undo.state.source.url, 'blob:current');

// If reading project metadata itself fails, never garbage-collect the videos
// from IndexedDB or overwrite a project that may become readable on restart.
let deleted = 0;
const metadata = vm.createContext({
  localStorage: { getItem() { throw Error('Locked'); }, setItem() { throw Error('Unexpected write'); } }
});
vm.runInContext(section(core, 'let projectMetadataUnavailable = false;', 'const els = {'), metadata);
assert.equal(vm.runInContext("safeStorage.get('remix-studio-state')", metadata), null);
assert.equal(vm.runInContext('projectMetadataUnavailable', metadata), true);
assert.equal(vm.runInContext("safeStorage.set('remix-studio-state', '{}')", metadata), false);
const gc = vm.createContext({
  db: {}, projectMetadataUnavailable: true,
  getAllBlobKeys() { throw Error('Must not list blobs'); },
  deleteBlob() { deleted++; },
  updateDiagnosticsSoon() {}
});
vm.runInContext(section(audit, '  async function garbageCollectMedia()', '  function scheduleMediaGarbageCollection()'), gc);
await vm.runInContext('garbageCollectMedia()', gc);
assert.equal(deleted, 0);

const savedLabel = { textContent: '' };
const save = vm.createContext({
  els: { saveStatus: savedLabel }, db: {}, state: saved,
  safeStorage: { set: () => false },
  serializableState: () => saved,
  autosaveTimer: null,
  clearTimeout() {}, setTimeout: (fn) => { fn(); return 1; }
});
vm.runInContext(section(core, 'function setSaving(', 'function openDB()'), save);
vm.runInContext('scheduleSave()', save);
assert.equal(savedLabel.textContent, 'Sauvegarde impossible');
const importWithoutMetadata = vm.createContext({
  db: { transaction() { throw Error('Must not write orphaned media'); } },
  projectMetadataUnavailable: false,
  safeStorage: { set: () => false },
  serializableState: () => saved
});
vm.runInContext(section(core, 'function putBlob(', 'function getBlob('), importWithoutMetadata);
await assert.rejects(vm.runInContext('putBlob("orphan", {})', importWithoutMetadata), /Sauvegarde du projet indisponible/);

console.log('Stockage : projet conservé lors d’une panne IndexedDB et historique invalide sans perte des médias.');
