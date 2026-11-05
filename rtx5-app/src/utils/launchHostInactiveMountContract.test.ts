import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('inactive root launch hosts keep only their lightweight wrapper mounted', () => {
  const brokerDetailHost = readSource('src/features/settings/BrokerDetailLaunchHost.tsx');
  const registerHost = readSource('src/features/settings/RegisterLaunchHost.tsx');
  const brokersHost = readSource('src/features/settings/BrokersLaunchHost.tsx');
  const orderTicketHost = readSource('src/features/trade/OrderTicketLaunchHost.tsx');

  assert.match(
    brokerDetailHost,
    /\{renderVisible \? \(\s*<BrokerDetailLaunchShell[\s\S]*?\) : null\}/,
  );
  assert.match(
    registerHost,
    /\{renderVisible \? \(\s*<RegisterHandoffPreview[\s\S]*?\) : null\}/,
  );
  assert.match(
    brokersHost,
    /\{renderVisible \? \(\s*<BrokersLaunchShell[\s\S]*?\) : null\}/,
  );
  assert.match(
    orderTicketHost,
    /\{snapshot\.visible \? \(\s*<OrderTicketLaunchShell[\s\S]*?\) : null\}/,
  );
});
