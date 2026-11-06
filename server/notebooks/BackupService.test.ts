/**
 * Tests du BackupService — backup incrémental, rotation, restauration.
 *
 * 100 % hors-ligne : on redirige la persistance vers un dossier temporaire via
 * `Leanna_CONFIG_PATH` (lu par getNotebooksDir()) et on passe un backupDir dédié
 * au constructeur. Aucun timer n'est démarré (on appelle runBackup() à la main).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BackupService } from './BackupService.js';

// ─── Utilitaires de banc d'essai ──────────────────────────────────────────

interface Harness {
  root: string;
  notebooksDir: string;
  backupDir: string;
  service: BackupService;
  cleanup: () => void;
}

function setup(maxBackups = 3): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-backup-'));
  // getNotebooksDir() lit Leanna_CONFIG_PATH puis ajoute .Leanna/notebooks
  const prevConfig = process.env.Leanna_CONFIG_PATH;
  process.env.Leanna_CONFIG_PATH = root;

  const notebooksDir = path.join(root, '.Leanna', 'notebooks');
  fs.mkdirSync(notebooksDir, { recursive: true });
  const backupDir = path.join(root, 'backups');

  const service = new BackupService({ backupDir, maxBackups, enabled: true, intervalMs: 60_000 });

  return {
    root,
    notebooksDir,
    backupDir,
    service,
    cleanup: () => {
      if (prevConfig === undefined) delete process.env.Leanna_CONFIG_PATH;
      else process.env.Leanna_CONFIG_PATH = prevConfig;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

let nbCounter = 0;
function writeNotebook(dir: string, title: string, sourceCount = 1): string {
  const id = `nb-${nbCounter++}`;
  const notebook = {
    id,
    title,
    sources: Array.from({ length: sourceCount }, (_, i) => ({ id: `src-${i}` })),
    chatHistory: [],
  };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(notebook), 'utf-8');
  return id;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test('backup: runBackup crée un dossier avec métadonnées pour les notebooks modifiés', async () => {
  const h = setup();
  try {
    const id = writeNotebook(h.notebooksDir, 'Premier notebook', 2);

    const meta = await h.service.runBackup();
    assert.ok(meta, 'runBackup doit retourner des métadonnées');
    assert.equal(meta!.notebookCount, 1);
    assert.equal(meta!.totalSources, 2);
    assert.ok(meta!.incrementalIds.includes(id));

    // Le dossier de backup existe avec le fichier du notebook + _metadata.json
    const backupPath = path.join(h.backupDir, meta!.id);
    assert.ok(fs.existsSync(path.join(backupPath, `${id}.json`)));
    assert.ok(fs.existsSync(path.join(backupPath, '_metadata.json')));
  } finally {
    h.cleanup();
  }
});

test('backup: aucun notebook à sauvegarder → retourne null', async () => {
  const h = setup();
  try {
    const meta = await h.service.runBackup();
    assert.equal(meta, null);
  } finally {
    h.cleanup();
  }
});

test('backup incrémental: ne resauvegarde pas un notebook non modifié', async () => {
  const h = setup();
  try {
    writeNotebook(h.notebooksDir, 'Stable');

    // Laisser passer >1s pour que l'horodatage enregistré par le premier backup
    // soit strictement postérieur au mtime du fichier (la détection d'incrément
    // repose sur mtime, dont la résolution peut être ~1s selon le système).
    await new Promise(r => setTimeout(r, 1100));

    const first = await h.service.runBackup();
    assert.ok(first, 'premier backup effectué');

    // Rien n'a changé → second backup ne trouve aucun notebook modifié.
    const second = await h.service.runBackup();
    assert.equal(second, null, 'aucun notebook modifié → pas de nouveau backup');
  } finally {
    h.cleanup();
  }
});

test('backup incrémental: resauvegarde après modification', async () => {
  const h = setup();
  try {
    const id = writeNotebook(h.notebooksDir, 'Évolutif');
    const first = await h.service.runBackup();
    assert.ok(first);

    // Attendre pour garantir un mtime strictement supérieur, puis modifier.
    await new Promise(r => setTimeout(r, 1100));
    fs.writeFileSync(
      path.join(h.notebooksDir, `${id}.json`),
      JSON.stringify({ id, title: 'Évolutif v2', sources: [{ id: 's0' }, { id: 's1' }], chatHistory: [] }),
      'utf-8',
    );

    const second = await h.service.runBackup();
    assert.ok(second, 'le notebook modifié doit être resauvegardé');
    assert.ok(second!.incrementalIds.includes(id));
  } finally {
    h.cleanup();
  }
});

test('rotation: ne conserve que maxBackups backups', async () => {
  const h = setup(3);
  try {
    // Génère 5 backups distincts (chacun avec un notebook modifié + timestamp unique).
    for (let i = 0; i < 5; i++) {
      const id = writeNotebook(h.notebooksDir, `NB ${i}`);
      const meta = await h.service.runBackup();
      assert.ok(meta, `backup ${i} doit réussir`);
      // Espacer les timestamps pour des ids de dossier distincts + mtime croissants.
      await new Promise(r => setTimeout(r, 1100));
      // Marquer le fichier pour forcer un nouveau backup au tour suivant.
      fs.writeFileSync(path.join(h.notebooksDir, `${id}.json`),
        JSON.stringify({ id, title: `NB ${i} touched`, sources: [{ id: 's' }], chatHistory: [] }), 'utf-8');
    }

    const backups = h.service.listBackups();
    assert.ok(backups.length <= 3, `attendu <= 3 backups après rotation, obtenu ${backups.length}`);

    // Les dossiers physiques doivent aussi avoir été élagués.
    const dirs = fs.readdirSync(h.backupDir).filter(d => d.startsWith('backup-'));
    assert.ok(dirs.length <= 3, `attendu <= 3 dossiers, obtenu ${dirs.length}`);
  } finally {
    h.cleanup();
  }
});

test('listBackups: trie du plus récent au plus ancien', async () => {
  const h = setup(10);
  try {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      writeNotebook(h.notebooksDir, `Doc ${i}`);
      const meta = await h.service.runBackup();
      assert.ok(meta);
      ids.push(meta!.id);
      await new Promise(r => setTimeout(r, 1100));
    }

    const backups = h.service.listBackups();
    assert.ok(backups.length >= 2);
    for (let i = 1; i < backups.length; i++) {
      assert.ok(
        backups[i - 1].timestamp >= backups[i].timestamp,
        'les backups doivent être triés par timestamp décroissant',
      );
    }
  } finally {
    h.cleanup();
  }
});

test('restore: restaure un notebook écrasé depuis un backup', async () => {
  const h = setup();
  try {
    const id = writeNotebook(h.notebooksDir, 'Original');
    const meta = await h.service.runBackup();
    assert.ok(meta);

    // Écraser le notebook courant avec du contenu corrompu.
    const current = path.join(h.notebooksDir, `${id}.json`);
    fs.writeFileSync(current, JSON.stringify({ id, title: 'CORROMPU', sources: [], chatHistory: [] }), 'utf-8');

    const ok = h.service.restoreNotebook(meta!.id, id);
    assert.equal(ok, true, 'la restauration doit réussir');

    const restored = JSON.parse(fs.readFileSync(current, 'utf-8'));
    assert.equal(restored.title, 'Original', 'le titre original doit être restauré');
  } finally {
    h.cleanup();
  }
});

test('restore: échoue proprement pour un backup inexistant', () => {
  const h = setup();
  try {
    const ok = h.service.restoreNotebook('backup-inexistant', 'nb-x');
    assert.equal(ok, false);
  } finally {
    h.cleanup();
  }
});

test('restoreAll: restaure tous les notebooks d\'un backup', async () => {
  const h = setup();
  try {
    const id1 = writeNotebook(h.notebooksDir, 'Un');
    const id2 = writeNotebook(h.notebooksDir, 'Deux');
    const meta = await h.service.runBackup();
    assert.ok(meta);
    assert.equal(meta!.notebookCount, 2);

    // Supprimer les notebooks courants.
    fs.rmSync(path.join(h.notebooksDir, `${id1}.json`));
    fs.rmSync(path.join(h.notebooksDir, `${id2}.json`));

    const res = h.service.restoreAll(meta!.id);
    assert.equal(res.restored, 2);
    assert.equal(res.errors, 0);
    assert.ok(fs.existsSync(path.join(h.notebooksDir, `${id1}.json`)));
    assert.ok(fs.existsSync(path.join(h.notebooksDir, `${id2}.json`)));
  } finally {
    h.cleanup();
  }
});

test('stop: idempotent et sans erreur même sans timer actif', () => {
  const h = setup();
  try {
    assert.doesNotThrow(() => h.service.stop());
    assert.doesNotThrow(() => h.service.stop());
  } finally {
    h.cleanup();
  }
});


test('restore: refuse les identifiants contenant un chemin', () => {
  const h = setup();
  try {
    assert.equal(h.service.restoreNotebook('../outside', 'nb-x'), false);
    assert.deepEqual(h.service.restoreAll('../outside'), { restored: 0, errors: 1 });
  } finally {
    h.cleanup();
  }
});

test('listBackups: ignore les métadonnées invalides ou incohérentes', () => {
  const h = setup();
  try {
    const invalidDir = path.join(h.backupDir, 'backup-123');
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, '_metadata.json'), JSON.stringify({
      id: 'backup-999',
      timestamp: 'not-a-date',
      notebookCount: -1,
      totalSources: 0,
      totalSizeBytes: 0,
      incrementalIds: [],
    }));
    assert.deepEqual(h.service.listBackups(), []);
  } finally {
    h.cleanup();
  }
});
