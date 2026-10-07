import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function assertGuardBefore(block: string, laterMarker: string): void {
  const guardIndex = block.indexOf('requestOrrnnDemoTradeAuth');
  const laterIndex = block.indexOf(laterMarker);
  assert.notEqual(guardIndex, -1, 'shared demo trade guard is missing');
  assert.notEqual(laterIndex, -1, `missing protected operation: ${laterMarker}`);
  assert.ok(guardIndex < laterIndex, `guard must run before ${laterMarker}`);
}

test('all guest trading entry points share one root authentication modal', () => {
  const source = readSource('src/features/trade/tradeAuthPrompt.ts');
  const root = readSource('app/_layout.tsx');
  const host = readSource('src/features/auth/GuestFlowHost.tsx');
  assert.match(source, /openAuthFlow/); assert.doesNotMatch(source, /Alert\.alert/);
  assert.match(root, /<GuestFlowHost \/>/); assert.match(host, /<Modal/);
  assert.match(host, /The order will not be sent automatically/);
});
test('active login and demo routes delegate to the modal and only return one reviewed draft', () => {
  for (const path of ['app/login.tsx', 'app/register.tsx', 'app/register-entry.tsx']) {
    const source = readSource(path); assert.match(source, /export default function SharedAuthenticationEntry\(\) \{ return <AuthEntryScreen/);
  }
  const host = readSource('src/features/auth/GuestFlowHost.tsx');
  assert.match(host, /completeAuthenticatedFlow\(attempt, true, investor\)/);
  assert.match(host, /const investor = captureActiveBrokerSession\(\)\?\.session\.investor === true/);
  const close = sourceBetween(host, 'const close = () =>', 'const submit = async');
  assert.match(close, /void logoutBrokerSession\(\)/);
  assert.doesNotMatch(close, /if \(committedNamespace\.current\)/);
  assert.match(host, /pathname: '\/trade\/order-ticket'/);
  assert.doesNotMatch(host, /placeMarketOrder|placePendingOrder|createDemoAccount|deposit/);
});

test('retained authentication entries cannot redirect Settings or reopen dismissed forms', () => {
  const source = readSource('src/features/auth/AuthEntryScreen.tsx');
  const effect = sourceBetween(source, 'useEffect(() => {', 'return null;');
  assert.match(source, /const focused = useIsFocused\(\)/);
  assert.match(effect, /if \(!context \|\| !focused \|\|/);
  assert.ok(effect.indexOf('!focused') < effect.indexOf('openAuthFlow('));
  assert.ok(effect.indexOf('!focused') < effect.indexOf('router.replace('));
  assert.match(effect, /\[context, form, pathname, focused\]/);
  const host = readSource('src/features/auth/GuestFlowHost.tsx');
  assert.match(host, /if \(retainAuthEntryHandoff\(pathname\)\) return;/);
});

test('Login responds on press-in and starts optional password storage only after secure commit', () => {
  const login = readSource('src/features/auth/LoginAccountScreen.tsx');
  assert.equal((login.match(/activateOnPressIn latencyLabel="auth.login.submit"/g) ?? []).length, 2);
  const host = readSource('src/features/auth/GuestFlowHost.tsx');
  const reset = sourceBetween(host, "setConfig(null); setPassword('');", 'const demoAllowed');
  assert.match(reset, /\}, \[context\]\);/);
  const submit = sourceBetween(host, 'const submit = async', 'const changeBroker');
  assert.ok(submit.indexOf('Keyboard.dismiss()') < submit.indexOf('await authenticateGuest'));
  assert.ok(submit.indexOf('await commitBrokerSession(') < submit.indexOf('setSavedAccountPassword('));
  assert.match(submit, /const submittedPassword = passwordValue\.current; const submittedRemember = rememberValue\.current/);
  assert.match(submit, /submitting.current \|\| \['submitting', 'hydrating'\]\.includes\(currentFlow.screen\)/);
});

