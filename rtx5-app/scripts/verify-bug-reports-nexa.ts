/** Read-only by default. Resolves Nexa through the app's configured broker discovery. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

async function main() {
  config({ path: '.env.local' }); config({ path: '.env' });
  const { getBrokerDirectory } = await import('../src/api/broker');
  const { resolveBrokerEndpointSet, toBrokerServiceRoot } = await import('../src/api/brokerRouting');
  const { loadBugReportOptions, submitBugReport } = await import('../src/api/bugReports');
  const outputPath = resolve(process.argv[2] ?? '../.codex-artifacts/bug-report-nexa-validation.json');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  const record: Record<string, unknown> = {
    tested_at: new Date().toISOString(), mobile_revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    working_tree: 'uncommitted', package_version: pkg.version, expo_version: app.version,
    android_build: app.android?.versionCode, ios_build: app.ios?.buildNumber,
    execution: 'Node diagnostic using app broker discovery and report API service; not a device UI test',
    backend_revision: 'not exposed/verified', support_visibility: 'not verified', requests: [],
  };
  const requests = record.requests as Array<Record<string, unknown>>;
  try {
    const directory = await getBrokerDirectory();
    const nexa = directory.selectableServers.find((server) => server.broker_id.toLowerCase() === 'nexa');
    if (!nexa) throw new Error('Configured discovery did not return a validated selectable Nexa gateway.');
    const resolution = resolveBrokerEndpointSet(nexa);
    if (!resolution.ok) throw new Error('Configured Nexa gateway failed endpoint validation.');
    const base = resolution.endpoints.apiBase;
    record.gateway = base; record.configuration_version = resolution.endpoints.configVersion;
    const token = process.env.RTX5_NEXA_ACCESS_TOKEN;
    record.authenticated = !!token;
    const request = async (endpoint: string, init: RequestInit = {}) => {
      const url = `${base}${endpoint}`;
      const headers = new Headers(init.headers); headers.set('Accept', 'application/json');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(180000) });
      requests.push({ method: init.method ?? 'GET', url, status: response.status });
      return response;
    };
    const healthUrl = `${toBrokerServiceRoot(base)}/health`;
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
      requests.push({ method: 'GET', url: healthUrl, status: response.status });
      const health = await response.json() as Record<string, unknown>;
      for (const key of ['revision', 'git_sha', 'commit', 'build_version', 'version']) {
        if (typeof health[key] === 'string' || typeof health[key] === 'number') record[`backend_${key}`] = health[key];
      }
    } catch { record.health = 'unavailable or non-JSON'; }
    const options = await loadBugReportOptions({ request });
    record.options = options;
    record.result = options.enabled ? 'Authenticated options confirmed; report POST not requested.' : 'Reporting disabled by broker.';
    // A trader test session and an explicit smoke-test flag are required to create a support report.
    if (token && options.enabled && process.env.RTX5_NEXA_BUG_REPORT_SMOKE === '1') {
      const receipt = await submitBugReport({
        title: 'RTX Mobile preproduction integration smoke test',
        description: 'Authorized Nexa-first verification of the mobile gateway multipart contract. Test report without attachments.',
        category: options.categories.find((item) => item.value === 'other')?.value ?? options.categories[0].value,
        severity: options.severities.find((item) => item.value === 'low')?.value ?? options.severities[0].value,
        context: { app_version: `RTX Mobile ${app.version} (integration probe)`, page: 'RTX Mobile / Integration verification', browser: '' },
      }, { formOptions: options, api: { request } });
      record.receipt = receipt; record.result = 'Live gateway acceptance confirmed; support-system visibility not verified.';
    }
  } catch {
    // Deliberately do not print arbitrary gateway bodies or exception text that might echo secrets.
    record.result = 'Authenticated Nexa integration not completed. Inspect sanitized request statuses and supply an authorized trader test session if needed.';
  }
  writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
}
void main();
