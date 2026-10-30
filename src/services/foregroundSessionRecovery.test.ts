import assert from 'node:assert/strict';
import test from 'node:test';
import { createForegroundSessionRecovery } from './foregroundSessionRecovery';

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
  let foreground = true;
  let identity: string | undefined = 'account-A';
  let validation: () => Promise<string | null> = async () => 'token';
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const calls: string[] = [];
  let sequence = 0;
  const recovery = createForegroundSessionRecovery({
    captureIdentity: () => identity,
    isCurrent: (owner) => owner === identity,
    isForeground: () => foreground,
    validate: () => { calls.push('validate'); return validation(); },
    resume: () => { calls.push('resume'); },
    refresh: async (owner) => { calls.push(`refresh:${owner}`); },
    onError: () => { calls.push('error'); },
    schedule: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, delay }); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel: (id) => { timers.delete(id as unknown as number); },
  });
  return {
    recovery, calls, timers,
    foreground: (value: boolean) => { foreground = value; },
    identity: (value: string | undefined) => { identity = value; },
    validation: (value: typeof validation) => { validation = value; },
    tick: () => {
      const entry = timers.entries().next().value;
      assert.ok(entry); timers.delete(entry[0]); entry[1].callback();
    },
  };
}

test('offline foreground failure retains recovery and network reconnect retries immediately', async () => {
  const f = setup();
  f.validation(async () => { throw new Error('offline'); });
  f.recovery.request(); await settle();
  assert.deepEqual(f.calls, ['validate', 'error']); assert.equal(f.timers.size, 1);
  f.validation(async () => 'new-token');
  f.recovery.request(); await settle();
  assert.deepEqual(f.calls.slice(-3), ['validate', 'resume', 'refresh:account-A']);
  assert.equal(f.timers.size, 0);
  f.recovery.request(); await settle();
  assert.equal(f.calls.filter((call) => call === 'resume').length, 1);
});

test('retries back off to 30 seconds and recover without another foreground event', async () => {
  const f = setup(); f.validation(async () => null);
  f.recovery.request(); await settle();
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    assert.equal([...f.timers.values()][0]?.delay, delay);
    f.tick(); await settle();
  }
  f.validation(async () => 'token'); f.tick(); await settle();
  assert.ok(f.calls.includes('resume')); assert.equal(f.timers.size, 0);
});

test('duplicate reconnect and credential events share one validation', async () => {
  const f = setup(); let finish!: (token: string) => void;
  f.validation(() => new Promise((resolve) => { finish = resolve; }));
  f.recovery.request(); f.recovery.request(); await settle();
  f.recovery.request(); assert.deepEqual(f.calls, ['validate']);
  finish('token'); await settle();
  assert.deepEqual(f.calls, ['validate', 'resume', 'refresh:account-A']);
});

test('late validation cannot resume a backgrounded app or a different account', async () => {
  for (const change of ['background', 'switch', 'logout', 'dispose']) {
    const f = setup(); let finish!: (token: string) => void;
    f.validation(() => new Promise((resolve) => { finish = resolve; }));
    f.recovery.request(); await settle();
    if (change === 'background') { f.foreground(false); f.recovery.suspend(); }
    if (change === 'switch') f.identity('account-B');
    if (change === 'logout') f.identity(undefined);
    if (change === 'dispose') f.recovery.dispose();
    finish('old-token'); await settle();
    assert.deepEqual(f.calls, ['validate'], change); assert.equal(f.timers.size, 0);
  }
});

test('backgrounding and cleanup cancel retries; next foreground starts fresh', async () => {
  const f = setup(); f.validation(async () => { throw new Error('offline'); });
  f.recovery.request(); await settle();
  f.foreground(false); f.recovery.suspend(); assert.equal(f.timers.size, 0);
  f.recovery.request(); await settle(); assert.equal(f.calls.length, 2);
  f.foreground(true); f.validation(async () => 'token');
  f.recovery.request(); await settle(); assert.ok(f.calls.includes('resume'));
  f.recovery.suspend(); f.recovery.dispose(); f.recovery.request(); await settle();
  assert.equal(f.timers.size, 0);
});
