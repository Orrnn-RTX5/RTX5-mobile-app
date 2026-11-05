import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';
async function main() {
  config({ path: '.env.local' }); config({ path: '.env' });
  const { getBrokerDirectory } = await import('../src/api/broker');
  const { createPublicBrokerContext } = await import('../src/state/publicBrokerContext');
  const evidence: Record<string, unknown> = { collectedAt: new Date().toISOString(), sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), candidateBuild: 'Not supplied; integration release validation incomplete', appVersion: JSON.parse(readFileSync('app.json', 'utf8')).expo.version,
    references: { web: '4736f223abc5923396dd33ada8dd033c2b609783', backend: '3d2d9597e2fc2794d9a65314c28013f90c6519ea', admin: 'f00b8a48f6911bb6c1a8154e0091251387f01391' },
    configuration: Object.fromEntries(['EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL', 'EXPO_PUBLIC_ADDITIONAL_BROKER_DIRECTORY_BASE_URL', 'EXPO_PUBLIC_ADDITIONAL_BROKER_IDS'].map(key => [key, process.env[key] ?? 'unset'])),
    automaticOrderRequests: 0, backendAdminChecks: 'Incomplete: admin access and candidate build/revision not supplied', deviceChecks: 'Incomplete: device/build results must be recorded separately' };
  try {
    const directory = await getBrokerDirectory(); const record = directory.selectableServers.find(row => row.broker_id === 'Nexa');
    evidence.brokerIds = directory.selectableServers.map(row => row.broker_id);
    if (!record) throw new Error('Nexa not available');
    const context = createPublicBrokerContext(record);
    evidence.resolvedBroker = { brokerId: context.brokerId, apiBase: context.apiBase, extendedApiBase: context.extendedApiBase, feedWsBase: context.feedWsBase, candleWsBase: context.candleWsBase, feedBrokerId: context.feedBrokerId, configVersion: context.configVersion };
    const probes: Record<string, unknown> = {};
    for (const path of ['/health', '/broker/config?broker_id=Nexa', '/instruments', '/quotes']) {
      const endpoint = path === '/health' ? context.apiBase.replace(/\/api\/v2$/, '') + path : context.apiBase + path;
      try {
        const response = await fetch(endpoint, { credentials: 'omit', headers: { 'X-Broker-ID': context.brokerId, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
        const data: any = await response.json().catch(() => null);
        const info: Record<string, unknown> = { httpStatus: response.status };
        if (path === '/health') info.revision = Object.fromEntries(['revision', 'git_sha', 'commit', 'version', 'build_version'].filter(key => typeof data?.[key] === 'string').map(key => [key, data[key]]));
        if (path.startsWith('/broker/config')) info.capabilities = { registration_enabled: data?.registration_enabled, demo_registration_enabled: data?.demo_registration_enabled };
        if (path === '/instruments' || path === '/quotes') { const rows = Array.isArray(data) ? data : data?.[path.slice(1)] ?? data?.data; info.rowCount = Array.isArray(rows) ? rows.length : null; }
        probes[path] = info;
      } catch { probes[path] = { result: 'unavailable' }; }
    }
    evidence.anonymousRest = probes;
    evidence.result = 'Read-only discovery/probes completed; deployed revision, admin A/B deposit/group/policy and broker-isolation checks remain incomplete. No registration or trades attempted.';
  } catch { evidence.result = 'Nexa discovery unavailable. Integration validation incomplete; no registration, configuration mutation or trades attempted.'; }
  const outputDirectory = resolve('../.codex-artifacts'); mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'guest-flow-nexa-validation.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
}
void main();
