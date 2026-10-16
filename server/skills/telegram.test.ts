import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { telegramSkill } from './telegram.js';
import { telegramService } from '../telegram/TelegramService.js';
import { handleConfirmationResponse } from '../utils/confirmationBridge.js';
import { setSelfRoot } from '../utils/selfRoot.js';

// AUDIT-005 : envoi de fichiers locaux par Telegram.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-tg-'));
fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
fs.writeFileSync(path.join(root, 'rapport.txt'), 'ok');
setSelfRoot(root);

const sent: string[] = [];
(telegramService as any).getConfig = () => ({ defaultChatId: '111', allowedUsers: ['@alice', '222'] });
(telegramService as any).sendDocument = async (chatId: string, file: string) => {
  sent.push(`${chatId}:${path.basename(file)}`);
  return { success: true, chatId };
};

const approving = { emitToClient: (d: any) => handleConfirmationResponse(d.requestId, true) };
const call = (name: string, args: any, ctx: any = approving) => telegramSkill.handleToolCall(name, args, ctx) as Promise<any>;

test('telegram: .env et chemins hors workspace refusés, sans envoi', async () => {
  for (const p of ['.env', '../outside.txt', path.join(os.homedir(), '.ssh', 'id_rsa')]) {
    const res = await call('telegram_send_from_workspace', { path: p });
    assert.equal(res.success, false, p);
  }
  const doc = await call('telegram_send_document', { file: path.join(root, '.env') });
  assert.equal(doc.success, false);
  assert.deepEqual(sent, []);
});

test('telegram: chatId inconnu refusé', async () => {
  const res = await call('telegram_send_from_workspace', { path: 'rapport.txt', chatId: '999' });
  assert.match(String(res.error), /Destinataire refusé/);
  assert.deepEqual(sent, []);
});

test('telegram: sans canal de confirmation, pas d\'envoi', async () => {
  const res = await call('telegram_send_from_workspace', { path: 'rapport.txt' }, null);
  assert.match(String(res.error), /Confirmation/);
  assert.deepEqual(sent, []);
});

test('telegram: fichier autorisé envoyé après confirmation au chat connu', async () => {
  const res = await call('telegram_send_from_workspace', { path: 'rapport.txt', chatId: 'Alice' });
  assert.equal(res.success, true);
  assert.deepEqual(sent, ['Alice:rapport.txt']);
});
