// Préchargé par `npm test` (--import) dans chaque processus de test.
// Redirige l'état de l'app vers un dossier temporaire pour que les tests ne
// modifient ni le .Leanna/ réel (dernier projet, registre des workspaces), ni
// le .env (master key et jeton API générés), ni la config Telegram.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-test-state-'));

process.env.LEANNA_STATE_DIR ??= path.join(dir, 'state');
process.env.Leanna_CONFIG_PATH ??= path.join(dir, 'config');
process.env.LEANNA_TELEGRAM_CONFIG_PATH ??= path.join(dir, '.Leanna-telegram.json');
fs.mkdirSync(process.env.LEANNA_STATE_DIR, { recursive: true });
fs.mkdirSync(process.env.Leanna_CONFIG_PATH, { recursive: true });

process.on('exit', () => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});
