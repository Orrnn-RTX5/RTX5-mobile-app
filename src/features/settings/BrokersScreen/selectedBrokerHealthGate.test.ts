import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SELECTED_BROKER_UNAVAILABLE_MESSAGE,
  buildSelectedBrokerHealthUrl,
  createSelectedBrokerHealthGate,
  probeSelectedBrokerHealth,
} from './selectedBrokerHealthGate';

test('selected broker health URL maps service root and REST base to /health', () => {
  assert.equal(
    buildSelectedBrokerHealthUrl('https://services.growtradingacademy.com'),
    'https://services.growtradingacademy.com/health',
  );
  assert.equal(
    buildSelectedBrokerHealthUrl('https://services.myprop.trade/'),
    'https://services.myprop.trade/health',
  );
  assert.equal(
    buildSelectedBrokerHealthUrl('https://services.myprop.trade/api/v2'),
    'https://services.myprop.trade/health',
  );
  assert.equal(
    buildSelectedBrokerHealthUrl('https://demobackend.orrnn.com'),
    'https://demobackend.orrnn.com/health',
  );
  assert.equal(buildSelectedBrokerHealthUrl('http://203.0.113.10'), '');
  assert.equal(buildSelectedBrokerHealthUrl(''), '');
});

test('selected broker probe uses only the selected server and requires an HTTP success', async () => {
  const requestedUrls: string[] = [];
  const available = await probeSelectedBrokerHealth(
    'https://services.myprop.trade',
    async (healthUrl) => {
      requestedUrls.push(healthUrl);
      return { ok: true };
    },
  );

  assert.equal(available, true);
  assert.deepEqual(requestedUrls, ['https://services.myprop.trade/health']);
  assert.equal(
    await probeSelectedBrokerHealth(
      'https://services.myprop.trade',
      async () => ({ ok: false }),
    ),
    false,
  );
  assert.equal(
    await probeSelectedBrokerHealth(
      'https://services.myprop.trade',
      async () => { throw new Error('offline'); },
    ),
    false,
  );
});

test('selected broker probe retries a timeout once but never an HTTP or network failure', async () => {
  const timeout = () => Object.assign(new Error('Request timed out after 3000ms'), { name: 'AbortError' });
  let calls = 0;
  assert.equal(
    await probeSelectedBrokerHealth('https://service.orrnn.com', async () => {
      calls += 1;
      if (calls === 1) throw timeout();
      return { ok: true };
    }),
    true,
  );
  assert.equal(calls, 2);

  calls = 0;
  assert.equal(
    await probeSelectedBrokerHealth('https://service.orrnn.com', async () => {
      calls += 1;
      throw timeout();
    }),
    false,
  );
  assert.equal(calls, 2);

  calls = 0;
  assert.equal(
    await probeSelectedBrokerHealth('https://service.orrnn.com', async () => {
      calls += 1;
      throw new Error('offline');
    }),
    false,
  );
  assert.equal(calls, 1);

  calls = 0;
  assert.equal(
    await probeSelectedBrokerHealth('https://service.orrnn.com', async () => {
      calls += 1;
      return { ok: false };
    }),
    false,
  );
  assert.equal(calls, 1);
});

test('failed selected broker health leaves login closed and reports the exact message', async () => {
  const opened: string[] = [];
  const unavailableMessages: string[] = [];
  const gate = createSelectedBrokerHealthGate(async () => false);

  const result = await gate.run({
    serverUrl: 'https://services.growtradingacademy.com',
    onAvailable: () => opened.push('login'),
    onUnavailable: () => unavailableMessages.push(SELECTED_BROKER_UNAVAILABLE_MESSAGE),
  });

  assert.equal(result, 'unavailable');
  assert.deepEqual(opened, []);
  assert.deepEqual(unavailableMessages, ['Selected broker is unavailable']);
  assert.equal(gate.isPending(), false);
});

test('successful selected broker health opens the exact selected row once', async () => {
  const probedServerUrls: string[] = [];
  const openedServerUrls: string[] = [];
  const selectedServerUrl = 'https://demobackend.orrnn.com';
  const gate = createSelectedBrokerHealthGate(async (serverUrl) => {
    probedServerUrls.push(serverUrl);
    return true;
  });

  const result = await gate.run({
    serverUrl: selectedServerUrl,
    onAvailable: () => openedServerUrls.push(selectedServerUrl),
    onUnavailable: () => assert.fail('healthy broker must not report unavailable'),
  });

  assert.equal(result, 'opened');
  assert.deepEqual(probedServerUrls, [selectedServerUrl]);
  assert.deepEqual(openedServerUrls, [selectedServerUrl]);
});

test('double taps cannot start a second health probe or open login twice', async () => {
  let finishProbe!: (available: boolean) => void;
  let probeCount = 0;
  let openCount = 0;
  const gate = createSelectedBrokerHealthGate(() => {
    probeCount += 1;
    return new Promise<boolean>((resolve) => {
      finishProbe = resolve;
    });
  });
  const request = {
    serverUrl: 'https://services.growtradingacademy.com',
    onAvailable: () => { openCount += 1; },
    onUnavailable: () => assert.fail('healthy broker must not report unavailable'),
  };

  const first = gate.run(request);
  const second = await gate.run(request);
  assert.equal(second, 'ignored');
  assert.equal(probeCount, 1);
  assert.equal(openCount, 0);

  finishProbe(true);
  assert.equal(await first, 'opened');
  assert.equal(openCount, 1);
  assert.equal(gate.isPending(), false);
});
