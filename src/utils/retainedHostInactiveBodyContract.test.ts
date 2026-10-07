import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createChartConfigDestinationController } from '../features/chart/chartConfigDestinationController';
import { createChartSettingsHostController } from '../features/chart/chartSettingsHostController';
import { createHistoryFilterHostController } from '../features/history/historyFilterHostController';
import { createAboutDetailDestinationController } from '../features/settings/aboutDetailDestinationController';
import { createTradePositionActionHostController } from '../features/trade/tradePositionActionHostController';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('retained launch shells keep their instant header but drop inactive preview bodies', () => {
  const chartHost = readSource('src/features/chart/ChartActionLaunchHost.tsx');
  const chartShell = readSource('src/features/chart/ChartActionLaunchShell.tsx');
  const quoteHost = readSource('src/features/quotes/QuoteInfoLaunchHost.tsx');
  const quoteShell = readSource('src/features/quotes/QuoteInfoLaunchShell.tsx');

  assert.match(chartHost, /<ChartActionLaunchShell\s+active=\{visualActive\}/);
  assert.match(chartShell, /<View style=\{\[styles\.header/);
  assert.match(chartShell, /\{active \? \(\s*destination === 'objects' \? \(/);
  assert.ok(chartShell.indexOf('<View style={[styles.header') < chartShell.indexOf('{active ? ('));

  assert.equal((quoteHost.match(/<QuoteInfoLaunchShell/g) ?? []).length, 2);
  assert.match(quoteHost, /active=\{propertiesActive\}/);
  assert.match(quoteHost, /active=\{statisticsActive\}/);
  assert.match(quoteShell, /<View style=\{\[styles\.header/);
  assert.match(quoteShell, /\{active \? \(\s*<View style=\{styles\.body\}>/);
  assert.ok(quoteShell.indexOf('<View style={[styles.header') < quoteShell.indexOf('{active ? ('));
});

test('inactive retained hosts keep native layers but unmount full interactive screens', () => {
  const historyHost = readSource('src/features/history/HistoryFilterHost.tsx');
  const chartSettingsHost = readSource('src/features/chart/ChartSettingsHost.tsx');
  const chartConfigHost = readSource('src/features/chart/ChartConfigDestinationHost.tsx');
  const aboutHost = readSource('src/features/settings/AboutDetailDestinationHost.tsx');
  const tradeHost = readSource('src/features/trade/TradePositionActionHost.tsx');

  for (const source of [historyHost, chartSettingsHost, chartConfigHost, aboutHost, tradeHost]) {
    assert.match(source, /registerVisualApplier/);
    assert.match(source, /collapsable=\{false\}/);
  }

  assert.match(historyHost, /\{active \? \(\s*<HistoryFilterScreen[\s\S]*hostedActive/);
  assert.match(chartSettingsHost, /\{active \? \(\s*<ChartSettingsScreen[\s\S]*hostedActive/);

  assert.match(
    chartConfigHost,
    /const mounted = snapshot\.visible && snapshot\.destination === destination/,
  );
  assert.match(chartConfigHost, /\{mounted \? \(\s*<View[\s\S]*onLayout=/);
  assert.match(chartConfigHost, /hostedActive=\{active\}/);
  for (const destination of ['schema-colors', 'price-source', 'open-order-mode', 'alerts']) {
    assert.match(chartConfigHost, new RegExp(`\\{destination === '${destination}' \\? \\(`));
  }
  for (const destination of ['privacy-policy', 'account-deletion', 'contact-developer']) {
    assert.match(aboutHost, new RegExp(`\\{active && destination === '${destination}' \\? \\(`));
  }
  for (const destination of ['close', 'close-by', 'modify']) {
    assert.match(tradeHost, new RegExp(`\\{active && destination === '${destination}' \\? \\(`));
  }
  assert.doesNotMatch(tradeHost, /useState|latched|panelHidden/);
});

test('retained host controllers reveal wrappers only when their body is safe to show', () => {
  const history = createHistoryFilterHostController();
  const historyEvents: string[] = [];
  history.registerVisualApplier((visible) => historyEvents.push(`visual:${visible}`));
  historyEvents.length = 0;
  history.subscribe(() => historyEvents.push(`publish:${history.getSnapshot().visible}`));
  history.show();
  assert.deepEqual(historyEvents, ['visual:true', 'publish:true']);
  historyEvents.length = 0;
  history.hide();
  assert.deepEqual(historyEvents, ['visual:false', 'publish:false']);

  const chartSettings = createChartSettingsHostController();
  const chartSettingsEvents: string[] = [];
  chartSettings.registerVisualApplier((visible) => chartSettingsEvents.push(`visual:${visible}`));
  chartSettingsEvents.length = 0;
  chartSettings.subscribe(() => chartSettingsEvents.push(`publish:${chartSettings.getSnapshot().visible}`));
  chartSettings.show();
  assert.deepEqual(chartSettingsEvents, ['visual:true', 'publish:true']);

  const chartConfig = createChartConfigDestinationController();
  const chartConfigEvents: string[] = [];
  chartConfig.registerVisualApplier((destination) => chartConfigEvents.push(`visual:${destination}`));
  chartConfigEvents.length = 0;
  chartConfig.subscribe(() => {
    const current = chartConfig.getSnapshot();
    chartConfigEvents.push(`publish:${current.destination}:${current.ready}`);
  });
  const chartConfigRevision = chartConfig.show('alerts');
  assert.deepEqual(chartConfigEvents, ['publish:alerts:false']);
  chartConfigEvents.length = 0;
  assert.equal(chartConfig.revealMounted(chartConfigRevision), true);
  assert.deepEqual(chartConfigEvents, ['visual:alerts', 'publish:alerts:true']);

  const about = createAboutDetailDestinationController();
  const aboutEvents: string[] = [];
  about.registerVisualApplier((destination) => aboutEvents.push(`visual:${destination}`));
  aboutEvents.length = 0;
  about.subscribe(() => aboutEvents.push(`publish:${about.getSnapshot().destination}`));
  about.show('privacy-policy');
  assert.deepEqual(aboutEvents, ['visual:privacy-policy', 'publish:privacy-policy']);

  const trade = createTradePositionActionHostController();
  const tradeEvents: string[] = [];
  trade.registerVisualApplier((visible) => tradeEvents.push(`visual:${visible}`));
  tradeEvents.length = 0;
  trade.subscribe(() => tradeEvents.push(`publish:${trade.getSnapshot().destination}`));
  trade.show('modify', 'position-1');
  assert.deepEqual(tradeEvents, ['visual:true', 'publish:modify']);
});
