import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// AUDIT-007 : le preload ne doit exposer aucune primitive de suppression ou
// d'exécution de fichiers au renderer.
test('preload: liste des clés exposées par electronAPI', () => {
  const src = fs.readFileSync(path.resolve('electron/preload.cjs'), 'utf8');
  const exposed: Record<string, unknown> = {};
  const electron = {
    contextBridge: { exposeInMainWorld: (key: string, api: object) => { exposed[key] = api; } },
    ipcRenderer: { invoke: () => {}, on: () => {}, removeListener: () => {} },
  };
  new Function('require', 'window', src)(() => electron, { dispatchEvent: () => {} });

  const keys = Object.keys(exposed.electronAPI as object);
  for (const forbidden of ['folderContents', 'createFile', 'createFolder', 'deletePath', 'openPath', 'getProjectRoot']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} ne doit plus être exposé`);
  }
  assert.ok(keys.includes('openExternal'));
});
