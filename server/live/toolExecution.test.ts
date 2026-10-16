import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ToolCallTracker,
  ToolCancelledError,
  getToolDeliveryMode,
  getAckAfterMs,
  raceWithAbort,
  raceWithDeadline,
  abortableSleep,
  summarizeForNotify,
  buildAckResponse,
  withScheduling,
  applyToolBehavior,
  isRetryableToolError,
  LONG_RUNNING_TOOLS,
} from './toolExecution.js';

/** Restaure une variable d'env après manipulation dans un test. */
function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

test('getToolDeliveryMode: défaut = ack, valeurs valides respectées, invalide → ack', () => {
  withEnv('LEANNA_LIVE_TOOL_MODE', undefined, () => {
    assert.equal(getToolDeliveryMode(), 'ack');
  });
  withEnv('LEANNA_LIVE_TOOL_MODE', 'blocking', () => {
    assert.equal(getToolDeliveryMode(), 'blocking');
  });
  withEnv('LEANNA_LIVE_TOOL_MODE', 'NONBLOCKING', () => {
    assert.equal(getToolDeliveryMode(), 'nonblocking');
  });
  withEnv('LEANNA_LIVE_TOOL_MODE', 'nimportequoi', () => {
    assert.equal(getToolDeliveryMode(), 'ack');
  });
});

test('getAckAfterMs: défaut 1500, valeur numérique respectée, invalide → défaut', () => {
  withEnv('LEANNA_LIVE_TOOL_ACK_MS', undefined, () => {
    assert.equal(getAckAfterMs(), 1500);
  });
  withEnv('LEANNA_LIVE_TOOL_ACK_MS', '250', () => {
    assert.equal(getAckAfterMs(), 250);
  });
  withEnv('LEANNA_LIVE_TOOL_ACK_MS', 'abc', () => {
    assert.equal(getAckAfterMs(), 1500);
  });
});

test('raceWithAbort: résout avec la valeur quand le travail finit avant abort', async () => {
  const controller = new AbortController();
  const value = await raceWithAbort(Promise.resolve(42), controller.signal);
  assert.equal(value, 42);
});

test('raceWithAbort: rejette ToolCancelledError dès que le signal est abort', async () => {
  const controller = new AbortController();
  const never = new Promise<number>(() => { /* ne se résout jamais */ });
  const raced = raceWithAbort(never, controller.signal, 'test_reason');
  controller.abort();
  await assert.rejects(raced, (err: unknown) => {
    assert.ok(err instanceof ToolCancelledError);
    assert.equal((err as ToolCancelledError).reason, 'test_reason');
    return true;
  });
});

test('raceWithDeadline: timedOut=true si le délai expire avant le travail', async () => {
  const slow = new Promise<string>((resolve) => setTimeout(() => resolve('fini'), 100));
  const result = await raceWithDeadline(slow, 10);
  assert.deepEqual(result, { timedOut: true });
});

test('raceWithDeadline: timedOut=false avec la valeur si le travail finit avant', async () => {
  const fast = Promise.resolve('ok');
  const result = await raceWithDeadline(fast, 100);
  assert.deepEqual(result, { timedOut: false, value: 'ok' });
});

test('abortableSleep: rejette ToolCancelledError si abort pendant l\'attente', async () => {
  const controller = new AbortController();
  const sleep = abortableSleep(1000, controller.signal);
  controller.abort();
  await assert.rejects(sleep, (err: unknown) => err instanceof ToolCancelledError);
});

test('ToolCallTracker: register puis cancel annule le signal et renvoie l\'id', () => {
  const tracker = new ToolCallTracker();
  const ctrl = tracker.register('call-1', 'security_audit');
  assert.equal(tracker.size, 1);
  assert.equal(ctrl.signal.aborted, false);

  const cancelled = tracker.cancel(['call-1', 'inconnu']);
  assert.deepEqual(cancelled, ['call-1']);
  assert.equal(ctrl.signal.aborted, true);
  assert.equal(tracker.size, 0);
});

test('ToolCallTracker: close annule tout et scelle le tracker (register renaît annulé)', () => {
  const tracker = new ToolCallTracker();
  const a = tracker.register('a', 'tool_a');
  const b = tracker.register('b', 'tool_b');
  const closedIds = tracker.close('client_disconnected');
  assert.deepEqual(closedIds.sort(), ['a', 'b']);
  assert.equal(a.signal.aborted, true);
  assert.equal(b.signal.aborted, true);
  assert.equal(tracker.isClosed(), true);
  assert.equal(tracker.getCloseReason(), 'client_disconnected');

  // Un register après fermeture renvoie un controller déjà annulé.
  const late = tracker.register('c', 'tool_c');
  assert.equal(late.signal.aborted, true);
  assert.equal(tracker.size, 0);
});

test('summarizeForNotify: borne les gros résultats et renvoie toujours une string', () => {
  const short = summarizeForNotify({ ok: true });
  assert.equal(typeof short, 'string');
  assert.ok(short.includes('"ok"'));

  const big = summarizeForNotify('x'.repeat(10_000), 4000);
  assert.ok(big.length < 10_000);
  assert.ok(big.includes('tronqué'));
});

test('buildAckResponse + withScheduling: status running + scheduling à la racine et dans response', () => {
  const ack = buildAckResponse({ id: 'id-1', name: 'generate_codebase_markdown' });
  assert.equal(ack.id, 'id-1');
  assert.equal(ack.response.status, 'running');
  assert.equal(ack.response.background, true);

  const scheduled = withScheduling(ack, 'INTERRUPT');
  assert.equal(scheduled.scheduling, 'INTERRUPT');
  assert.equal((scheduled.response as any).scheduling, 'INTERRUPT');
  // Les champs d'origine sont préservés.
  assert.equal((scheduled.response as any).status, 'running');
});

test('applyToolBehavior: NON_BLOCKING sur les outils longs en mode nonblocking, intact sinon', () => {
  const longTool = [...LONG_RUNNING_TOOLS][0];
  const declarations = [
    { name: longTool, description: 'long' },
    { name: 'get_current_time', description: 'rapide' },
  ];

  // Mode nonblocking : seul l'outil long reçoit behavior NON_BLOCKING.
  const nb = applyToolBehavior(declarations, 'nonblocking');
  assert.equal((nb[0] as any).behavior, 'NON_BLOCKING');
  assert.equal((nb[1] as any).behavior, undefined);

  // Modes ack et blocking : déclarations intactes.
  for (const mode of ['ack', 'blocking'] as const) {
    const out = applyToolBehavior(declarations, mode);
    assert.equal((out[0] as any).behavior, undefined);
    assert.equal((out[1] as any).behavior, undefined);
  }
});

// ─── AUDIT-016 : décision de relance ─────────────────────────────────────────

test("isRetryableToolError: un refus d'autorisation n'est jamais rejoué", () => {
  for (const name of ['PermissionDeniedError', 'AutonomyDeniedError', 'SafetyGateBlockedError']) {
    const err = Object.assign(new Error('refusé'), { name });
    assert.equal(isRetryableToolError(err), false, name);
  }
  assert.equal(isRetryableToolError(Object.assign(new Error('x'), { name: 'ToolTimeoutError' })), true);
});
