import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

/**
 * Chart Preferences → SHOW ON CHART / scale / trading filters must apply on
 * both iOS and Android through the shared native chart path (no platform fork
 * that leaves a toggle dead on one OS).
 */
test('every Chart Preferences display filter is listed and wired into the native chart', () => {
  const settingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const nativeSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const htmlSource = readSource('src/features/chart/rendering/ChartWebViewHtml.ts');
  const drawingSource = readSource('src/features/chart/plugins/enhancedDrawingToolsString.ts');
  const overlaySource = readSource('src/features/chart/chartOverlays/buildPayload.ts');

  const displayKeys = [
    'showTicker',
    'showOHLC',
    'showQuickTradingButtons',
    'showLivePriceLine',
    'showLastPriceLine',
    'showGrid',
    'periodSeparators',
    'showObjectDescriptions',
    'showTradeLevels',
    'showTradeHistory',
  ] as const;

  for (const key of displayKeys) {
    assert.match(
      settingsSource,
      new RegExp(`key: '${key}'`),
      `ChartSettingsScreen must expose filter ${key}`,
    );
  }

  // Shared RN consumption (both platforms use ChartScreen.native).
  assert.match(nativeSource, /chartDisplay\.showTicker/);
  assert.match(nativeSource, /chartDisplay\.showOHLC/);
  assert.match(nativeSource, /chartDisplay\.showQuickTradingButtons/);
  assert.match(nativeSource, /chartDisplay\.showLivePriceLine/);
  assert.match(nativeSource, /chartDisplay\.showLastPriceLine/);
  assert.match(nativeSource, /chartDisplay\.showGrid/);
  assert.match(nativeSource, /chartDisplay\.periodSeparators/);
  assert.match(nativeSource, /chartDisplay\.showObjectDescriptions/);
  assert.match(nativeSource, /setShowObjectDescriptions\(/);
  assert.ok(
    (nativeSource.match(
      /setShowObjectDescriptions\(\$\{chartDisplay\.showObjectDescriptions === true\}\);[\s\S]{0,180}setSerializedDrawings\(/g,
    ) ?? []).length >= 2,
    'object-description visibility must be applied before both saved-drawing replay paths',
  );
  assert.match(nativeSource, /chartShowOnChart/);
  assert.match(nativeSource, /chartDisplay\.showTradeHistory/);
  assert.match(nativeSource, /buildChartOverlayPayload\([\s\S]*showOnChart: chartShowOnChart/);

  // Trade side filters (buy / sell / SL·TP).
  assert.match(settingsSource, /CHART_TRADE_VISIBILITY_ITEMS\.map/);
  assert.match(settingsSource, /CHART_SHOW_ON_CHART_ITEMS/);
  assert.match(overlaySource, /showOnChart\.buyTrade/);
  assert.match(overlaySource, /showOnChart\.sellTrade/);
  assert.match(overlaySource, /showOnChart\.slTpLevels/);

  // Scale / trading toggles applied through the shared WebView bridge.
  assert.match(settingsSource, /setChartAutoScaleEnabled/);
  assert.match(settingsSource, /handleToggleChartVerticalMovement/);
  assert.match(settingsSource, /setChartOneClickPanelAtBottom/);
  assert.match(nativeSource, /setChartAutoScaleEnabled\(\$\{isChartAutoScaleEnabled\}\)/);
  assert.match(nativeSource, /setVerticalScrollingLocked\(\$\{isVerticalScrollingLocked\}\)/);
  assert.match(nativeSource, /autoScale: isChartAutoScaleEnabled/);

  // Drawing-label preference has a real WebView + manager API (iOS + Android).
  assert.match(htmlSource, /function setShowObjectDescriptions\(enabled\)/);
  assert.match(htmlSource, /window\.setShowObjectDescriptions = setShowObjectDescriptions/);
  assert.match(drawingSource, /setShowObjectDescriptions = function/);
  assert.match(drawingSource, /this\._showObjectDescriptions/);

  // No iOS-only dead branch that skips applying preferences.
  assert.doesNotMatch(
    nativeSource,
    /Platform\.OS === 'ios'[\s\S]{0,80}showObjectDescriptions/,
  );
  assert.doesNotMatch(
    settingsSource,
    /Platform\.OS === 'ios'[\s\S]{0,80}handleToggleChartDisplaySetting/,
  );
});

test('Chart Preferences filter rows wait for release so vertical scrolling cannot toggle them', () => {
  const settingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');
  const toggleRowStart = settingsSource.indexOf('function ToggleRow(');
  const preferenceToggleRowStart = settingsSource.indexOf('function PreferenceToggleRow(');
  const actionPreferenceRowStart = settingsSource.indexOf('function ActionPreferenceRow(');
  const navRowStart = settingsSource.indexOf('function NavRow(');
  const stylesStart = settingsSource.indexOf('function makeStyles(');
  const toggleRowSource = settingsSource.slice(toggleRowStart, preferenceToggleRowStart);
  const preferenceToggleRowSource = settingsSource.slice(
    preferenceToggleRowStart,
    actionPreferenceRowStart,
  );
  const actionPreferenceRowSource = settingsSource.slice(actionPreferenceRowStart, navRowStart);
  const navRowSource = settingsSource.slice(navRowStart, stylesStart);

  assert.notEqual(toggleRowStart, -1);
  assert.notEqual(preferenceToggleRowStart, -1);
  assert.notEqual(actionPreferenceRowStart, -1);
  assert.notEqual(navRowStart, -1);
  assert.notEqual(stylesStart, -1);
  assert.match(toggleRowSource, /onPress=\{\(\) => onValueChange\(!enabled\)\}/);
  assert.match(toggleRowSource, /unstable_pressDelay=\{0\}/);
  assert.match(toggleRowSource, /pointerEvents="none"/);
  assert.doesNotMatch(toggleRowSource, /activateOnPressIn|activateOnTouchStart/);
  assert.match(preferenceToggleRowSource, /onPress=\{\(\) => onValueChange\(!enabled\)\}/);
  assert.match(preferenceToggleRowSource, /unstable_pressDelay=\{0\}/);
  assert.match(preferenceToggleRowSource, /pointerEvents="none"/);
  assert.doesNotMatch(preferenceToggleRowSource, /activateOnPressIn|activateOnTouchStart/);
  assert.match(actionPreferenceRowSource, /onPress=\{onPress\}/);
  assert.doesNotMatch(actionPreferenceRowSource, /activateOnPressIn|activateOnTouchStart/);
  assert.match(navRowSource, /onPress=\{onPress\}/);
  assert.match(navRowSource, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(navRowSource, /activateOnPressIn|activateOnTouchStart/);
  assert.match(settingsSource, /ios_backgroundColor=/);
});
