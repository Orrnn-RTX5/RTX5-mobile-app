import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const apiSource = readFileSync(resolve(process.cwd(), 'src/api/positions/index.ts'), 'utf8');
const wireSource = readFileSync(resolve(process.cwd(), 'src/api/positions/modifyPositionWire.ts'), 'utf8');
const screenSource = readFileSync(resolve(process.cwd(), 'src/features/trade/ModifyPositionScreen.tsx'), 'utf8');
const modifyFunctionSource = apiSource.slice(apiSource.indexOf('modifyPosition: async'));
const modifyPayloadSource =
  wireSource.match(/export type ModifyPositionRequest = Readonly<\{[\s\S]*?\n\}>;/)?.[0] ?? '';

test('modify position uses GTA broker SL/TP PUT contract', () => {
  assert.match(
    modifyFunctionSource,
    /apiClient\(`\/positions\/\$\{normalizedTicket\.path\}`,\s*\{\s*method: 'PUT'/,
  );
  assert.doesNotMatch(modifyFunctionSource, /\/positions\/\$\{ticketId\}\/modify/);
  assert.doesNotMatch(modifyFunctionSource, /method: 'POST'/);
  assert.match(modifyPayloadSource, /price_sl\?: number \| null;/);
  assert.match(modifyPayloadSource, /price_tp\?: number \| null;/);
  assert.doesNotMatch(modifyPayloadSource, /trailing_stop\?:/);
  assert.doesNotMatch(modifyPayloadSource, /trailing_step\?:/);
  assert.match(modifyFunctionSource, /signal: requestOptions\.signal/);
  assert.match(modifyFunctionSource, /timeoutMs: requestOptions\.timeoutMs/);
  assert.match(modifyFunctionSource, /replayAfterAuthRefresh: false/);
  assert.match(modifyFunctionSource, /response\.status !== 200/);
  assert.match(modifyFunctionSource, /parseModifyPositionAck/);
});

test('modify position screen submits exact ticket and only SL/TP through the shared coordinator', () => {
  assert.match(
    screenSource,
    /import \{[\s\S]*?\bsubmitModifyPosition,\s*[\s\S]*?\} from '\.\/modifyPositionCoordinator';/,
  );
  assert.match(
    screenSource,
    /submission = submitModifyPosition\(\{\s*ticket: position\.id,\s*symbol: position\.symbol,\s*accountLogin: resolvedLogin,\s*request: \{\s*price_sl: requestedSl,\s*price_tp: requestedTp,\s*\},\s*\}\);/,
  );
  assert.doesNotMatch(screenSource, /positionsApi\.modifyPosition/);
  assert.doesNotMatch(screenSource, /trailing_stop: 0/);
  assert.doesNotMatch(screenSource, /trailing_step: 0/);
});

test('modify position screen dispatches before close and leaves mutation ownership to the shared coordinator', () => {
  const handlerStart = screenSource.indexOf('const handleModify = () =>');
  const handlerEnd = screenSource.indexOf('// Inactive retained layers', handlerStart);
  const submitSource = screenSource.slice(handlerStart, handlerEnd);
  const requestIndex = submitSource.indexOf('submission = submitModifyPosition({');
  const hideIndex = submitSource.indexOf('handleBack();', requestIndex);
  const yieldIndex = submitSource.indexOf('runAfterModifyClosePaint(() =>', hideIndex);
  const resultIndex = submitSource.indexOf('void submission', yieldIndex);

  assert.ok(requestIndex > -1);
  assert.ok(hideIndex > -1);
  assert.ok(requestIndex < hideIndex);
  assert.ok(hideIndex < yieldIndex);
  assert.ok(yieldIndex < resultIndex);
  assert.match(
    submitSource,
    /void submission\s*\.then\(\(result\) => \{[\s\S]*result\.status === 'saved'[\s\S]*result\.status === 'rejected'[\s\S]*result\.status === 'position_unavailable'[\s\S]*result\.status === 'changed_elsewhere'[\s\S]*result\.status === 'rate_limited'/,
  );
  assert.match(
    submitSource,
    /try \{[\s\S]*const preferences = useUserPreferences\.getState\(\)[\s\S]*\} catch \{[\s\S]*must never cancel\/rollback/,
  );
  assert.doesNotMatch(submitSource, /positionsApi\.modifyPosition/);
  assert.doesNotMatch(submitSource, /applyLocalStopPatch|readModifiedStopValue|positionSnapshots:/);
  assert.doesNotMatch(submitSource, /AbortController|abortController|\.abort\(\)|signal:/);
  assert.doesNotMatch(submitSource, /Promise\.race|timeoutPromise|MODIFY_CONFIRMATION_TIMEOUT_MS/);
  assert.doesNotMatch(submitSource, /\bawait\b/);
});

test('modify position submit is docked outside the scroll view and activates on touch-down', () => {
  assert.match(screenSource, /const modifySubmittingRef = useRef\(false\)/);
  assert.match(
    screenSource,
    /if \(modifySubmittingRef\.current \|\| coordinatorBusy\) \{\s*return;\s*\}/,
  );
  assert.match(screenSource, /modifySubmittingRef\.current = true/);
  assert.match(
    screenSource,
    /submission = submitModifyPosition\([\s\S]*\} catch \{[\s\S]*modifySubmittingRef\.current = false/,
  );
  assert.match(
    screenSource,
    /\.finally\(\(\) => \{\s*modifySubmittingRef\.current = false;\s*\}\)/,
  );
  assert.doesNotMatch(screenSource, /modifyPositionIdsInFlight/);
  const scrollCloseIndex = screenSource.lastIndexOf('</ScrollView>');
  const submitButtonIndex = screenSource.indexOf('testID="modify-position-submit"');
  assert.ok(scrollCloseIndex > -1);
  assert.ok(submitButtonIndex > scrollCloseIndex);
  assert.match(screenSource, /onPress=\{handleModify\}[\s\S]*activateOnTouchStart[\s\S]*activateOnPressIn[\s\S]*latencyLabel="modifyPosition\.submit"/);
  assert.match(
    screenSource,
    /requestAnimationFrame\(\(\) => \{[\s\S]*setTimeout\(action, 0\)/,
  );
});

test('contract v3 modify acknowledgement echoes only sent fields plus state_version', async () => {
  const { parseModifyPositionAck } = await import('./modifyPositionWire');
  // Contract 6.2 example response for request {"price_sl":1.13,"price_tp":null}.
  const ack = parseModifyPositionAck(
    {
      ticket: 2002,
      symbol: 'EURUSD',
      status: 'modified',
      time: 1790241700,
      state_version: '5',
      sl: 1.13,
      price_sl: 1.13,
      tp: null,
      price_tp: null,
    },
    { ticket: 2002, symbol: 'EURUSD', request: { price_sl: 1.13, price_tp: null } },
  );
  assert.equal(ack.price_sl, 1.13);
  assert.equal(ack.price_tp, null);
  assert.equal(ack.state_version, '5');

  // Only SL sent: the response carries no tp/price_tp and must still parse.
  const slOnly = parseModifyPositionAck(
    { ticket: 2002, symbol: 'EURUSD', status: 'modified', time: 1790241700, state_version: '6', sl: 1.12, price_sl: 1.12 },
    { ticket: 2002, symbol: 'EURUSD', request: { price_sl: 1.12 } },
  );
  assert.equal(slOnly.price_sl, 1.12);
  assert.equal(Object.hasOwn(slOnly, 'price_tp'), false);

  // A sent field must still match exactly.
  assert.throws(() => parseModifyPositionAck(
    { ticket: 2002, symbol: 'EURUSD', status: 'modified', time: 1790241700, sl: 1.11, price_sl: 1.11 },
    { ticket: 2002, symbol: 'EURUSD', request: { price_sl: 1.12 } },
  ));
});