test('primary trade entry points guard before navigation, prefetch, or execution', () => {
  const tabs = readSource('app/(tabs)/_layout.tsx');
  const tabPress = sourceBetween(tabs, 'const runTabPress', 'const handleTouchStart');
  assertGuardBefore(tabPress, 'showFastTabVisual');
  assert.match(tabPress, /routeName === 'trade'/);

  const sidebar = readSource('src/ui/components/SidebarDrawer.tsx');
  const sidebarNavigation = sourceBetween(
    sidebar,
    'const navigateSidebarRoute',
    'const openSupportEmail',
  );
  assertGuardBefore(sidebarNavigation, 'showFastTabVisualForSidebar');
  assert.match(sidebarNavigation, /route === '\/trade'/);

  const quotes = readSource('src/features/quotes/QuotesScreen.tsx');
  const quoteOrder = sourceBetween(
    quotes,
    'const openOrderTicketForSymbol',
    'const quoteTapActionSheetConfigs',
  );
  assertGuardBefore(quoteOrder, 'runQuoteSheetOption');
  assertGuardBefore(quoteOrder, 'prepareOrderTicketLaunch');

  const details = readSource('src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx');
  const detailsTrade = sourceBetween(details, 'const handleTrade', 'const handleTradeNow');
  assertGuardBefore(detailsTrade, 'tradeTapLockRef.current');
  assertGuardBefore(detailsTrade, 'placeOrder(');
  const tradeNow = sourceBetween(details, 'const handleTradeNow', '\n\n  return (');
  assertGuardBefore(tradeNow, 'prefetchOrderTicketData');

  const chart = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');
  const chartTrade = sourceBetween(chart, 'const executeTrade', 'const handleTrade');
  assert.match(
    chartTrade,
    /if \(!resolveSymbolExecutionOwnership\(\)\)[\s\S]*return;[\s\S]*if \(requestOrrnnDemoTradeAuth/,
    'stale chart-window ownership must fail closed before prompting for trade authentication',
  );
  assertGuardBefore(chartTrade, 'resolveCurrentQuoteActionAvailability');
  assertGuardBefore(chartTrade, 'showOrderTicketLaunch');
  assertGuardBefore(chartTrade, 'dispatchChartTradeImmediately');
  assert.doesNotMatch(chart, /const chartTradeActionDisabled = isPublicDemoTradePrompt[\s\S]*\? false/);
  const chartButtons = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx',
  );
  assert.match(chartButtons, /const tradeBlocked = chartTradeActionDisabled \|\| lotInvalid/);
  assert.match(details, /disabled=\{isPending \|\| \(!isPublicDemoTradePrompt/);

  const webChart = readSource('src/features/chart/ChartScreen.web.tsx');
  const webTrade = sourceBetween(
    webChart,
    'const handleTrade',
    '// Micro-component: isolated 4fps render cycle',
  );
  assertGuardBefore(webTrade, 'getCurrentExecutableQuoteState');
  assert.match(webChart, /disabled=\{isPending \|\| !quoteActionAvailability\.allowed\}/);
});

test('order ticket and position mutations guard before validation or API calls', () => {
  const ticket = readSource('src/features/trade/OrderTicketScreen.tsx');
  const market = sourceBetween(ticket, 'const handlePlaceOrder', 'const queryClient');
  const pending = sourceBetween(ticket, 'const handlePlacePendingOrder', 'const rawSpreadPoints');
  assertGuardBefore(market, 'resolveCurrentQuoteAvailability');
  assertGuardBefore(market, 'ordersApi.placeMarketOrder');
  assertGuardBefore(pending, 'isPendingOrderTypeBackendLocked');
  assertGuardBefore(pending, 'ordersApi.placePendingOrder');

  const quickClose = readSource('src/features/trade/closePositionFlow.ts');
  const closeHandler = sourceBetween(quickClose, 'export function closePositionImmediately', '\n}');
  assertGuardBefore(closeHandler, 'resolveSessionQuoteActionAvailability');
  assertGuardBefore(closeHandler, 'positionsApi');

  const bulk = readSource('src/features/trade/BulkOperationScreen.tsx');
  const bulkHandler = sourceBetween(bulk, 'const handleExecute', '\n\n  if (!isScreenFocused)');
  assertGuardBefore(bulkHandler, 'resolveBulkQuoteBlock');
  assertGuardBefore(bulkHandler, 'positionsApi.closePosition');

  const closeScreen = readSource('src/features/trade/ClosePositionScreen.tsx');
  const closeSubmit = sourceBetween(
    closeScreen,
    'const handleClosePosition',
    '// Inactive retained layers',
  );
  assertGuardBefore(closeSubmit, 'getCurrentAvailability');
  assertGuardBefore(closeSubmit, 'positionsApi.closePosition');

  const modifyScreen = readSource('src/features/trade/ModifyPositionScreen.tsx');
  const modifySubmit = sourceBetween(
    modifyScreen,
    'const handleModify',
    '// Inactive retained layers',
  );
  assertGuardBefore(modifySubmit, 'getCurrentClosingMarketPrice');
  assertGuardBefore(modifySubmit, 'submitModifyPosition');

  const nativeChart = readSource('src/features/chart/ChartScreen.native.tsx');
  const chartModify = sourceBetween(
    nativeChart,
    'const commitChartPositionStopLevels',
    'const commitChartTradeSheetStopsForPosition',
  );
  assertGuardBefore(chartModify, 'submitModifyPosition');
  const chartPending = sourceBetween(
    nativeChart,
    'const handleSubmitPendingTradeFromSheet',
    'const handleToggleChartTradeSheetMode',
  );
  assertGuardBefore(chartPending, 'isPendingOrderTypeBackendLocked');
  assertGuardBefore(chartPending, 'ordersApi.placePendingOrder');
});



test('plain login navigates after secure commit; a pending draft still awaits account hydration', () => {
  const host = readSource('src/features/auth/GuestFlowHost.tsx');
  const submit = sourceBetween(host, 'const submit = async', 'const changeBroker');
  assert.match(submit, /onActivated: active => \{\s*if \(!isAuthAttemptCurrent\(attempt\)\) return/);
  assert.match(submit, /hydration = Promise\.resolve\(\)\.then\(\(\) => bootstrapApp\([\s\S]*waitFor: 'trading'/);
  assert.ok(submit.indexOf('await commitBrokerSession(') < submit.indexOf('const hydrated = await (hydration'));
  const dashboard = submit.indexOf('if (completeAuthenticatedLogin(attempt))');
  assert.ok(dashboard > submit.indexOf('await commitBrokerSession('));
  assert.ok(dashboard < submit.indexOf('const hydrated = await (hydration'));
  assert.ok(submit.indexOf("router.replace('/(tabs)/quotes')", dashboard) < submit.indexOf('hydration = Promise.resolve()'));
  assert.match(submit, /\}, authorization\.current\);\s*if \(didNavigate\) return;\s*committedNamespace\.current = capture\.session\.cacheNamespace/);
  assert.doesNotMatch(submit, /getBrokerDirectoryForBroker/);
  assert.match(submit, /verifiedContext: selected/);
  assert.doesNotMatch(submit, /await (?:setSavedAccountPassword|removeSavedAccountPassword)/);
  assert.ok(submit.indexOf('const hydrated = await (hydration') < submit.indexOf('!acceptTradingHydration('));
  assert.ok(submit.indexOf('!acceptTradingHydration(') < submit.indexOf('completeAuthenticatedFlow('));
});
