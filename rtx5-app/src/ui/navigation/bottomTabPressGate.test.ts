import assert from 'node:assert/strict';
import test from 'node:test';
import { createBottomTabPressGate } from './bottomTabPressGate';
import { createFastTabVisualController, FAST_TAB_ROUTE_NAMES } from './fastTabVisualController';

test('touch-down activates once despite duplicate press-in and release callbacks', () => {
  const gate = createBottomTabPressGate();
  const release = {};
  gate.beginGesture();
  assert.equal(gate.claimPressIn(), true);
  assert.equal(gate.claimPressIn(), false);
  assert.equal(gate.claimPress(release), false);
  assert.equal(gate.claimPress(release), false);
});

test('every tab reveals synchronously, including immediate A to B to A return taps', () => {
  const gates = Object.fromEntries(FAST_TAB_ROUTE_NAMES.map((route) => [route, createBottomTabPressGate()]));
  const controller = createFastTabVisualController();
  const revealed: string[] = [];
  controller.registerVisualApplier((route) => { if (route) revealed.push(route); });
  for (const route of [...FAST_TAB_ROUTE_NAMES, 'quotes', 'chart', 'quotes'] as const) {
    const gate = gates[route];
    gate.beginGesture();
    assert.equal(gate.claimPressIn(), true);
    const revision = controller.show(route, false);
    assert.equal(revealed.at(-1), route, 'the visible scene changes during touch-down');
    assert.equal(gate.claimPress({}), false, 'finger release must not activate again');
    controller.confirm(revision);
  }
  assert.deepEqual(revealed, [...FAST_TAB_ROUTE_NAMES, 'quotes', 'chart', 'quotes']);
});

test('accessibility clicks remain available after touch gestures without a cooldown', () => {
  const gate = createBottomTabPressGate();
  gate.beginGesture();
  gate.claimPressIn();
  gate.claimPress({});
  assert.equal(gate.claimPress({}), true);
  assert.equal(gate.claimPress({}), true);
  assert.equal(gate.claimPressIn(), true, 'keyboard press-in starts a new gesture');
  assert.equal(gate.claimPress({}), false);
});

test('a cancelled press cannot suppress the next physical touch', () => {
  const gate = createBottomTabPressGate();
  gate.beginGesture();
  gate.claimPressIn();
  gate.beginGesture();
  assert.equal(gate.claimPressIn(), true);
  assert.equal(gate.claimPress({}), false);
});

test('a lifecycle change resets an interrupted gesture before an accessibility click without touch-start', () => {
  let epoch = 0;
  const gate = createBottomTabPressGate(() => epoch);
  gate.claimPressIn();
  epoch += 2; // background followed by foreground
  assert.equal(gate.claimPress({}), true);
  assert.equal(gate.claimPressIn(), true);
  assert.equal(gate.claimPress({}), false, 'ordinary release deduplication still applies');
});
