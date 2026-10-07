import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createChartWindowRadialMenuRequest,
  isChartWindowRadialMenuRequestConfirmed,
  mapChartWindowGestureToMenuAnchor,
  resolveChartWindowPaneGesture,
} from './chartWindowRadialMenu';

const gesturePayload = {
  x: 75,
  y: 40,
  width: 300,
  height: 200,
  price: 4386.03,
  dataContextKey: 'session:XAUUSD:M5',
  dataGeneration: 7,
};
const ownerCredentialScopeKey = 'session:7:credential-a';

test('preview gestures require the exact painted data context and generation', () => {
  assert.equal(
    resolveChartWindowPaneGesture(gesturePayload, 'session:BTCUSD:M5', 7, ownerCredentialScopeKey),
    null,
  );
  assert.equal(
    resolveChartWindowPaneGesture(gesturePayload, 'session:XAUUSD:M5', 8, ownerCredentialScopeKey),
    null,
  );
  assert.deepEqual(
    resolveChartWindowPaneGesture(gesturePayload, 'session:XAUUSD:M5', 7, ownerCredentialScopeKey),
    { ...gesturePayload, ownerCredentialScopeKey },
  );
});

test('auxiliary tap coordinates map proportionally into the selected full chart', () => {
  const gesture = resolveChartWindowPaneGesture(
    gesturePayload,
    'session:XAUUSD:M5',
    7,
    ownerCredentialScopeKey,
  );
  assert.ok(gesture);
  assert.deepEqual(
    mapChartWindowGestureToMenuAnchor(gesture, { width: 600, height: 400 }),
    { x: 150, y: 80, price: 4386.03 },
  );
});

test('radial request must still match the transactionally confirmed pane context', () => {
  const pane = { id: 'chart-window-2', symbol: 'XAUUSD', timeframe: 'M5' } as const;
  const gesture = resolveChartWindowPaneGesture(
    gesturePayload,
    'session:XAUUSD:M5',
    7,
    ownerCredentialScopeKey,
  );
  assert.ok(gesture);
  const request = createChartWindowRadialMenuRequest(pane, gesture);

  assert.equal(
    isChartWindowRadialMenuRequestConfirmed(request, pane, {
      symbol: 'XAUUSD',
      timeframe: 'M5',
    }),
    true,
  );
  assert.equal(
    isChartWindowRadialMenuRequestConfirmed(
      request,
      pane,
      { symbol: 'XAUUSD', timeframe: 'M5' },
      'session:8:credential-b',
    ),
    false,
  );
  assert.equal(
    isChartWindowRadialMenuRequestConfirmed(request, pane, {
      symbol: 'BTCUSD',
      timeframe: 'M5',
    }),
    false,
  );
});
