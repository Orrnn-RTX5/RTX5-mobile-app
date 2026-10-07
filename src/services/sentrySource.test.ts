import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const sentrySource = readFileSync(resolve(process.cwd(), 'src/services/sentry.ts'), 'utf8');

test('Sentry keeps native crash reporting without syncing JS breadcrumbs to native', () => {
  assert.match(sentrySource, /Sentry\.init\(\{/);
  assert.match(sentrySource, /enabled:\s*isSentryEnabled/);
  assert.match(sentrySource, /enableLogs:\s*false/);
  assert.match(sentrySource, /maxBreadcrumbs:\s*0/);
  assert.match(sentrySource, /beforeSend:\s*\(event\) => redactDiagnosticValue\(event\)/);
  assert.match(sentrySource, /Sentry\.captureException\(createRedactedError\(error\)\)/);
  assert.doesNotMatch(sentrySource, /enableNative:\s*false/);
});
