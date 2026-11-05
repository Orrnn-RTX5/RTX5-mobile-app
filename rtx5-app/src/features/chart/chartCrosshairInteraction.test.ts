import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { extractFunctionBody } from './testing/chartStabilityTestUtils';

const html = readFileSync(resolve(process.cwd(), 'src/features/chart/rendering/ChartWebViewHtml.ts'), 'utf8');
const resolveInteractions = new Function('window', 'lastInitHostOptions', 'enabled', `
  function cloneSerializableValue(value) { return JSON.parse(JSON.stringify(value)); }
  function isCrosshairInteractionActive() { ${extractFunctionBody(html, 'isCrosshairInteractionActive')} }
  function isDrawingToolInteractionActive() { ${extractFunctionBody(html, 'isDrawingToolInteractionActive')} }
  function resolveChartTouchInteractionOptions(enabled) { ${extractFunctionBody(html, 'resolveChartTouchInteractionOptions')} }
  return resolveChartTouchInteractionOptions(enabled);
`);

test('restoring temporary touch ownership cannot unlock an active Cross cursor', () => {
  const hostOptions = {
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: false } },
  };
  const original = JSON.parse(JSON.stringify(hostOptions));
  let tool = 'crosshair';
  const window = { _drawingManager: { getActiveTool: () => tool, _isDrawingToolActive: () => false } };
  const locked = resolveInteractions(window, hostOptions, true);
  assert.ok(Object.values(locked.handleScroll).every((value) => value === false));
  assert.ok(Object.values(locked.handleScale).every((value) => value === false));
  tool = 'none';
  assert.deepEqual(resolveInteractions(window, hostOptions, true), hostOptions);
  assert.deepEqual(hostOptions, original);
  const suspended = resolveInteractions(window, hostOptions, false);
  assert.ok(Object.values(suspended.handleScroll).every((value) => value === false));
  assert.ok(Object.values(suspended.handleScale).every((value) => value === false));
});

test('Cross bypasses the owned pan, axis and pinch-recovery handlers without cancelling cursor input', () => {
  for (const name of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'settlePinchPriceScale']) {
    const body = extractFunctionBody(html.replace(`var ${name} = function(`, `function ${name}(`), name);
    const guard = body.indexOf('if (isCrosshairInteractionActive())');
    assert.ok(guard >= 0, `${name} must respect Cross ownership`);
    const returnAt = body.indexOf('return;', guard);
    assert.ok(returnAt >= 0);
    assert.doesNotMatch(body.slice(guard, returnAt), /stopChartEvent|preventDefault|stopPropagation/);
  }
});
