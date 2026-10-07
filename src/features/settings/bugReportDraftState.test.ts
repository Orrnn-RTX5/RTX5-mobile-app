import assert from 'node:assert/strict';
import test from 'node:test';
import { clearBugReportDraft, createBugReportSubmissionGate, readBugReportDraft, saveBugReportDraft } from './bugReportDraftState';
import type { BugReportDraft } from '../../api/bugReports';

test('double taps cannot schedule concurrent preflights/submissions and lock releases on failure', async () => {
  const gate = createBugReportSubmissionGate(); let sends = 0;
  let finish!: () => void;
  const preflight = new Promise<void>((resolve) => { finish = resolve; });
  const first = gate.run(async () => { await preflight; sends++; });
  assert.equal(gate.isBusy(), true);
  assert.equal(await gate.run(async () => { sends++; }), false);
  assert.equal(sends, 0); finish(); assert.equal(await first, true); assert.equal(sends, 1);
  await assert.rejects(() => gate.run(async () => { throw new Error('offline'); }), /offline/);
  assert.equal(gate.isBusy(), false);
  assert.equal(await gate.run(async () => { sends++; }), true); assert.equal(sends, 2);
});
test('draft and ordered attachments survive auth recovery and remain isolated by broker/account', () => {
  const draft: BugReportDraft = { title: 'Chart freezes', description: 'Quotes continue updating', category: 'market_data', severity: 'high', attachments: [{ uri: 'file:///scrubbed.txt', name: 'log.txt', mimeType: 'text/plain', size: 100, contentVerified: true, reviewed: true }] };
  saveBugReportDraft('broker-a:100', draft);
  assert.equal(readBugReportDraft('broker-b:100'), undefined);
  assert.equal(readBugReportDraft('signed-out'), undefined);
  assert.deepEqual(readBugReportDraft('broker-a:100'), draft);
  clearBugReportDraft('broker-a:100'); assert.equal(readBugReportDraft('broker-a:100'), undefined);
});
