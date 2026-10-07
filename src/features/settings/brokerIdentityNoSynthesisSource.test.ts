import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('broker browsing never invents domains, server slugs, or authenticated broker ids', () => {
  const data = readSource('src/features/settings/BrokersScreen/brokerData.ts');
  const rows = readSource('src/features/settings/BrokersScreen/brokerDirectoryRows.ts');
  const detail = readSource('src/features/settings/BrokerDetailScreen.tsx');

  assert.doesNotMatch(data, /BROKER_OVERRIDES|formatServerFromName|-Live|metaquotes\.net|flexymarkets\.com/);
  assert.match(rows, /broker\.broker_name\?\.trim\(\) \|\| broker\.broker_id/);
  assert.match(rows, /domain: resolution\.endpoints\.servicesDomain/);
  assert.match(rows, /entry\.kind === 'approved'/);
  assert.match(rows, /selectable: false,[\s\S]*serverUrl: '',[\s\S]*feedStatusUrl: '',[\s\S]*logoUrl: ''/);
  assert.doesNotMatch(rows, /resolveBrokerDomain\(entry\.brokerName|resolveBrokerDomain\(entry\.brokerId/);
  assert.match(detail, /const apiBrokerId = brokerIdSlug[\s\S]*\? brokerIdSlug[\s\S]*: ''/);
  assert.doesNotMatch(detail, /formatServerFromName/);
});
