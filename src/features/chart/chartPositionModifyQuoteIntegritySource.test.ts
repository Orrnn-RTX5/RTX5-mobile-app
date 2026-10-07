import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
  'utf8',
);

test('native chart position SL/TP modification is live-quote and owner-provenance guarded', () => {
  const start = source.indexOf('const commitChartPositionStopLevels = useCallback');
  const end = source.indexOf('const commitChartTradeSheetStopsForPosition', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = source.slice(start, end);

  assert.match(body, /resolveSessionQuoteActionAvailability\(chartLiveQuote, Date\.now\(\)\)/);
  assert.match(body, /quoteActionBlockMessage\(quoteAvailability\)/);
  assert.match(body, /captureModifyPositionSessionKey\(\)/);
  assert.match(body, /isModifyPositionSessionKeyCurrent\(modifySessionKey\)/);
  assert.match(body, /position\.side === 'buy'[\s\S]*quoteAvailability\.bid[\s\S]*quoteAvailability\.ask/);
  assert.match(
    body,
    /String\(accountLogin\) !== sessionCapture\.session\.accountLogin[\s\S]*!isModifySessionCurrent\(\)/,
  );
  assert.match(
    body,
    /submitModifyPosition\(\{[\s\S]*ticket: position\.id,[\s\S]*accountLogin: sessionCapture\.session\.accountLogin/,
  );
  assert.doesNotMatch(body, /positionsApi\.modifyPosition|applyLocalStopPatch|AbortController/);
  assert.doesNotMatch(body, /accountDetails\?\.credentials\?\.accessToken/);
});
