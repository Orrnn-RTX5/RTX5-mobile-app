import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const assertRegisterLaunchBeforeRegisterPush = (source: string, label: string) => {
  const showIndex = source.indexOf('showRegisterLaunch(');
  const scheduleIndex = source.indexOf('scheduleRegisterLaunchNavigation(', showIndex);
  const registerPushIndex = source.indexOf("pathname: '/register-entry'", scheduleIndex);
  const revisionParamIndex = source.indexOf(
    'registerLaunchRevision: String(registerRevision)',
    registerPushIndex,
  );

  assert.ok(showIndex >= 0, `${label} must reveal the root Register cover`);
  assert.ok(scheduleIndex > showIndex, `${label} must schedule navigation after revealing Register`);
  assert.ok(registerPushIndex > scheduleIndex, `${label} must push Register Entry from the guarded scheduler`);
  assert.ok(revisionParamIndex > registerPushIndex, `${label} must pass the guarded Register revision`);
};
const isActiveSourceFile = (path: string) =>
  !/\.test\./.test(path) &&
  !/SettingsScreen_old\.tsx$|SettingsScreen_restore\.tsx$/.test(path) &&
  !/(^|\/)(tmp_|old_)/.test(path);
const walkSourceFiles = (root: string): string[] => {
  const absoluteRoot = resolve(process.cwd(), root);
  const entries = readdirSync(absoluteRoot);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(absoluteRoot, entry);
    const relativePath = `${root}/${entry}`;
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(relativePath));
    } else if (entry.endsWith('.tsx')) {
      files.push(relativePath);
    }
  }

  return files;
};

const findJsxTagEnd = (source: string, start: number): number => {
  let quote: string | null = null;
  let braceDepth = 0;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (char === '>' && braceDepth === 0) return index;
  }

  return -1;
};

const isJsxOpeningTag = (source: string, index: number, tag: string) => {
  const next = source[index + tag.length + 1];
  const previous = source[index - 1] ?? '\n';
  return (
    (next === ' ' || next === '\n' || next === '\r' || next === '\t' || next === '>') &&
    !/[A-Za-z0-9_$]/.test(previous)
  );
};

const lineNumberAt = (source: string, index: number) => source.slice(0, index).split(/\r?\n/).length;

const collectScrollResponderIssues = (file: string, source: string) => {
  const issues: string[] = [];

  for (const tag of ['ScrollView', 'FlatList', 'SectionList']) {
    let index = 0;
    while ((index = source.indexOf(`<${tag}`, index)) !== -1) {
      if (!isJsxOpeningTag(source, index, tag)) {
        index += tag.length + 1;
        continue;
      }

      const end = findJsxTagEnd(source, index);
      if (end < 0) break;

      const tagSource = source.slice(index, end);
      const line = lineNumberAt(source, index);
      if (!/\bkeyboardShouldPersistTaps=/.test(tagSource)) {
        issues.push(`${file}:${line} ${tag} is missing keyboardShouldPersistTaps="always"`);
      } else if (!/\bkeyboardShouldPersistTaps=(?:"always"|'always'|\{["']always["']\})/.test(tagSource)) {
        issues.push(`${file}:${line} ${tag} must use keyboardShouldPersistTaps="always"`);
      }

      const isHorizontal = /\bhorizontal\b(?:=\{true\})?/.test(tagSource);
      // Accept either the legacy Android-only optimization `={false}` OR
      // the Platform-aware form `={Platform.OS === 'ios'}` which keeps the
      // Android latency win while letting iOS use its default scroll-takeover
      // behavior (otherwise iOS scroll locks when a finger lands on any
      // Pressable child).
      const hasOptimization = /\bcanCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/.test(tagSource);
      if (tag === 'ScrollView' && !isHorizontal && !hasOptimization) {
        issues.push(`${file}:${line} vertical ScrollView is missing canCancelContentTouches={false} or canCancelContentTouches={Platform.OS === 'ios'}`);
      }

      index = end + 1;
    }
  }

  return issues;
};

test('perf monitors are dev-only and warn only above a user-perceptible threshold', () => {
  const apiLatencySource = readSource('src/utils/apiLatency.ts');

  assert.match(apiLatencySource, /const shouldLogApiLatency = [\s\S]*?typeof __DEV__ !== 'undefined' &&\s*__DEV__ &&/);
  assert.match(
    apiLatencySource,
    /if \(sample\.durationMs >= API_FETCH_TIMEOUT_MS\) \{\s*console\.warn\(message\);\s*\} else \{\s*console\.log\(message\);/,
    'only requests that reach the fetch timeout may raise a LogBox warning',
  );
  assert.equal((apiLatencySource.match(/console\.warn\(/g) ?? []).length, 1);
});

test('shared press action budget is capped without touch-down activation by default', () => {
  const latencySource = readSource('src/utils/actionLatency.ts');
  const fastPressSource = readSource('src/ui/components/FastPressable.tsx');

  assert.match(latencySource, /export const APP_ACTION_MAX_LATENCY_MS = 20/);
  assert.match(latencySource, /export const FAST_PRESS_GUARD_RESET_MS = 120/);
  assert.match(latencySource, /requestAnimationFrame/);
  assert.match(latencySource, /first frame took/);
  assert.match(latencySource, /if \(typeof __DEV__ === 'undefined' \|\| !__DEV__\) \{\s*return;/);
  assert.match(
    latencySource,
    /if \(elapsedMs > PERCEPTIBLE_ACTION_LATENCY_MS\) \{\s*console\.warn\(message\);\s*\} else \{\s*console\.log\(message\);/,
    'only a perceptible (>100ms) overrun may raise a LogBox warning',
  );
  assert.match(latencySource, /const STALE_ACTION_LATENCY_SAMPLE_MS = 5000/);
  assert.match(latencySource, /if \(elapsedMs > STALE_ACTION_LATENCY_SAMPLE_MS\) \{/);
  assert.match(latencySource, /export function runImmediateAction/);
  assert.match(latencySource, /export const CRITICAL_TRADE_ACTION_MAX_LATENCY_MS = 10/);
  assert.match(latencySource, /export function runCriticalTradeAction/);
  assert.match(latencySource, /scheduleActionLatencyCheck\(label, startedAtMs, budgetMs\)/);
  assert.match(fastPressSource, /from 'react-native'/);
  assert.match(fastPressSource, /latencyBudgetMs\?: number/);
  assert.match(fastPressSource, /activateOnPressIn\?: boolean/);
  assert.match(fastPressSource, /activateOnTouchStart\?: boolean/);
  assert.match(fastPressSource, /activateOnPressIn = false/);
  assert.match(fastPressSource, /activateOnTouchStart = false/);
  assert.match(fastPressSource, /const DEFAULT_HIT_SLOP = \{ top: 6, bottom: 6, left: 6, right: 6 \} as const/);
  assert.match(fastPressSource, /const DEFAULT_PRESS_RETENTION_OFFSET = \{ top: 20, bottom: 20, left: 20, right: 20 \} as const/);
  assert.match(fastPressSource, /const needsPressInHandler = activateOnPressIn \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /const needsPressHandler = Boolean\(onPress\) \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /const needsTouchStartHandler = activateOnTouchStart \|\| Boolean\(onTouchStart\)/);
  assert.match(fastPressSource, /const needsPressOutHandler = Boolean\(onPressOut\) \|\| activateOnPressIn \|\| activateOnTouchStart \|\| Boolean\(onPressIn\)/);
  assert.match(fastPressSource, /onPressIn=\{needsPressInHandler \? handlePressIn : undefined\}/);
  assert.match(fastPressSource, /onPress=\{needsPressHandler \? handlePress : undefined\}/);
  assert.match(fastPressSource, /onPressOut=\{needsPressOutHandler \? handlePressOut : undefined\}/);
  assert.match(fastPressSource, /onStartShouldSetResponder=\{onStartShouldSetResponder \? handleStartShouldSetResponder : undefined\}/);
  assert.match(fastPressSource, /onResponderGrant=\{onResponderGrant \? handleResponderGrant : undefined\}/);
  assert.match(fastPressSource, /onTouchStart=\{needsTouchStartHandler \? handleTouchStart : undefined\}/);
  assert.match(fastPressSource, /hitSlop=\{hitSlop \?\? DEFAULT_HIT_SLOP\}/);
  assert.match(fastPressSource, /pressRetentionOffset=\{pressRetentionOffset \?\? DEFAULT_PRESS_RETENTION_OFFSET\}/);
  assert.match(fastPressSource, /unstable_pressDelay=\{unstable_pressDelay \?\? 0\}/);
  assert.match(fastPressSource, /android_disableSound=\{props\.android_disableSound \?\? true\}/);
  assert.match(fastPressSource, /handledOnPressInRef\.current = true;\s*if \(onPress !== onPressIn\) \{\s*runPressAction\(onPress, event\);\s*\}/);
  assert.match(fastPressSource, /const handleStartShouldSetResponder = useCallback/);
  assert.match(fastPressSource, /return Boolean\(onStartShouldSetResponder\?\.\(event\)\)/);
  assert.match(fastPressSource, /const deliveredExplicitPressInRef = React\.useRef\(false\)/);
  assert.match(fastPressSource, /if \(onPressIn && \(!pressAlreadyHandled \|\| onPressIn !== onPress\)\) \{\s*deliveredExplicitPressInRef\.current = true;\s*runPressAction\(onPressIn, event\);\s*\}/);
  assert.match(fastPressSource, /if \(activateOnPressIn && onPress && !pressAlreadyHandled\) \{/);
  assert.match(fastPressSource, /if \(activateOnTouchStart && onPress && !pressAlreadyHandled\) \{/);
  assert.match(fastPressSource, /if \(onPress !== onPressIn\) \{/);
  assert.match(fastPressSource, /if \(onPressIn && !deliveredExplicitPressInRef\.current\) \{\s*runPressAction\(onPressIn, event\);\s*\}/);
  assert.match(fastPressSource, /cancelled gestures that never emit onPress/);
  assert.match(fastPressSource, /scheduleActionLatencyCheck\(latencyLabel, startedAtMs, latencyBudgetMs\)/);
  assert.doesNotMatch(fastPressSource, /const pressAction = onPress \?\? onPressIn/);
  assert.doesNotMatch(fastPressSource, /markPressHandledOnTouchDown/);
  assert.doesNotMatch(fastPressSource, /onStartShouldSetResponder=\{activateOnPressIn/);
  assert.doesNotMatch(fastPressSource, /onResponderGrant=\{activateOnPressIn/);
  assert.doesNotMatch(fastPressSource, /onTouchStart=\{activateOnPressIn/);
});

test('screen and shared UI pressables use the immediate fast press component', () => {
  const files = [
    ...walkSourceFiles('app'),
    ...walkSourceFiles('src/features'),
    ...walkSourceFiles('src/ui/components'),
  ].filter(
    (file) =>
      file !== 'src/ui/components/FastPressable.tsx' &&
      file !== 'src/ui/components/OtaUpdateModal.tsx',
  );

  for (const file of files) {
    const source = readSource(file);
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*\bPressable\b[^}]*\}\s*from 'react-native'/,
      `${file} must use FastPressable for Pressable actions`,
    );
  }
});

test('buy and sell actions use the stricter critical trade budget', () => {
  const ticketSource = readSource('src/features/trade/OrderTicketScreen.tsx');
  const symbolDetailsSource = readSource('src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx');
  const chartWebSource = readSource('src/features/chart/ChartScreen.web.tsx');
  const chartTradeHandlerSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');

  assert.match(ticketSource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS, runImmediateAction \} from '..\/..\/utils\/actionLatency'/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{sellTradeAction\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{buyTradeAction\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(ticketSource, /latencyLabel=\{`orderTicket\.exec\.\$\{action\.side\}`\}[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(symbolDetailsSource, /latencyLabel="symbolDetails\.trade\.sell"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(symbolDetailsSource, /latencyLabel="symbolDetails\.trade\.buy"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(chartWebSource, /runCriticalTradeAction\('chart\.web\.trade\.sell'/);
  assert.match(chartWebSource, /runCriticalTradeAction\('chart\.web\.trade\.buy'/);
  assert.match(chartTradeHandlerSource, /runCriticalTradeAction\(`chart\.\$\{variant\}\.trade\.\$\{side\}`/);
});

test('chart trade one-click and ticket paths keep heavy work out of the tap paint', () => {
  const ordersSource = readSource('src/query/orders.ts');
  const placeOrderSource = readSource('src/api/orders/placeMarketOrder.ts');
  const reconciliationSource = readSource('src/api/orders/marketPositionReconciliation.ts');
  const chartTradeHandlerSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts');
  const chartTradeButtonsSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const chartWebSource = readSource('src/features/chart/ChartScreen.web.tsx');
  const openPathStart = chartTradeHandlerSource.indexOf('// ── One-click OFF:');
  const oneClickPathStart = chartTradeHandlerSource.indexOf('// ── One-click ON:');
  assert.notEqual(openPathStart, -1);
  assert.notEqual(oneClickPathStart, -1);
  const openPathSource = chartTradeHandlerSource.slice(openPathStart, oneClickPathStart);
  const oneClickPathEnd = chartTradeHandlerSource.indexOf('\n  const handleTrade', oneClickPathStart);
  assert.notEqual(oneClickPathEnd, -1);
  const oneClickSource = chartTradeHandlerSource.slice(oneClickPathStart, oneClickPathEnd);

  assert.match(ordersSource, /export const usePlaceOrderExecutor = \(\) => \{/);
  assert.match(
    ordersSource,
    /submitPlaceOrderWithCacheUpdate\([\s\S]*queryClient,[\s\S]*payload,[\s\S]*cacheNamespace,[\s\S]*owner/,
  );
  assert.doesNotMatch(ordersSource, /\.upsertPosition\(/);
  assert.match(
    placeOrderSource,
    /beginCoalescedMarketOrderReconciliation\(\{[\s\S]*reconcile: async \(reconciliationEvidence, isBatchCurrent\)[\s\S]*return finalData;[\s\S]*finally \{[\s\S]*reconciliationHandle\?\.finish\(reconciliationResponse\);/,
  );
  assert.doesNotMatch(placeOrderSource, /await reconciliationHandle/);
  assert.match(placeOrderSource, /readPositions: \(\) => positionsApi\.getPositionsForReconciliation\(reconciliationAccountLogin\)/);
  assert.match(reconciliationSource, /await dependencies\.readPositions\(\)/);
  assert.match(
    ordersSource,
    /invalidateSessionQueryRoots\(queryClient, cacheNamespace, \[[\s\S]*'accountSummary'[\s\S]*'transactions'/,
  );
  assert.doesNotMatch(
    ordersSource,
    /invalidateSessionQueryRoots\(queryClient, cacheNamespace, \[[\s\S]*'positions'/,
  );
  assert.match(
    chartTradeHandlerSource,
    /dispatchChartTradeImmediately\(\{[\s\S]*dispatch: dispatchAcceptedChartTrade/,
  );
  assert.match(
    chartSource,
    /chartTradeResultRefreshScheduler\.schedule\([\s\S]*Promise\.allSettled\(\[[\s\S]*refetchClosedPositions\(\)[\s\S]*refetchOrders\(\)/,
  );
  assert.match(
    chartTradeHandlerSource,
    /const isPublicDemoTradePrompt = useUserPreferences\([\s\S]*!state\.isLoggedIn[\s\S]*const chartTradeActionDisabled = resolveChartTradeActionDisabled\(\{[\s\S]*isCurrentChartSymbol,[\s\S]*oneClickAccepted,[\s\S]*quoteActionAllowed,[\s\S]*\}\);/,
  );
  assert.doesNotMatch(openPathSource, /resolveSessionQuoteActionAvailability/);
  assert.match(
    chartTradeHandlerSource,
    /requestOrrnnDemoTradeAuth\(\{[\s\S]*\}\)[\s\S]*const currentQuoteAvailability = resolveCurrentQuoteActionAvailability\(\);[\s\S]*if \(!currentQuoteAvailability\.allowed\)/,
  );
  assert.doesNotMatch(oneClickSource, /resolveSessionQuoteActionAvailability/);
  assert.match(chartTradeHandlerSource, /import \{ usePlaceOrderExecutor \} from '..\/..\/..\/..\/query\/orders'/);
  assert.match(chartTradeHandlerSource, /import \{ getApiLatencyNow \} from '..\/..\/..\/..\/utils\/apiLatency'/);
  assert.match(chartTradeHandlerSource, /const placeOrder = usePlaceOrderExecutor\(\);/);
  assert.doesNotMatch(
    chartTradeHandlerSource,
    /CHART_TRADE_QUEUE_LIMIT|pendingTradeCount|TRADE-QUEUE-FULL|Trade Queue Full/,
  );
  assert.match(chartTradeHandlerSource, /type AcceptedChartTrade = \{/);
  assert.match(
    chartTradeHandlerSource,
    /const dispatchAcceptedChartTrade = \(acceptedTrade: AcceptedChartTrade\) => \{[\s\S]*placeOrder\(payload,/,
  );
  assert.doesNotMatch(
    chartTradeHandlerSource,
    /tradeQueueRef|tradeQueueDrainTimerRef|processNextQueuedTrade|scheduleProcessNextQueuedTrade|queueWaitMs/,
  );
  assert.match(chartTradeHandlerSource, /dispatchDelayMs/);
  assert.match(chartTradeHandlerSource, /backendMs/);
  assert.match(
    oneClickSource,
    /nextChartTradeReceiptId \+= 1;[\s\S]*dispatchChartTradeImmediately\(\{[\s\S]*emitTradeQueueEvent\(trade, 'pending'\);[\s\S]*dispatch: dispatchAcceptedChartTrade/,
  );
  assert.match(
    chartTradeHandlerSource,
    /reportAcceptedTradeResult\([\s\S]*executionEvidence\.confirmed \? 'confirmed' : 'unconfirmed'/,
  );
  assert.match(chartTradeButtonsSource, /disabled=\{tradeBlocked\}/);
  assert.doesNotMatch(
    chartTradeButtonsSource,
    /disabled=\{[^}]*(?:isChartTradeActionBusy|isChartTradeActionVisuallyLocked)/,
  );
  assert.match(chartTradeHandlerSource, /const isChartTradeActionBusy = \(side: TradeSide\) => activeSide === side && tradeTapLockRef\.current;/);
  // Open path: shell first, before auth/volume/SL validation or setState locks.
  assert.match(
    openPathSource,
    /const launchRevision = showOrderTicketLaunch\(symbol, 'chart'\);[\s\S]*scheduleOrderTicketLaunchNavigation\(\s*launchRevision,\s*\(\) => \{[\s\S]*router\.push\(\{[\s\S]*pathname: '\/trade\/order-ticket'[\s\S]*origin: 'chart'/,
  );
  assert.match(
    openPathSource,
    /showOrderTicketLaunch\(symbol, 'chart'\);[\s\S]*tradeTapLockRef\.current = true/,
  );
  assert.match(
    openPathSource,
    /const releaseOpenPathLock = \(\) => \{\s*releaseTradeTapLock\(CHART_TRADE_TAP_RELEASE_DELAY_MS\);\s*\};/,
  );
  assert.match(
    openPathSource,
    /finally \{\s*releaseOpenPathLock\(\);\s*\}[\s\S]*hideOrderTicketLaunch\(launchRevision\);\s*releaseOpenPathLock\(\);/,
  );
  assert.doesNotMatch(openPathSource, /authToken|validateChartTradeProtectionLevels|Invalid Lot Size/);
  assert.match(
    chartWebSource,
    /const launchRevision = showOrderTicketLaunch\(symbol, 'chart'\);[\s\S]*scheduleOrderTicketLaunchNavigation\(launchRevision, \(\) => \{[\s\S]*router\.push\(\{ pathname: '\/trade\/order-ticket'/,
  );
  assert.match(chartTradeHandlerSource, /catch \(navErr: any\) \{[\s\S]*hideOrderTicketLaunch\(launchRevision\)/);
  assert.doesNotMatch(chartTradeHandlerSource, /runAfterChartTradeTapPaint/);
  assert.doesNotMatch(
    oneClickSource,
    /tradeQueueRef|processNextQueuedTrade|scheduleProcessNextQueuedTrade|acquireChartTradeButtonSharedLock|tradeTapLockRef|await /,
  );
  assert.match(oneClickSource, /dispatchChartTradeImmediately\(\{/);
  assert.doesNotMatch(oneClickSource, /releaseTradeTapLock\(CHART_TRADE_TAP_RELEASE_DELAY_MS\)/);
  assert.doesNotMatch(chartTradeHandlerSource, /isPending/);
  assert.doesNotMatch(chartTradeHandlerSource, /usePlaceOrderMutation/);
});

test('trade buy/sell success feedback uses the shared popup without device vibration', () => {
  const ticketSource = readSource('src/features/trade/OrderTicketScreen.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const feedbackModalSource = readSource('src/ui/components/TradeFeedbackModal.tsx');
  const feedbackAutoDismissSource = readSource('src/ui/components/useConfirmedTradeReceiptAutoDismiss.ts');
  const chartResultStart = chartSource.indexOf('const handleChartTradeResult = useCallback');
  const chartResultEnd = chartSource.indexOf('const [showSignalDetails', chartResultStart);
  assert.notEqual(chartResultStart, -1);
  assert.notEqual(chartResultEnd, -1);
  const chartResultSource = chartSource.slice(chartResultStart, chartResultEnd);

  assert.doesNotMatch(ticketSource, /\bVibration\b|\.vibrate\(/);
  assert.doesNotMatch(chartSource, /\bVibration\b|\.vibrate\(/);
  assert.doesNotMatch(feedbackModalSource, /\bVibration\b|\.vibrate\(/);
  assert.match(ticketSource, /without device vibration/);
  assert.match(ticketSource, /const \[tradeConfirmations, setTradeConfirmations\] = useState<OrderTicketTradeConfirmation\[\]>/);
  assert.match(ticketSource, /Market BUY\/SELL executions and broker rejections share one feedback surface/);
  assert.match(
    ticketSource,
    /const successFeedback: TradeFeedbackState = executionEvidence\.confirmed[\s\S]*executionConfirmed:\s*true,[\s\S]*side:\s*requestedSide[\s\S]*symbol:\s*displaySymbol[\s\S]*executedAt:\s*new Date\(\)\.toLocaleTimeString\(\)[\s\S]*executionConfirmed:\s*false,[\s\S]*Confirmation Pending[\s\S]*if \(positionTicket\) \{[\s\S]*successFeedback\.ticket = String\(positionTicket\);[\s\S]*if \(executionPrice !== undefined\) \{[\s\S]*successFeedback\.price = executionPrice;[\s\S]*showModal\(successFeedback\)/,
  );
  assert.doesNotMatch(ticketSource, /showTradeConfirmation\(\{ side: requestedSide/);
  assert.match(ticketSource, /showTradeConfirmation\(\{ side: pendingSideValue, symbol, volume \}\)/);
  assert.match(ticketSource, /Shared RTX5 execution receipt plus detailed rejected\/unconfirmed feedback/);
  assert.match(
    ticketSource,
    /useConfirmedTradeReceiptAutoDismiss\(modalState, handleModalClose\)/,
  );
  assert.match(
    chartSource,
    /useConfirmedTradeReceiptAutoDismiss\(tradeFeedback, handleTradeFeedbackClose\)/,
  );
  assert.match(
    feedbackAutoDismissSource,
    /CONFIRMED_TRADE_RECEIPT_VISIBLE_MS = 5_000[\s\S]*resolveConfirmedTradeReceipt\(state\)[\s\S]*setTimeout\([\s\S]*onClose\(\)[\s\S]*clearTimeout\(timer\)/,
  );
  assert.doesNotMatch(
    feedbackModalSource,
    /import\s*\{[^}]*\bModal\b[^}]*\}\s*from ["']react-native["']/,
  );
  assert.doesNotMatch(feedbackModalSource, /<Modal\b/);
  assert.match(
    feedbackModalSource,
    /if \(receipt\)[\s\S]*tfmStyles\.receiptOverlay[\s\S]*pointerEvents="box-none"/,
  );
  assert.match(
    feedbackModalSource,
    /receiptOverlay:\s*\{[\s\S]*\.\.\.StyleSheet\.absoluteFillObject,[\s\S]*zIndex:\s*10050,[\s\S]*elevation:\s*10050/,
  );
  assert.match(feedbackModalSource, /const receipt = resolveConfirmedTradeReceipt\(state\)/);
  assert.match(
    feedbackModalSource,
    /tfmStyles\.receiptSideTile[\s\S]*tfmStyles\.receiptSymbol[\s\S]*tfmStyles\.receiptVolume[\s\S]*tfmStyles\.receiptDoneButton/,
  );
  assert.doesNotMatch(
    feedbackModalSource,
    /progressAnim|LinearGradient|headerProgress|headerStrip|setTimeout|setInterval|Animated\.loop|Animated\.repeat|tfmStyles\.executionPrice|View Position|router\.push\('\/trade'\)/,
  );
  assert.match(
    chartResultSource,
    /if \(feedback\.type !== 'success'\) \{[\s\S]*setTradeFeedback\(feedback\);[\s\S]*return;[\s\S]*\}[\s\S]*if \(!suppressConfirmedReceipt\) \{[\s\S]*setTradeFeedback\(feedback\);[\s\S]*chartTradeResultRefreshScheduler\.schedule\([\s\S]*Promise\.allSettled\(\[[\s\S]*refetchClosedPositions\(\)[\s\S]*refetchOrders\(\)/,
  );
  assert.doesNotMatch(chartResultSource, /refreshPositions\(/);
  assert.doesNotMatch(chartResultSource, /refetchAccountSummary\(\)/);
  assert.match(
    chartSource,
    /handleChartTradeQueueEvent[\s\S]*chartTradeReceiptStackController\.applyEvent\(event\)[\s\S]*event\.status === 'confirmed'/,
  );
  assert.match(chartSource, /<ChartTradeReceiptStack[\s\S]*controller=\{chartTradeReceiptStackController\}/);
});

test('action destination modules warm without boot-time route prefetch', () => {
  const warmupSource = readSource('src/utils/actionRouteWarmup.ts');
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const rootSource = readSource('app/_layout.tsx');
  const orderTicketRouteSource = readSource('app/trade/order-ticket.tsx');
  const orderTicketLaunchHostSource = readSource('src/features/trade/OrderTicketLaunchHost.tsx');
  const orderTicketLaunchShellSource = readSource('src/features/trade/OrderTicketLaunchShell.tsx');
  const detailsRouteSource = readSource('app/quotes/details.tsx');
  const statisticsRouteSource = readSource('app/quotes/market-statistics.tsx');
  const quoteInfoLaunchHostSource = readSource('src/features/quotes/QuoteInfoLaunchHost.tsx');
  const quoteInfoLaunchShellSource = readSource('src/features/quotes/QuoteInfoLaunchShell.tsx');
  const brokersRouteSource = readSource('app/settings/brokers.tsx');
  const brokersLaunchHostSource = readSource('src/features/settings/BrokersLaunchHost.tsx');
  const brokersLaunchShellSource = readSource('src/features/settings/BrokersLaunchShell.tsx');
  const brokersLaunchControllerSource = readSource('src/features/settings/brokersLaunchController.ts');
  const brokersPreloadSource = readSource('src/features/settings/BrokersScreen/brokersScreenPreload.ts');
  const brokerDetailRouteSource = readSource('app/settings/broker-detail.tsx');
  const brokerDetailLaunchHostSource = readSource('src/features/settings/BrokerDetailLaunchHost.tsx');
  const brokerDetailLaunchShellSource = readSource('src/features/settings/BrokerDetailLaunchShell.tsx');
  const brokerDetailLaunchControllerSource = readSource('src/features/settings/brokerDetailLaunchController.ts');
  const brokerDetailPreloadSource = readSource('src/features/settings/brokerDetailScreenPreload.ts');
  const registerLaunchHostSource = readSource('src/features/settings/RegisterLaunchHost.tsx');
  const registerLaunchControllerSource = readSource('src/features/settings/registerLaunchController.ts');

  assert.match(warmupSource, /const ACTION_DEFERRED_MODULE_WARMUP_DELAY_MS = 180/);
  assert.match(warmupSource, /ACTION_DEFERRED_MODULE_WARMUPS/);
  assert.match(warmupSource, /JOURNAL_ROUTE_CACHE_KEY/);
  assert.match(warmupSource, /preloadDeferredRouteModule\(module\.cacheKey, module\.load\)/);
  assert.match(warmupSource, /createStartupWorkQueue\(/);
  assert.match(warmupSource, /canRun: isStartupBackgroundWorkAllowed/);
  assert.match(warmupSource, /scheduleIdleWork\(work/);
  assert.doesNotMatch(
    warmupSource,
    /ACTION_ROUTE_WARMUP_PATHS|PrefetchRouter|router\.prefetch|\.prefetch\?\.\(/,
  );
  assert.match(tabsSource, /import \{ warmActionRoutes \} from '..\/..\/src\/utils\/actionRouteWarmup'/);
  assert.match(tabsSource, /useEffect\(\(\) => warmActionRoutes\(\), \[\]\)/);
  assert.doesNotMatch(tabsSource, /useRouter|warmActionRoutes\(router\)|router\.prefetch/);
  assert.match(tabsSource, /import \{ OrderTicketLaunchHost \} from/);
  assert.doesNotMatch(tabsSource, /QuoteInfoLaunchHost/);
  assert.doesNotMatch(tabsSource, /SidebarDestinationHost|BrokersLaunchHost|BrokerDetailLaunchHost|RegisterLaunchHost/);
  assert.match(tabsSource, /<OrderTicketLaunchHost \/>[\s\S]*<GlobalActionSheetHost \/>/);
  assert.match(rootSource, /import \{ SidebarDestinationHost \} from/);
  assert.match(rootSource, /import \{ BrokersLaunchHost \} from/);
  assert.match(rootSource, /import \{ BrokerDetailLaunchHost \} from/);
  assert.match(rootSource, /import \{ RegisterLaunchHost \} from/);
  assert.match(rootSource, /import \{ QuoteInfoLaunchHost \} from/);
  assert.match(rootSource, /<\/Stack>[\s\S]*<SidebarDestinationHost \/>[\s\S]*<AboutDetailDestinationHost \/>[\s\S]*<BrokersLaunchHost \/>[\s\S]*<QuoteInfoLaunchHost \/>[\s\S]*<HistoryFilterHost \/>[\s\S]*<TradePositionActionHost \/>[\s\S]*<ChartSettingsHost \/>[\s\S]*<ChartConfigDestinationHost \/>[\s\S]*<SidebarDrawer \/>/);
  assert.match(tabsSource, /lazy: false/);
  assert.doesNotMatch(tabsSource, /lazy: true/);
  assert.match(rootSource, /<Stack\.Screen name='trade\/order-ticket' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='quotes\/details' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='quotes\/market-statistics' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(orderTicketRouteSource, /cacheKey=\{ORDER_TICKET_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(orderTicketRouteSource, /fallback=\{\([\s\S]*<OrderTicketLaunchShell/);
  assert.doesNotMatch(orderTicketRouteSource, /SettingsRouteLaunchPreview/);
  assert.doesNotMatch(orderTicketRouteSource, /mountDelayMs|ROUTE_MOUNT_DELAY_MS/);
  assert.match(orderTicketLaunchHostSource, /executeOnUIRuntimeSync/);
  assert.match(orderTicketLaunchHostSource, /registerVisualApplier\([\s\S]*writeOrderTicketLaunchVisibilityNow/);
  assert.match(orderTicketLaunchHostSource, /<OrderTicketLaunchShell[\s\S]*symbol=\{snapshot\.symbol\}/);
  assert.match(orderTicketLaunchShellSource, /testID="order-ticket-launch-shell"/);
  assert.match(detailsRouteSource, /cacheKey=\{SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(detailsRouteSource, /fallback=\{\([\s\S]*<QuoteInfoLaunchShell[\s\S]*destination="properties"/);
  assert.doesNotMatch(detailsRouteSource, /SettingsRouteLaunchPreview|mountDelayMs|ROUTE_MOUNT_DELAY_MS/);
  assert.match(statisticsRouteSource, /cacheKey=\{MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(statisticsRouteSource, /fallback=\{\([\s\S]*<QuoteInfoLaunchShell[\s\S]*destination="market-statistics"/);
  assert.doesNotMatch(statisticsRouteSource, /SettingsRouteLaunchPreview|mountDelayMs|ROUTE_MOUNT_DELAY_MS/);
  assert.match(quoteInfoLaunchHostSource, /executeOnUIRuntimeSync/);
  assert.match(quoteInfoLaunchHostSource, /destination === 'properties'[\s\S]*destination === 'market-statistics'/);
  assert.match(quoteInfoLaunchHostSource, /registerVisualApplier\([\s\S]*writeQuoteInfoLaunchDestinationNow/);
  assert.match(quoteInfoLaunchHostSource, /testID="quote-info-launch-animated-host"/);
  assert.doesNotMatch(quoteInfoLaunchHostSource, /testID="quote-info-launch-react-host"/);
  assert.equal((quoteInfoLaunchHostSource.match(/<QuoteInfoLaunchShell/g) ?? []).length, 2);
  assert.equal((quoteInfoLaunchHostSource.match(/destination="properties"/g) ?? []).length, 1);
  assert.equal((quoteInfoLaunchHostSource.match(/destination="market-statistics"/g) ?? []).length, 1);
  assert.match(brokersRouteSource, /cacheKey=\{BROKERS_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(brokersRouteSource, /load=\{loadBrokersScreenRoute\}/);
  assert.match(brokersRouteSource, /mountDelayMs=\{0\}/);
  assert.match(brokersRouteSource, /fallback=\{brokersLaunchController\.isVisible\(\) \|\| brokerDetailLaunchController\.isVisible\(\)[\s\S]*\? null[\s\S]*: \([\s\S]*<BrokersLaunchShell/);
  assert.match(brokersRouteSource, /<BrokersLaunchShell[\s\S]*onSelectBroker=\{handleSelectBroker\}/);
  assert.match(brokersRouteSource, /showSidebarDestination\('accounts', 'route-sync'\);[\s\S]*if \(brokersLaunchController\.isVisible\(\)\) \{\s*hideBrokersLaunch\(\);\s*\}[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/quotes'\)/);
  assert.equal(
    (brokersRouteSource.match(/if \(brokersLaunchController\.isVisible\(\)\) \{\s*hideBrokersLaunch\(\);\s*\}/g) ?? []).length,
    1,
    'the Brokers back action avoids redundant hidden-layer writes',
  );
  assert.doesNotMatch(brokersRouteSource, /import \{ BrokersScreen \}/);
  assert.match(brokersPreloadSource, /BROKERS_ROUTE_MODULE_CACHE_KEY = 'settings\/brokers'/);
  assert.match(brokersPreloadSource, /import\('\.\/BrokersScreen'\)/);
  assert.match(warmupSource, /\{ cacheKey: BROKERS_ROUTE_MODULE_CACHE_KEY, load: loadBrokersScreenRoute \}/);
  assert.match(brokersLaunchHostSource, /writeBrokersLaunchVisibilityNow\(layer: View \| null, visible: boolean\)[\s\S]*layer\?\.setNativeProps/);
  assert.match(brokersLaunchHostSource, /registerVisualApplier\([\s\S]*writeBrokersLaunchVisibilityNow\(hostLayerRef\.current, visible\)/);
  assert.match(brokersLaunchHostSource, /<BrokersLaunchShell[\s\S]*backLatencyLabel="brokers\.launch\.back"/);
  assert.match(brokersLaunchHostSource, /import \{ usePathname, useRouter \} from 'expo-router'/);
  assert.match(brokersLaunchHostSource, /const finishCommittedBack = useCallback\(\(revision: number\) => \{[\s\S]*current\.revision !== revision[\s\S]*showSidebarDestination\('accounts', 'route-sync'\);[\s\S]*brokersLaunchController\.hide\(revision\);[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/quotes'\)/);
  assert.match(brokersLaunchHostSource, /if \(pathname !== '\/settings\/brokers'\) return;[\s\S]*const pendingRevision = pendingBackRevisionRef\.current;[\s\S]*if \(pendingRevision === null\) return;[\s\S]*finishCommittedBack\(pendingRevision\)/);
  assert.match(brokersLaunchHostSource, /const closeLaunch = useCallback\(\(\) => \{[\s\S]*if \(!navigationStarted\) \{[\s\S]*showSidebarDestination\('accounts', 'route-sync'\);[\s\S]*brokersLaunchController\.hide\(currentSnapshot\.revision\);[\s\S]*return;[\s\S]*if \(pathnameRef\.current !== '\/settings\/brokers'\) \{[\s\S]*pendingBackRevisionRef\.current = currentSnapshot\.revision;[\s\S]*return;[\s\S]*finishCommittedBack\(currentSnapshot\.revision\)/);
  assert.doesNotMatch(brokersLaunchHostSource, /router\.canGoBack\(\)|popRouteWhenReady/);
  for (const source of [brokersLaunchHostSource, brokersRouteSource]) {
    assert.match(source, /selectGuestBrokerById\(broker\.brokerId/);
    assert.match(source, /replace\('\/\(tabs\)\/quotes'\)/);
    assert.doesNotMatch(source, /showBrokerDetailLaunch\(selection\)/);
  }
  assert.match(brokersLaunchHostSource, /<BrokersLaunchShell[\s\S]*onSelectBroker=\{selectBroker\}/);
  assert.match(brokersLaunchHostSource, /testID="brokers-launch-host"/);
  assert.match(brokersLaunchHostSource, /testID="brokers-launch-animated-host"/);
  assert.match(brokersLaunchHostSource, /const renderVisible = useSyncExternalStore\([\s\S]*brokersLaunchController\.subscribe,[\s\S]*brokersLaunchController\.isVisible/);
  assert.doesNotMatch(brokersLaunchHostSource, /const renderVisible = brokersLaunchController\.isVisible\(\)/);
  assert.match(brokersLaunchHostSource, /<View[\s\S]*ref=\{hostLayerRef\}[\s\S]*pointerEvents=\{renderVisible \? 'auto' : 'none'\}[\s\S]*collapsable=\{false\}[\s\S]*<BrokersLaunchShell/);
  assert.equal((brokersLaunchHostSource.match(/<BrokersLaunchShell/g) ?? []).length, 1);
  assert.doesNotMatch(brokersLaunchHostSource, /react-native-reanimated|<Animated\.View|brokers-launch-react-host/);
  assert.match(brokersLaunchShellSource, /testID="brokers-launch-shell"/);
  assert.doesNotMatch(brokersLaunchShellSource, /BROKERS_LAUNCH_FALLBACK_ROWS|Achiever Financials LTD|Omega Global Markets/);
  assert.match(brokersLaunchShellSource, /return liveRows\.slice\(0, 8\)/);
  assert.doesNotMatch(brokersLaunchShellSource, /PUBLIC_BROKER_DIRECTORY_BASE_URL/);
  assert.match(brokersLaunchShellSource, /dataActive\?: boolean/);
  assert.match(brokersLaunchShellSource, /useBrokerDirectory\(dataActive\)/);
  assert.match(brokersLaunchHostSource, /<BrokersLaunchShell[\s\S]*dataActive=\{false\}/);
  assert.match(brokersLaunchShellSource, /sortBrokerDirectoryRows\([\s\S]*buildBrokerDirectoryRows\(brokerDirectory\?\.entries\)/);
  assert.doesNotMatch(brokersLaunchShellSource, /Image\.prefetch|brokerLogoPrefetches/);
  assert.match(brokersLaunchShellSource, /onSelectBroker\?: \(broker: BrokerDirectoryRow\) => void/);
  assert.match(brokersLaunchShellSource, /if \(onSelectBroker && row\.selectable\)[\s\S]*onPress=\{\(\) => \{[\s\S]*if \(!row\.selectable\) return;[\s\S]*onSelectBroker\(row\)[\s\S]*activateOnPressIn[\s\S]*latencyLabel=\{`brokers\.launch\.row\.\$\{row\.brokerId\}`\}/);
  assert.match(brokersLaunchShellSource, /<Image[\s\S]*source=\{\{ uri: logoUri, cache: 'reload' \}\}[\s\S]*fadeDuration=\{0\}/);
  assert.doesNotMatch(brokersLaunchShellSource, /cache: 'force-cache'/);
  assert.doesNotMatch(brokersLaunchShellSource, /row\.initials|styles\.avatarText/);
  assert.doesNotMatch(brokersLaunchShellSource, /SKELETON_ROWS|Skeleton|ActivityIndicator|Loading brokers/);
  assert.doesNotMatch(brokersLaunchShellSource, /TextInput|FlatList/);
  assert.match(warmupSource, /prefetchBrokerServers\(\)\.catch\(\(\) => undefined\)/);
  assert.match(brokersLaunchControllerSource, /BROKERS_LAUNCH_CONTROLLER_VERSION = 3/);
  assert.match(brokersLaunchControllerSource, /__rtx5BrokersLaunchControllerVersion/);
  assert.match(brokersLaunchControllerSource, /import \{ scheduleAfterVisualFrames \} from/);
  assert.match(brokersLaunchControllerSource, /scheduleAfterVisualFrames\(runIfCurrent\)/);
  const brokersNavigationStart = brokersLaunchControllerSource.indexOf('export function scheduleBrokersLaunchNavigation');
  const brokersCoverRemovalStart = brokersLaunchControllerSource.indexOf('export function scheduleBrokersLaunchCoverRemoval');
  assert.match(
    brokersLaunchControllerSource.slice(brokersNavigationStart, brokersCoverRemovalStart),
    /scheduleAfterVisualFrames\(runIfCurrent\)/,
  );
  assert.match(brokersLaunchControllerSource, /export function scheduleBrokersLaunchCoverRemoval\(revision: number\)[\s\S]*brokersLaunchController\.hide\(revision\)[\s\S]*scheduleAfterVisualFrames\(hideIfCurrent\)/);
  assert.match(brokerDetailRouteSource, /cacheKey=\{BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY\}/);
  assert.match(brokerDetailRouteSource, /load=\{loadBrokerDetailScreenRoute\}/);
  assert.match(brokerDetailRouteSource, /mountDelayMs=\{0\}/);
  assert.match(brokerDetailRouteSource, /fallback=\{brokerDetailLaunchController\.isVisible\(\)[\s\S]*\? null[\s\S]*: \([\s\S]*<BrokerDetailLaunchShell[\s\S]*selection=\{selection\}/);
  assert.doesNotMatch(brokerDetailRouteSource, /preloadRegisterScreen/);
  assert.match(brokerDetailRouteSource, /const handleBack = useCallback\(\(\) => \{[\s\S]*showBrokersReturnLaunch\(\);[\s\S]*if \(brokerDetailLaunchController\.isVisible\(\)\) \{\s*hideBrokerDetailLaunch\(\);\s*\}[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/settings\/brokers'\)/);
  assert.match(brokerDetailRouteSource, /const handleOpenDemo = useCallback\(\(\) => \{[\s\S]*const registerRevision = showRegisterLaunch\(selection\);[\s\S]*scheduleRegisterLaunchNavigation\(registerRevision,[\s\S]*pathname: '\/register-entry',[\s\S]*origin: 'broker-detail',[\s\S]*registerLaunchRevision: String\(registerRevision\)/);
  const brokerDetailRouteDemoStart = brokerDetailRouteSource.indexOf('const handleOpenDemo =');
  const brokerDetailRouteDemoEnd = brokerDetailRouteSource.indexOf('\n\n  return (', brokerDetailRouteDemoStart);
  const brokerDetailRouteDemoSource = brokerDetailRouteSource.slice(brokerDetailRouteDemoStart, brokerDetailRouteDemoEnd);
  assertRegisterLaunchBeforeRegisterPush(brokerDetailRouteDemoSource, 'Broker Detail route fallback Demo');
  assert.doesNotMatch(
    brokerDetailRouteDemoSource,
    /hideBrokerDetailLaunch/,
  );
  assert.match(brokerDetailRouteSource, /onOpenDemo=\{handleOpenDemo\}/);
  assert.doesNotMatch(brokerDetailRouteSource, /import \{ BrokerDetailScreen \}/);
  assert.match(brokerDetailPreloadSource, /BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY = 'settings\/broker-detail'/);
  assert.match(warmupSource, /\{ cacheKey: BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY, load: loadBrokerDetailScreenRoute \}/);
  assert.match(brokerDetailLaunchHostSource, /writeBrokerDetailLaunchVisibilityNow\(layer: View \| null, visible: boolean\)[\s\S]*layer\?\.setNativeProps/);
  assert.match(brokerDetailLaunchHostSource, /registerVisualApplier\([\s\S]*writeBrokerDetailLaunchVisibilityNow\(hostLayerRef\.current, visible\)/);
  assert.match(brokerDetailLaunchHostSource, /import \{ usePathname, useRouter \} from 'expo-router'/);
  assert.match(brokerDetailLaunchHostSource, /const finishCommittedBack = useCallback\(\(revision: number\) => \{[\s\S]*current\.revision !== revision[\s\S]*showBrokersReturnLaunch\(\);[\s\S]*brokerDetailLaunchController\.hide\(revision\);[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/settings\/brokers'\)/);
  assert.match(brokerDetailLaunchHostSource, /if \(pathname !== '\/settings\/broker-detail'\) return;[\s\S]*const pendingRevision = pendingBackRevisionRef\.current;[\s\S]*if \(pendingRevision === null\) return;[\s\S]*finishCommittedBack\(pendingRevision\)/);
  assert.match(brokerDetailLaunchHostSource, /const closeLaunch = useCallback\(\(\) => \{[\s\S]*if \(!navigationStarted\) \{[\s\S]*showBrokersReturnLaunch\(\);[\s\S]*brokerDetailLaunchController\.hide\(current\.revision\);[\s\S]*return;[\s\S]*if \(pathnameRef\.current !== '\/settings\/broker-detail'\) \{[\s\S]*pendingBackRevisionRef\.current = current\.revision;[\s\S]*return;[\s\S]*finishCommittedBack\(current\.revision\)/);
  assert.doesNotMatch(brokerDetailLaunchHostSource, /router\.canGoBack\(\)|popRouteWhenReady/);
  assert.match(brokerDetailLaunchHostSource, /testID="broker-detail-launch-animated-host"/);
  assert.match(brokerDetailLaunchHostSource, /const selection = useSyncExternalStore\([\s\S]*brokerDetailLaunchController\.subscribe/);
  assert.match(brokerDetailLaunchHostSource, /const renderVisible = useSyncExternalStore\([\s\S]*brokerDetailLaunchController\.subscribe,[\s\S]*brokerDetailLaunchController\.isVisible/);
  assert.doesNotMatch(brokerDetailLaunchHostSource, /const renderVisible = brokerDetailLaunchController\.isVisible\(\)/);
  assert.match(brokerDetailLaunchHostSource, /<View[\s\S]*ref=\{hostLayerRef\}[\s\S]*pointerEvents=\{renderVisible \? 'auto' : 'none'\}[\s\S]*collapsable=\{false\}[\s\S]*<BrokerDetailLaunchShell/);
  assert.equal((brokerDetailLaunchHostSource.match(/<BrokerDetailLaunchShell/g) ?? []).length, 1);
  assert.doesNotMatch(brokerDetailLaunchHostSource, /react-native-reanimated|<Animated\.View|broker-detail-launch-react-host/);
  assert.match(brokerDetailLaunchHostSource, /selection=\{selection\}/);
  assert.doesNotMatch(brokerDetailLaunchHostSource, /preloadRegisterScreen/);
  const rapidDemoStart = brokerDetailLaunchHostSource.indexOf('const openDemoAccount =');
  const rapidDemoEnd = brokerDetailLaunchHostSource.indexOf('\n\n  useEffect(', rapidDemoStart);
  const rapidDemoSource = brokerDetailLaunchHostSource.slice(rapidDemoStart, rapidDemoEnd);
  assert.notEqual(rapidDemoStart, -1);
  assert.notEqual(rapidDemoEnd, -1);
  assert.match(rapidDemoSource, /if \(!current\.visible \|\| registerLaunchController\.isVisible\(\)\) return/);
  assert.match(rapidDemoSource, /const registerRevision = showRegisterLaunch\(current\.selection\)/);
  assert.match(rapidDemoSource, /if \(!current\.navigationStarted\) \{[\s\S]*brokerDetailLaunchController\.startNavigation\(current\.revision\)[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*pathname: '\/settings\/broker-detail',[\s\S]*params: current\.selection,[\s\S]*scheduleRegisterLaunchNavigation\(registerRevision,[\s\S]*pathname: '\/register-entry'[\s\S]*\}\);\s*return;/);
  assert.match(rapidDemoSource, /scheduleRegisterLaunchNavigation\(registerRevision, \(\) => \{[\s\S]*pathname: '\/register-entry',[\s\S]*origin: 'broker-detail',[\s\S]*registerLaunchRevision: String\(registerRevision\)/);
  assertRegisterLaunchBeforeRegisterPush(rapidDemoSource, 'root Broker Detail launch Demo');
  assert.doesNotMatch(rapidDemoSource, /brokerDetailLaunchController\.hide|hideBrokerDetailLaunch/);
  assert.ok(
    rapidDemoSource.indexOf("pathname: '/settings/broker-detail'")
      < rapidDemoSource.indexOf("pathname: '/register-entry'"),
    'a rapid Demo tap must preserve Broker Detail underneath Register Entry',
  );
  // Contract v3: the demo entry exists only when the broker allows demo sign-up.
  assert.equal((brokerDetailLaunchHostSource.match(/onOpenDemo=\{signUpGate\.demo \? openDemoAccount : undefined\}/g) ?? []).length, 1);
  assert.match(brokerDetailLaunchHostSource, /useBrokerSignUpGate\(renderVisible \? selection\.brokerServerUrl : null\)/);
  assert.match(brokerDetailLaunchHostSource, /showDemoSignUp=\{signUpGate\.demo\}[\s\S]*showRealSignUp=\{signUpGate\.real\}/);
  assert.match(brokerDetailLaunchShellSource, /if \(!showDemo && !showReal\) return null/);
  assert.match(brokerDetailLaunchShellSource, /testID="broker-detail-launch-shell"/);
  assert.match(brokerDetailLaunchShellSource, /selection\.brokerName[\s\S]*selection\.brokerServer/);
  assert.match(brokerDetailLaunchShellSource, /pointerEvents=\{onOpenDemo \? 'auto' : 'none'\}/);
  assert.match(brokerDetailLaunchShellSource, /onPress=\{onPress\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel=\{latencyLabel \?\? 'brokerDetail\.launch\.option'\}/);
  assert.match(brokerDetailLaunchShellSource, /export const BrokerDetailLaunchShell = memo\(function BrokerDetailLaunchShell/);
  assert.match(brokerDetailLaunchShellSource, /const LaunchOptionsPanel = memo\(function LaunchOptionsPanel/);
  assert.match(brokerDetailLaunchShellSource, /const LaunchLoginHeader = memo\(function LaunchLoginHeader/);
  assert.match(brokerDetailLaunchShellSource, /const LaunchCredentialFields = memo\(function LaunchCredentialFields/);
  assert.match(brokerDetailLaunchShellSource, /const LaunchLoginFooter = memo\(function LaunchLoginFooter/);
  assert.doesNotMatch(
    brokerDetailLaunchShellSource,
    /useBrokerServers|TextInput|ActionSheet|useQueryClient|getSecureItemAsync|persistSelectedBrokerSession/,
  );
  assert.match(brokerDetailLaunchControllerSource, /BROKER_DETAIL_LAUNCH_FALLBACK_MS = 5_000/);
  assert.match(brokerDetailLaunchControllerSource, /BROKER_DETAIL_LAUNCH_CONTROLLER_VERSION = 3/);
  assert.match(brokerDetailLaunchControllerSource, /__rtx5BrokerDetailLaunchControllerVersion/);
  assert.match(brokerDetailLaunchControllerSource, /import \{ scheduleAfterVisualFrames \} from/);
  assert.match(brokerDetailLaunchControllerSource, /scheduleAfterVisualFrames\(runIfCurrent\)/);
  const brokerDetailNavigationStart = brokerDetailLaunchControllerSource.indexOf('export function scheduleBrokerDetailLaunchNavigation');
  const brokerDetailCoverRemovalStart = brokerDetailLaunchControllerSource.indexOf('export function scheduleBrokerDetailLaunchCoverRemoval');
  assert.match(
    brokerDetailLaunchControllerSource.slice(brokerDetailNavigationStart, brokerDetailCoverRemovalStart),
    /scheduleAfterVisualFrames\(runIfCurrent\)/,
  );
  assert.match(brokerDetailLaunchControllerSource, /export function scheduleBrokerDetailLaunchCoverRemoval\(revision: number\)[\s\S]*brokerDetailLaunchController\.hide\(revision\)[\s\S]*scheduleAfterVisualFrames\(hideIfCurrent\)/);
  assert.doesNotMatch(registerLaunchHostSource, /react-native-reanimated|Animated\.View|animatedProps|useAnimatedStyle/);
  assert.match(registerLaunchHostSource, /function writeRegisterLaunchVisibilityNow\(layer: View \| null, visible: boolean\)[\s\S]*layer\?\.setNativeProps\(\{[\s\S]*pointerEvents: visible \? 'auto' : 'none'[\s\S]*REGISTER_LAUNCH_VISIBLE_STYLE : REGISTER_LAUNCH_HIDDEN_STYLE/);
  assert.match(registerLaunchHostSource, /const hostLayerRef = useRef<View>\(null\)/);
  assert.match(registerLaunchHostSource, /registerLaunchController\.registerVisualApplier\(\(visible\) => \{[\s\S]*writeRegisterLaunchVisibilityNow\(hostLayerRef\.current, visible\)/);
  assert.match(registerLaunchHostSource, /const renderVisible = useSyncExternalStore\([\s\S]*registerLaunchController\.subscribe,[\s\S]*registerLaunchController\.isVisible,[\s\S]*registerLaunchController\.isVisible/);
  assert.match(registerLaunchHostSource, /requestRegisterLaunchBack\(current\.revision\)/);
  assert.match(registerLaunchHostSource, /import \{ usePathname, useRouter \} from 'expo-router'/);
  assert.match(registerLaunchHostSource, /const pendingBackRevisionRef = useRef<number \| null>\(null\)/);
  assert.match(registerLaunchHostSource, /if \(!isRegisterFlowRoute\(pathname\)\) return;[\s\S]*pendingBackRevisionRef\.current[\s\S]*popCommittedRegisterRoute\(pendingRevision, current\.selection\)/);
  assert.match(registerLaunchHostSource, /backResult === 'wait' \|\| backResult === 'handled'[\s\S]*isRegisterFlowRoute\(pathnameRef\.current\)[\s\S]*popCommittedRegisterRoute\(current\.revision, current\.selection\)[\s\S]*pendingBackRevisionRef\.current = current\.revision/);
  assert.match(registerLaunchHostSource, /const popCommittedRegisterRoute = useCallback[\s\S]*showBrokerDetailReturnLaunch\(selection\);[\s\S]*registerLaunchController\.hide\(revision\);[\s\S]*scheduleBackNavigationAfterVisualFrame[\s\S]*pathname: '\/settings\/broker-detail',[\s\S]*params: selection/);
  assert.match(registerLaunchHostSource, /testID="register-launch-host"[\s\S]*testID="register-launch-animated-host"[\s\S]*<RegisterHandoffPreview/);
  assert.equal((registerLaunchHostSource.match(/<RegisterHandoffPreview/g) ?? []).length, 1);
  assert.match(registerLaunchHostSource, /<View[\s\S]*ref=\{hostLayerRef\}[\s\S]*pointerEvents=\{renderVisible \? 'auto' : 'none'\}/);
  assert.match(registerLaunchControllerSource, /REGISTER_LAUNCH_CONTROLLER_VERSION = 2/);
  assert.match(registerLaunchControllerSource, /REGISTER_LAUNCH_FALLBACK_MS = 5_000/);
  assert.match(registerLaunchControllerSource, /markRouteMounted: \(revision\)[\s\S]*return snapshot\.backRequested \? 'back-requested' : 'mounted'/);
  assert.match(registerLaunchControllerSource, /requestBack: \(revision\)[\s\S]*return snapshot\.routeMounted \? 'pop' : 'wait'/);
  const registerMarkMountedStart = registerLaunchControllerSource.indexOf('markRouteMounted: (revision) => {');
  const registerRequestBackStart = registerLaunchControllerSource.indexOf('requestBack: (revision) => {');
  const registerStartNavigationStart = registerLaunchControllerSource.indexOf('startNavigation: (revision) => {');
  const registerVisualApplierStart = registerLaunchControllerSource.indexOf('registerVisualApplier: (applier) => {');
  assert.notEqual(registerMarkMountedStart, -1);
  assert.notEqual(registerRequestBackStart, -1);
  assert.notEqual(registerStartNavigationStart, -1);
  assert.notEqual(registerVisualApplierStart, -1);
  assert.match(
    registerLaunchControllerSource.slice(registerMarkMountedStart, registerRequestBackStart),
    /clearFallbackTimer\(\)/,
  );
  assert.doesNotMatch(
    registerLaunchControllerSource.slice(registerStartNavigationStart, registerVisualApplierStart),
    /clearFallbackTimer\(\)/,
    'starting native navigation must keep the route-commit watchdog armed until mount',
  );
  assert.match(registerLaunchControllerSource, /export function scheduleRegisterLaunchNavigation[\s\S]*scheduleAfterVisualFrames\(runIfCurrent\)/);
  assert.match(registerLaunchControllerSource, /export function scheduleRegisterLaunchCoverRemoval[\s\S]*registerLaunchController\.hide\(revision\)[\s\S]*scheduleAfterVisualFrames\(hideIfCurrent\)/);
  assert.match(quoteInfoLaunchHostSource, /hostAnimatedStyle = useAnimatedStyle\([\s\S]*elevation: visible \? 48 : 0/);
  assert.match(quoteInfoLaunchHostSource, /hostRoot: \{[\s\S]*elevation: 47,[\s\S]*zIndex: 47/);
  assert.match(quoteInfoLaunchHostSource, /if \(navigationStarted\) \{[\s\S]*scheduleBackNavigationAfterVisualFrame\(popRouteWhenReady\)/);
  assert.match(quoteInfoLaunchHostSource, /hostVisible: \{[\s\S]*elevation: 49,[\s\S]*zIndex: 49/);
  assert.match(quoteInfoLaunchShellSource, /testID=\{'quote-info-launch-shell-' \+ destination\}/);
  assert.match(quoteInfoLaunchShellSource, /onPress=\{onBack\}[\s\S]*latencyLabel=\{backLatencyLabel\}[\s\S]*latencyBudgetMs=\{50\}[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(quoteInfoLaunchShellSource, /onPress=\{onBack\}[\s\S]{0,240}activateOnPressIn/);
  assert.doesNotMatch(quoteInfoLaunchShellSource, /onPress=\{onBack\}[\s\S]{0,240}activateOnTouchStart/);
  // Seed the retained shell from the already-cached live quote store so the
  // first paint after an option tap shows real bid/ask instead of placeholders.
  assert.match(quoteInfoLaunchShellSource, /useLiveQuoteSnapshot\(normalizedSymbol, active\)/);
  assert.match(quoteInfoLaunchShellSource, /buildLaunchQuoteReadout/);
  assert.match(quoteInfoLaunchHostSource, /const propertiesActive = snapshot\.visible && snapshot\.destination === 'properties'/);
  assert.match(quoteInfoLaunchHostSource, /const statisticsActive = snapshot\.visible && snapshot\.destination === 'market-statistics'/);
  assert.match(quoteInfoLaunchHostSource, /active=\{propertiesActive\}/);
  assert.match(quoteInfoLaunchHostSource, /active=\{statisticsActive\}/);
  // Light shell only — same weight class as New Order, not full screen mockups.
  assert.doesNotMatch(quoteInfoLaunchShellSource, /PropertiesLaunchViewport|makeSymbolDetailsStyles|glassHero/);
  assert.match(quoteInfoLaunchShellSource, /buildLaunchQuoteReadout/);
  assert.doesNotMatch(
    quoteInfoLaunchShellSource,
    /useMarketData|useInstrumentMeta|useLatestDailyCandle|useQuery/,
  );
  // New-Order model: UI-thread shell first, one paint frame, then route push.
  const quoteInfoLaunchControllerSource = readSource('src/features/quotes/quoteInfoLaunchController.ts');
  assert.match(
    quoteInfoLaunchControllerSource,
    /export function scheduleQuoteInfoLaunchNavigation[\s\S]*scheduleAfterVisualFrame\(runIfCurrent\)/,
  );
  assert.match(
    quoteInfoLaunchControllerSource,
    /export function beginQuoteInfoBackCover[\s\S]*show\(destination, symbol\)[\s\S]*startNavigation\(revision\)/,
  );
  assert.match(
    quoteInfoLaunchControllerSource,
    /export function scheduleQuoteInfoBackCoverRemoval[\s\S]*scheduleAfterVisualFrames\(hideIfCurrent\)/,
  );
  const quoteInfoLaunchHostSourceForBody = readSource('src/features/quotes/QuoteInfoLaunchHost.tsx');
  // Host must only keep lightweight shells — never mount full interactive bodies.
  assert.doesNotMatch(quoteInfoLaunchHostSourceForBody, /SymbolDetailsInteractiveContent|MarketStatisticsInteractiveContent|PropertiesBody|StatisticsBody/);
  assert.equal((quoteInfoLaunchHostSourceForBody.match(/<QuoteInfoLaunchShell/g) ?? []).length, 2);
});

test('global action sheet actions avoid selecting rows while scrolling', () => {
  const source = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');
  const dismissSource = readSource('src/ui/components/ActionSheet/dismissTimer.ts');
  const uiStateSource = readSource('src/state/uiState.ts');

  assert.match(source, /import \{ FastPressable \} from '\.\.\/FastPressable'/);
  assert.match(source, /BackHandler/);
  assert.match(source, /FlatList/);
  assert.match(source, /latencyLabel=\{`actionSheet\.\$\{action\.label\}`\}/);
  assert.match(source, /runActionAfterClose = true/);
  assert.match(source, /activeConfig\.runActionAfterClose \?\? false/);
  assert.match(source, /const ACTION_SHEET_OPEN_OVERLAY_DURATION_MS = 50/);
  assert.match(source, /const ACTION_SHEET_OPEN_SHEET_DURATION_MS = 50/);
  assert.match(source, /const ACTION_SHEET_INSTANT_OPEN_OPACITY = 1/);
  assert.match(source, /const ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y = 0/);
  assert.match(source, /const ACTION_SHEET_INLINE_ACTION_LIMIT = 12/);
  assert.match(source, /const shouldRenderInlineActions =[\s\S]*!activeSearchable[\s\S]*filteredActions\.length <= ACTION_SHEET_INLINE_ACTION_LIMIT[\s\S]*estimatedActionsHeight <= actionsMaxHeight/);
  assert.match(source, /const inlineActionRows = useMemo/);
  assert.match(source, /shouldRenderInlineActions \? \(/);
  assert.match(source, /if \(mode === 'instant'\) \{[\s\S]*overlayOpacity\.setValue\(ACTION_SHEET_INSTANT_OPEN_OPACITY\);[\s\S]*sheetTranslateY\.setValue\(ACTION_SHEET_INSTANT_OPEN_TRANSLATE_Y\);[\s\S]*return;/);
  assert.match(source, /const isMt5Slide = mode === 'mt5Slide'/);
  assert.match(source, /const ACTION_SHEET_MT5_OPEN_OVERLAY_DURATION_MS = 180/);
  assert.match(source, /const ACTION_SHEET_MT5_OPEN_SHEET_DURATION_MS = 210/);
  assert.match(source, /runEntryAnimation\(activeEntryMotion\)/);
  assert.match(source, /const ACTION_SHEET_CLOSE_OVERLAY_DURATION_MS = 50/);
  assert.match(source, /const ACTION_SHEET_CLOSE_SHEET_DURATION_MS = 50/);
  assert.match(source, /const ACTION_SHEET_ROW_PRESS_CANCEL_MOVE_PX = 10/);
  assert.match(source, /type ActionSheetPressGesture = \{[\s\S]*start: ActionSheetPressPoint \| null;[\s\S]*cancelled: boolean;[\s\S]*\}/);
  assert.match(source, /activateOnPressIn\?: boolean/);
  assert.match(source, /deferCloseCommitForVisualHandoff\?: boolean/);
  assert.match(uiStateSource, /deferCloseCommitForVisualHandoff\?: boolean/);
  assert.match(source, /textColor\?: string/);
  assert.match(uiStateSource, /textColor\?: string/);
  assert.match(source, /action\.textColor && !isVisuallyMuted && \{ color: action\.textColor \}/);
  assert.match(source, /textFontWeight\?: TextStyle\['fontWeight'\]/);
  assert.match(uiStateSource, /textFontWeight\?: TextStyle\['fontWeight'\]/);
  assert.match(source, /action\.textFontWeight && !isVisuallyMuted && \{ fontWeight: action\.textFontWeight \}/);
  assert.match(source, /const actionPressGestureRef = useRef<ActionSheetPressGesture>\(\{[\s\S]*start: null,[\s\S]*cancelled: false,[\s\S]*\}\)/);
  assert.match(source, /const recordActionRowPressStart = useCallback\(\(event: GestureResponderEvent\) => \{[\s\S]*start: getActionSheetPressPoint\(event\),[\s\S]*cancelled: false/);
  assert.match(source, /const cancelActionRowPressForScroll = useCallback\(\(\) => \{[\s\S]*cancelled: true/);
  assert.match(source, /const recordActionRowPressMove = useCallback\(\(event: GestureResponderEvent\) => \{[\s\S]*hasActionSheetPressMovedBeyondThreshold\(gesture\.start, getActionSheetPressPoint\(event\)\)[\s\S]*cancelled: true/);
  assert.match(source, /const handleActionRowPress = useCallback\(\([\s\S]*actionPress\?: \(\) => void,[\s\S]*deferCloseCommitForVisualHandoff = false,[\s\S]*if \(gesture\.cancelled\) \{[\s\S]*return;[\s\S]*\}[\s\S]*handleActionPress\(actionPress, deferCloseCommitForVisualHandoff\)/);
  assert.match(source, /onPressIn=\{recordActionRowPressStart\}/);
  assert.match(source, /onTouchMove=\{recordActionRowPressMove\}/);
  assert.match(source, /const isActiveDisabled = action\.disabled \|\| action\.selected === true/);
  assert.match(source, /onPress=\{isActiveDisabled \? undefined : \(\) => handleActionRowPress\([\s\S]*action\.onPress,[\s\S]*action\.deferCloseCommitForVisualHandoff/);
  assert.match(source, /activateOnPressIn=\{action\.activateOnPressIn === true && !isActiveDisabled/);
  assert.match(source, /onScrollBeginDrag=\{cancelActionRowPressForScroll\}/);
  assert.match(source, /onMomentumScrollBegin=\{cancelActionRowPressForScroll\}/);
  assert.match(source, /latencyLabel="actionSheet\.dismissOverlay"/);
  assert.match(
    source,
    /style=\{\[\s*StyleSheet\.absoluteFillObject,\s*styles\.backdrop,\s*isMt5StylePresentation \? null : styles\.backdropDefault,\s*\]\}/,
  );
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /const ACTION_SHEET_KEEP_HOST_MOUNTED = true/);
  assert.match(source, /const hasIncomingConfig =[\s\S]*actions\.length > 0/);
  assert.match(source, /data=\{filteredActions\}/);
  assert.match(source, /initialNumToRender=\{initialActionRowsToRender\}/);
  assert.match(source, /const actionListWindowSize = activeDeferOffscreenActions \? 7 : 3/);
  assert.match(source, /const actionListMaxToRenderPerBatch = activeDeferOffscreenActions[\s\S]*Math\.max\(12, initialActionRowsToRender\)[\s\S]*Math\.max\(4, Math\.min\(8, initialActionRowsToRender\)\)/);
  assert.match(source, /maxToRenderPerBatch=\{actionListMaxToRenderPerBatch\}/);
  assert.match(source, /windowSize=\{actionListWindowSize\}/);
  assert.match(source, /removeClippedSubviews=\{[\s\S]*Platform\.OS === 'android'[\s\S]*&& !activeDeferOffscreenActions[\s\S]*&& !hasVariableActionRowHeights/);
  assert.match(source, /activateOnPressIn/);
  assert.match(source, /pointerEvents="box-none"/);
  assert.doesNotMatch(source, /traceUiInteraction/);
  assert.match(uiStateSource, /showActionSheet: \(config\) => set\(\{ actionSheet: withInstantActionSheetOpen\(config\) \}\)/);
  assert.match(uiStateSource, /config\.instantOpen === true \? config : \{ \.\.\.config, instantOpen: true \}/);
  assert.match(dismissSource, /const ACTION_SHEET_DISMISS_SETTLE_FRAMES = 1/);
  assert.match(dismissSource, /const ACTION_SHEET_VISUAL_HANDOFF_CLOSE_FRAMES = 2/);
  assert.match(source, /scheduleActionSheetVisualHandoffCloseCommit\(\(\) => \{[\s\S]*onClose\(\)/);
});

test('bottom-sheet style dropdowns avoid native slide animations on open', () => {
  const bottomSheetFiles = [
    'src/features/chart/ChartColorsScreen.tsx',
    'src/features/settings/ChartPropertiesScreen.tsx',
  ];

  for (const file of bottomSheetFiles) {
    const source = readSource(file);
    assert.doesNotMatch(source, /animationType=["']slide["']/, `${file} must not use native slide animation for bottom sheets`);
  }
});

test('chart properties color picker keeps readouts live and commits chart colors after gestures', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const timeframeHostStart = source.indexOf('const ChartPropertiesTimeframePickerHost =');
  const chartPropertiesStart = source.indexOf('export function ChartPropertiesScreen');
  const timeframeHostSource = source.slice(timeframeHostStart, chartPropertiesStart);
  const chartPropertiesSource = source.slice(chartPropertiesStart);
  assert.match(source, /<KeyboardAvoidingView behavior="padding" style=\{styles\.modalBackdropBottom\}>/);
  assert.match(source, /<Pressable style=\{StyleSheet\.absoluteFillObject\} onPress=\{\(\) => applyDraftColor\(draftColor\)\} \/>/);
  assert.doesNotMatch(source, /<Pressable style=\{styles\.modalBackdropBottom\} onPress=\{\(\) => applyDraftColor\(draftColor\)\}>/);
  assert.match(source, /const pickerColorValue = useMemo\(\(\) => \{/);
  assert.match(source, /ColorPicker cannot accept incomplete HEX drafts/);
  const pickerChangeStart = source.indexOf('const handlePickerColorChange = (value: string) => {');
  const pickerChangeEnd = source.indexOf('const handlePickerColorComplete', pickerChangeStart);
  assert.notEqual(pickerChangeStart, -1);
  assert.notEqual(pickerChangeEnd, -1);

  const pickerChangeSource = source.slice(pickerChangeStart, pickerChangeEnd);
  assert.match(pickerChangeSource, /requestAnimationFrame/);
  assert.match(pickerChangeSource, /setDraftColor\(nextDraft\)/);
  assert.doesNotMatch(pickerChangeSource, /setChartColor/);
  const colorPickerStart = source.indexOf('<ColorPicker');
  const colorPickerEnd = source.indexOf('</ColorPicker>', colorPickerStart);
  assert.notEqual(colorPickerStart, -1);
  assert.notEqual(colorPickerEnd, -1);

  const colorPickerSource = source.slice(colorPickerStart, colorPickerEnd);
  assert.match(colorPickerSource, /value=\{pickerColorValue\}/);
  assert.match(colorPickerSource, /onChangeJS=\{\(color\) => handlePickerColorChange\(color\.hex\.toUpperCase\(\)\)\}/);
  assert.match(colorPickerSource, /onCompleteJS=\{\(color\) => handlePickerColorComplete\(color\.hex\.toUpperCase\(\)\)\}/);
  assert.doesNotMatch(colorPickerSource, /\sonChange=\{/);
  assert.doesNotMatch(colorPickerSource, /\sonComplete=\{/);
  assert.match(source, /const previewContentReady = useDeferredRouteContentReady\(\s*SCHEMA_COLORS_PREVIEW_DELAY_MS,\s*isScreenFocused,\s*\)/);
  assert.match(source, /onPress=\{handleOpenTimeframePicker\}[\s\S]*activateOnPressIn[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="chartProperties\.timeframePicker\.open"/);
  assert.match(source, /const ChartPropertiesTimeframePickerHost = React\.memo\(React\.forwardRef<[\s\S]*React\.useImperativeHandle\(ref, \(\) => \(\{ open \}\), \[open\]\)/);
  assert.match(timeframeHostSource, /const \[controller\] = useState<ChartTimeframePickerController>\([\s\S]*createChartTimeframePickerController/);
  assert.match(timeframeHostSource, /const open = useCallback\(\(\) => \{\s*if \(!active\) return;\s*controller\.show\(\)/);
  assert.match(timeframeHostSource, /useEffect\(\(\) => \{\s*if \(!active\) \{\s*controller\.hide\(\)/);
  assert.match(timeframeHostSource, /const handleSelect = useCallback\(\(timeframe: string\) => \{\s*controller\.hide\(\);\s*onSelect\(timeframe\)/);
  assert.match(timeframeHostSource, /<ChartTimeframePickerOverlay[\s\S]*controller=\{controller\}[\s\S]*supportedTimeframes=\{CANDLE_HISTORY_TIMEFRAMES\}[\s\S]*onSelect=\{handleSelect\}/);
  assert.match(source, /const handleOpenTimeframePicker = useCallback\(\(\) => \{\s*timeframePickerHostRef\.current\?\.open\(\);/);
  assert.doesNotMatch(timeframeHostSource, /\bhostReady\b|\bsetHostReady\b|return null/);
  assert.doesNotMatch(timeframeHostSource, /<Modal|animationType=|<ActionSheet/);
  assert.doesNotMatch(chartPropertiesSource, /setTimeframePickerOpen\(|<ActionSheet/);
  assert.match(chartPropertiesSource, /<\/ScrollView>\s*<ChartPropertiesTimeframePickerHost[\s\S]*active=\{isScreenFocused\}/);
  assert.match(source, /const quoteActive = \(hosted \|\| navigationFocused\) && !colorEditorOpen/);
  assert.match(source, /const previewActive = previewContentReady && isScreenFocused && !colorEditorOpen/);
  assert.match(source, /\{previewContentReady \? \([\s\S]*<LiveChartPreview[\s\S]*chart-live-preview-placeholder/);
  assert.match(source, /import \{ useLiveSymbolQuote \} from '\.\.\/\.\.\/query\/websocket'/);
  assert.match(source, /import \{ calculateQuoteSpreadPoints \} from '\.\.\/\.\.\/utils\/quoteSpread'/);
  assert.doesNotMatch(source, /useMarketData/);
  assert.match(source, /Direct per-symbol ticks keep the Bid and Spread preview cards live without waiting on the delayed chart preview/);
  assert.match(source, /useLiveSymbolQuote\(chartSymbol, quoteActive, 0\)/);
  assert.doesNotMatch(source, /useLiveSymbolQuote\(chartSymbol, previewActive, 0\)/);
  assert.match(source, /const liveSpreadPoints = calculateQuoteSpreadPoints\(liveQuote\?\.bid, liveQuote\?\.ask, liveQuote\?\.digits\)/);
  assert.match(source, /Number\.isFinite\(liveSpreadPoints\)[\s\S]*Number\(liveSpreadPoints\)\.toFixed\(1\)[\s\S]*Number\.isFinite\(liveQuote\?\.spread\)/);
  assert.match(source, /const livePreviewPrice = useMemo\(\(\) => \{/);
  assert.match(source, /const previewLiveCandle = useMemo\(\(\) => \{/);
  assert.match(source, /Blend the immediate live quote into the current preview candle/);
  assert.match(source, /high: Math\.max\(previewLastCandle\.high, livePreviewPrice\)/);
  assert.match(source, /low: Math\.min\(previewLastCandle\.low, livePreviewPrice\)/);
  assert.match(source, /close: livePreviewPrice/);
  assert.match(source, /const previewOhlcItems = previewLiveCandle/);
  assert.match(source, /formatQuote\(previewLiveCandle\.close, liveQuote\?\.digits\)/);
  assert.doesNotMatch(source, /formatQuote\(previewLastCandle\.close, liveQuote\?\.digits\)/);
  assert.match(source, /useLiveCandles\(chartSymbol, chartTimeframe, previewActive\)/);
  assert.match(source, /active=\{previewActive\}/);
});

test('chart properties show controls moved to the chart settings action sheet', () => {
  const chartPropertiesSource = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const typesSource = readSource('src/state/userPreferences/types.ts');
  const defaultsSource = readSource('src/state/userPreferences/chartColors.ts');

  assert.doesNotMatch(chartPropertiesSource, /const SHOW_FIELDS|setChartDisplaySetting|Show ticker|Show trade levels/);
  assert.match(chartSource, /const CHART_SCALE_DISPLAY_ITEMS:[\s\S]*key: 'showTicker'[\s\S]*label: 'Show ticker'[\s\S]*key: 'showTradeLevels'[\s\S]*label: 'Show trade levels'/);
  assert.match(chartSource, /title: t\('Chart settings'\)[\s\S]*titleAlign: 'center'/);
  assert.match(chartSource, /label: t\(item\.label\)/);
  assert.match(chartSource, /label: t\(item\.label\)[\s\S]*muted: enabled[\s\S]*onPress: \(\) => handleToggleChartDisplayAction\(item\.key\)/);
  assert.doesNotMatch(chartSource, /label: t\([^)]*Disable/);
  assert.doesNotMatch(chartSource, /subtitle: t\(.*(?:On|Off)/);
  assert.doesNotMatch(chartPropertiesSource, /showPeriodSeparators|Show period separators/);
  assert.doesNotMatch(typesSource, /showPeriodSeparators/);
  assert.doesNotMatch(defaultsSource, /showPeriodSeparators/);
});

test('chart properties keeps line color under candles and links candle colors to hidden bar colors', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const colorGroupsStart = source.indexOf('const COLOR_GROUPS: ColorGroup[] = [');
  const colorGroupsEnd = source.indexOf('];', colorGroupsStart);
  assert.notEqual(colorGroupsStart, -1);
  assert.notEqual(colorGroupsEnd, -1);

  const colorGroupsSource = source.slice(colorGroupsStart, colorGroupsEnd);
  assert.match(colorGroupsSource, /title: 'CANDLES'[\s\S]*key: 'candlesUptrend'[\s\S]*key: 'candlesDowntrend'[\s\S]*key: 'hollowBody'[\s\S]*key: 'lineBody'/);
  assert.doesNotMatch(colorGroupsSource, /OTHER CHART TYPES/);
  assert.doesNotMatch(colorGroupsSource, /key: 'barsUptrend'/);
  assert.doesNotMatch(colorGroupsSource, /key: 'barsDowntrend'/);
  assert.match(source, /const LINKED_CANDLE_COLOR_KEYS:[\s\S]*candlesUptrend: 'barsUptrend'[\s\S]*candlesDowntrend: 'barsDowntrend'/);

  const commitStart = source.indexOf('const commitChartColor = (key: keyof ChartColorsConfig, color: string) => {');
  const commitEnd = source.indexOf('const handleDraftColorChange', commitStart);
  assert.notEqual(commitStart, -1);
  assert.notEqual(commitEnd, -1);

  const commitSource = source.slice(commitStart, commitEnd);
  assert.match(commitSource, /Bar colors are hidden here/);
  assert.match(commitSource, /setChartColor\(key, color\)/);
  assert.match(commitSource, /const linkedBarKey = LINKED_CANDLE_COLOR_KEYS\[key\]/);
  assert.match(commitSource, /setChartColor\(linkedBarKey, color\)/);
  assert.match(source, /commitChartColor\(activeColorKey, normalized\)/);
});

test('chart properties dark chrome matches the Settings dark palette', () => {
  const source = readSource('src/features/settings/ChartPropertiesScreen.tsx');
  const settingsStyles = readSource('src/features/settings/SettingsScreen/styles.ts');
  const stylesStart = source.indexOf('function makeStyles');
  assert.notEqual(stylesStart, -1);
  const stylesSource = source.slice(stylesStart);

  assert.match(settingsStyles, /const SETTINGS_DARK_BACKGROUND = '#121212'/);
  assert.match(settingsStyles, /const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E'/);
  assert.match(source, /Match the app dark palette for the chart preferences shell and cards/);
  assert.match(source, /const SETTINGS_DARK_BACKGROUND = '#121212'/);
  assert.match(source, /const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E'/);
  assert.match(source, /const preferencesBackground = isDark \? SETTINGS_DARK_BACKGROUND : T\.bg/);
  assert.match(source, /const preferencesCardBackground = isDark \? SETTINGS_DARK_CARD_BACKGROUND : '#FFFFFF'/);
  assert.match(source, /const preferencesSoftCardBackground = isDark \? SETTINGS_DARK_CARD_BACKGROUND : '#F8FAFC'/);
  assert.doesNotMatch(source, /isDark \? '#(?:000000|1C1C1E)'/);

  const backgroundStyles = ['screen', 'header'];
  for (const styleName of backgroundStyles) {
    assert.match(stylesSource, new RegExp(`${styleName}: \\{[\\s\\S]{0,500}backgroundColor: preferencesBackground`));
  }

  const cardStyles = ['previewCard', 'panel', 'colorGroupCard', 'modalCard', 'bottomSheet'];
  for (const styleName of cardStyles) {
    assert.match(stylesSource, new RegExp(`${styleName}: \\{[\\s\\S]{0,700}backgroundColor: preferencesCardBackground`));
  }

  const readoutStyles = ['infoCard', 'infoCardThird'];
  for (const styleName of readoutStyles) {
    assert.match(stylesSource, new RegExp(`${styleName}: \\{[\\s\\S]{0,500}backgroundColor: preferencesSoftCardBackground`));
  }
});

test('shared scroll containers keep taps active while keyboard or scroll responders are present', () => {
  const screenSource = readSource('src/ui/components/Screen.tsx');
  const actionSheetSource = readSource('src/ui/components/ActionSheet/ActionSheet.tsx');
  const sidebarSource = readSource('src/ui/components/SidebarDrawer.tsx');
  const files = [
    ...walkSourceFiles('app'),
    ...walkSourceFiles('src/features'),
    ...walkSourceFiles('src/ui/components'),
  ].filter(isActiveSourceFile);

  const canCancelPattern = /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/;
  assert.match(screenSource, /keyboardShouldPersistTaps="always"/);
  assert.match(screenSource, canCancelPattern);
  assert.match(actionSheetSource, /keyboardShouldPersistTaps="always"/);
  assert.match(actionSheetSource, canCancelPattern);
  assert.match(sidebarSource, /keyboardShouldPersistTaps="always"/);
  assert.match(sidebarSource, canCancelPattern);
  for (const file of files) {
    const source = readSource(file);
    assert.doesNotMatch(
      source,
      /keyboardShouldPersistTaps=\{?['"]handled['"]\}?/,
      `${file} must keep taps active instead of swallowing the first tap while keyboard is open`,
    );
  }

  const scrollResponderIssues = files.flatMap((file) => collectScrollResponderIssues(file, readSource(file)));
  assert.deepEqual(scrollResponderIssues, []);
});

test('settings navigation surfaces keep heavyweight routes responsive on first touch', () => {
  const rowSource = readSource('src/features/settings/SettingsScreen/SettingRow.tsx');
  const backBarSource = readSource('src/features/settings/SettingsBackBar.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const registerEntrySource = readSource('app/register-entry.tsx');
  const registerPreviewSource = readSource('src/features/settings/RegisterHandoffPreview.tsx');
  const registerHandoffSource = readSource('src/features/settings/registerHandoffState.ts');
  const registerPreloadSource = readSource('src/features/settings/registerScreenPreload.ts');
  const registerSource = readSource('app/register.tsx');
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const brokersSource = readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const rootSource = readSource('app/_layout.tsx');
  const accountCardStart = settingsSource.indexOf("onPress={() => openReadySettingsRoute('/settings/accounts')}");
  const metricsRowStart = settingsSource.indexOf('<View style={styles.metricsRow}', accountCardStart);
  const registerRowStart = settingsSource.indexOf("onPress={() => openReadySettingsRoute('/register-entry')}");
  const marketUpdatesStart = settingsSource.indexOf("t('MARKET UPDATES')", registerRowStart);

  assert.match(rowSource, /<FastPressable[\s\S]*latencyLabel=\{`settings\.row\.\$\{title\}`\}[\s\S]*onPress=\{onPress\}/);
  assert.match(rowSource, /activateOnPressIn\?: boolean/);
  assert.match(rowSource, /activateOnTouchStart\?: boolean/);
  assert.match(rowSource, /activateOnPressIn=\{activateOnPressIn\}/);
  assert.match(rowSource, /activateOnTouchStart=\{activateOnTouchStart\}/);
  assert.match(rowSource, /const SETTINGS_ROW_PRESS_RETENTION_OFFSET = \{ top: 8, bottom: 8, left: 18, right: 18 \} as const/);
  assert.match(rowSource, /pressRetentionOffset=\{SETTINGS_ROW_PRESS_RETENTION_OFFSET\}/);
  assert.match(rowSource, /unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(rowSource, /traceUiInteraction/);
  assert.notEqual(accountCardStart, -1);
  assert.notEqual(metricsRowStart, -1);
  assert.notEqual(registerRowStart, -1);
  assert.notEqual(marketUpdatesStart, -1);
  assert.match(settingsSource.slice(accountCardStart, metricsRowStart), /onPressIn=\{\(\) => prepareReadySettingsRoute\('\/settings\/accounts'\)\}[\s\S]*pressRetentionOffset=\{SETTINGS_SCROLL_PRESS_RETENTION_OFFSET\}/);
  assert.doesNotMatch(settingsSource.slice(accountCardStart, metricsRowStart), /onTouchStart=\{\(\) => showRouteLaunchPreview\('\/settings\/accounts'\)\}|activateOnPressIn/);
  assert.match(settingsSource.slice(registerRowStart, marketUpdatesStart), /onPressIn=\{\(\) => prepareReadySettingsRoute\('\/register-entry'\)\}[\s\S]*pressRetentionOffset=\{SETTINGS_SCROLL_PRESS_RETENTION_OFFSET\}/);
  assert.doesNotMatch(settingsSource.slice(registerRowStart, marketUpdatesStart), /onTouchStart=\{\(\) => showRouteLaunchPreview\('\/register-entry'\)\}|activateOnPressIn/);
  assert.match(backBarSource, /<FastPressable[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/settings'\)[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="settings\.back"/);
  assert.doesNotMatch(settingsSource, /SETTINGS_LOWER_CONTENT_DELAY_MS|lowerSettingsReady/);
  assert.doesNotMatch(settingsSource, /SETTINGS_BODY_PREWARM_DELAY_MS|routeBodyReady|useDeferredRouteContentReady/);
  assert.match(settingsSource, /<ScrollView[\s\S]*style=\{styles\.container\}[\s\S]*contentContainerStyle=\{styles\.content\}/);
  assert.match(settingsSource, /const SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/register-entry'[\s\S]*'\/register'[\s\S]*'\/settings\/economic-calendar'[\s\S]*'\/settings\/journal'[\s\S]*'\/settings\/help'[\s\S]*\] as const/);
  assert.doesNotMatch(settingsSource, /SettingsRegisterOpeningShell|registerOpeningShellVisible|SETTINGS_REGISTER_ROUTE_HANDOFF_DELAY_MS/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/user-guide'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/otp'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/support'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/traders-community'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/mailbox'/);
  assert.doesNotMatch(settingsSource, /SETTINGS_READY_ROUTE_PATHS = \[[\s\S]*'\/settings\/news'/);
  assert.match(settingsSource, /const openReadySettingsRoute = useCallback/);
  // Detail routes are PUSHED (not replaced) so the (tabs) navigator — and the
  // pre-warmed chart WebView — stays mounted underneath, making BACK an instant
  // pop instead of a full tab re-mount (~1.8s freeze).
  assert.doesNotMatch(settingsSource, /router\.replace\(routePath as any\)/);
  assert.match(settingsSource, /router\.push\(routePath as any\)/);
  assert.match(settingsSource, /latencyLabel="settings\.search\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsSource, /latencyLabel="settings\.register\.open"/);
  assert.match(settingsSource, /onPress=\{\(\) => openReadySettingsRoute\('\/settings\/accounts'\)\}[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="settings\.accounts\.open"/);
  assert.match(settingsSource, /const SETTINGS_REGISTER_ROUTE_LATENCY_BUDGET_MS = 50/);
  assert.match(settingsSource, /const SETTINGS_REGISTER_SCREEN_PRELOAD_DELAY_MS = 0/);
  assert.doesNotMatch(settingsSource, /SETTINGS_ROUTE_PREVIEW_ROUTE_DELAY_MS|scheduleRouteAfterPreviewPaint/);
  assert.match(settingsSource, /const SETTINGS_ROUTE_LOCK_MS = 1800/);
  assert.match(settingsSource, /const SETTINGS_ROUTE_PREFETCH_DELAY_MS = 0/);
  assert.match(settingsSource, /const scheduleSettingsRouteAfterVisualFrame = \(action: \(\) => void\) => \{[\s\S]*requestAnimationFrame\(runAfterFrame\)[\s\S]*setTimeout\(action, 0\)/);
  assert.match(settingsSource, /const warmRegisterScreen = useCallback\(\(\) => \{[\s\S]*void preloadRegisterScreen\(\)\.catch\(\(\) => undefined\);[\s\S]*\}, \[\]\)/);
  assert.match(settingsSource, /const scheduleRegisterScreenWarmupAfterTouch = useCallback\(\(\) => \{[\s\S]*scheduleSettingsRouteAfterVisualFrame\(warmRegisterScreen\);[\s\S]*\}, \[warmRegisterScreen\]\)/);
  assert.match(settingsSource, /preloadRegisterScreen/);
  assert.doesNotMatch(settingsSource, /RegisterHandoffPreview|SettingsRouteLaunchPreview/);
  assert.match(settingsSource, /import \{ warmSettingsRouteModules \} from '\.\.\/\.\.\/\.\.\/utils\/settingsRouteWarmup'/);
  assert.match(settingsSource, /showSidebarDestination,[\s\S]*type SidebarHostDestination/);
  assert.match(settingsSource, /const SETTINGS_HOSTED_ROUTE_DESTINATIONS:[\s\S]*'\/settings\/accounts': 'accounts'[\s\S]*'\/settings\/economic-calendar': 'economic-calendar'[\s\S]*'\/settings\/journal': 'journal'[\s\S]*'\/settings\/help': 'help'[\s\S]*'\/settings\/interface': 'interface'/);
  assert.doesNotMatch(settingsSource, /routeLaunchPreview|showRouteLaunchPreview|resolveSettingsRouteLaunchPreview/);
  assert.match(settingsSource, /const prepareReadySettingsRoute = useCallback\(\(routePath: SettingsReadyRoute\) => \{[\s\S]*warmSettingsRouteModules\(\);[\s\S]*\}, \[scheduleRegisterScreenWarmupAfterTouch\]\)/);
  assert.match(settingsSource, /if \(!isScreenFocused\) \{[\s\S]*return;[\s\S]*\}[\s\S]*routeLockRef\.current = false;[\s\S]*clearTimeout\(routeUnlockTimerRef\.current\)/);
  assert.match(settingsSource, /const isRegisterRoute = routePath === '\/register-entry' \|\| routePath === '\/register'/);
  assert.match(settingsSource, /const hostedDestination = SETTINGS_HOSTED_ROUTE_DESTINATIONS\[routePath\];[\s\S]*showSidebarDestination\(hostedDestination, 'settings'\)[\s\S]*routeLockRef\.current = false;[\s\S]*return;/);
  assert.match(settingsSource, /prepareReadySettingsRoute\(routePath\);[\s\S]*router\.push\(routePath as any\);[\s\S]*if \(isRegisterRoute\) \{[\s\S]*warmRegisterScreen\(\);[\s\S]*\}[\s\S]*unlockSettingsRoute\(\);/);
  assert.match(settingsSource, /onPress=\{\(\) => openReadySettingsRoute\('\/register-entry'\)\}[\s\S]*onPressIn=\{\(\) => prepareReadySettingsRoute\('\/register-entry'\)\}[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="settings\.register\.open"[\s\S]*latencyBudgetMs=\{SETTINGS_REGISTER_ROUTE_LATENCY_BUDGET_MS\}/);
  assert.doesNotMatch(settingsSource, /onTouchStart=\{\(\) => showRouteLaunchPreview\('\/(?:settings\/accounts|register-entry|settings\/economic-calendar|settings\/interface|settings\/journal|settings\/help)'\)\}/);
  assert.doesNotMatch(settingsSource, /registerLaunchPreviewLayer|settings\.register\.preview\.back/);
  assert.doesNotMatch(settingsSource, /subscribeRegisterScreenReady|<Modal/);
  assert.doesNotMatch(settingsSource, /if \(routePath === '\/register-entry'\)[\s\S]*return;/);
  assert.doesNotMatch(settingsSource, /if \(routePath === '\/register'\)[\s\S]*return;/);
  assert.doesNotMatch(settingsSource, /pushRegisterRoute|requestAnimationFrame\(pushRegisterRoute\)|setTimeout\(pushRegisterRoute|router\.push\('\/register-entry'/);
  assert.doesNotMatch(settingsSource, /registerRouteOpening|registerOpeningOverlay|registerOpeningTitle|SettingsRegisterPreviewInput/);
  assert.match(registerEntrySource, /const REGISTER_ENTRY_FORM_IMPORT_DELAY_MS = 0/);
  assert.match(registerEntrySource, /const REGISTER_ENTRY_PREVIEW_READY_HIDE_DELAY_MS = 0/);
  assert.match(registerEntrySource, /const REGISTER_ENTRY_PREVIEW_FALLBACK_HIDE_DELAY_MS = 3200/);
  assert.match(registerEntrySource, /subscribeRegisterScreenReady\(\(readyRevision\) => \{[\s\S]*rootLaunchRevision !== null && readyRevision !== rootLaunchRevision[\s\S]*rootLaunchRevision === null && readyRevision !== undefined[\s\S]*return;/);
  assert.match(registerEntrySource, /getPreloadedRegisterScreen/);
  assert.match(registerEntrySource, /preloadRegisterScreen/);
  assert.match(registerEntrySource, /brokerDetailLaunchController,[\s\S]*hideBrokerDetailLaunch,[\s\S]*showBrokerDetailReturnLaunch,[\s\S]*from '\.\.\/src\/features\/settings\/brokerDetailLaunchController'/);
  assert.match(registerEntrySource, /const rootLaunchRevision = returnsToBrokerDetail[\s\S]*registerLaunchSnapshot\.visible[\s\S]*registerLaunchSnapshot\.revision === parsedRegisterLaunchRevision/);
  assert.match(registerEntrySource, /React\.useLayoutEffect\(\(\) => \{[\s\S]*const mountResult = markRegisterLaunchRouteMounted\(rootLaunchRevision\);[\s\S]*mountResult === 'back-requested'[\s\S]*finishRootLaunchBack\(rootLaunchRevision\)[\s\S]*hideBrokerDetailLaunch\(\)/);
  assert.equal((registerEntrySource.match(/scheduleRegisterLaunchCoverRemoval\(rootLaunchRevision\)/g) ?? []).length, 2);
  assert.match(registerEntrySource, /React\.useState<RegisterScreenComponent \| null>\(null\)/);
  assert.match(registerEntrySource, /const preloadedScreen = getPreloadedRegisterScreen\(\)/);
  assert.match(registerEntrySource, /const scheduleRegisterScreenMount = React\.useCallback\(\(\s*screenComponent: RegisterScreenComponent,\s*options\?: \{ immediate\?: boolean \},/);
  assert.match(registerEntrySource, /if \(options\?\.immediate\) \{\s*mountScreen\(\);/);
  assert.match(registerEntrySource, /requestAnimationFrame\(scheduleMountTimer\)/);
  assert.match(registerEntrySource, /scheduleRegisterScreenMount\(preloadedScreen, \{ immediate: true \}\)/);
  assert.match(registerEntrySource, /scheduleRegisterScreenMount\(screenComponent, \{ immediate: true \}\)/);
  assert.match(registerEntrySource, /\{RegisterScreen \? <RegisterScreen \/> : null\}/);
  assert.match(registerEntrySource, /StyleSheet\.absoluteFill[\s\S]*<RegisterHandoffPreview[\s\S]*backLatencyLabel="register\.entry\.back"/);
  assert.match(registerPreviewSource, /onPress=\{onBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel=\{backLatencyLabel\}[\s\S]*latencyBudgetMs=\{50\}/);
  assert.match(registerPreviewSource, /export const RegisterHandoffPreview = React\.memo\(function RegisterHandoffPreview/);
  assert.match(registerEntrySource, /safeRouterBack,[\s\S]*scheduleBackNavigationAfterVisualFrame,[\s\S]*from '\.\.\/src\/utils\/navigation'/);
  assert.match(registerEntrySource, /const finishRootLaunchBack = React\.useCallback[\s\S]*showBrokerDetailReturnLaunch\(snapshot\.selection\);[\s\S]*hideRegisterLaunch\(revision\);[\s\S]*scheduleBackNavigationAfterVisualFrame[\s\S]*pathname: '\/settings\/broker-detail',[\s\S]*params: snapshot\.selection \?\? undefined/);
  assert.match(registerEntrySource, /const startBackToOrigin = React\.useCallback\(\(\) => \{[\s\S]*clearHandoffTimers\(\);[\s\S]*rootLaunchRevision !== null[\s\S]*requestRegisterLaunchBack\(rootLaunchRevision\);[\s\S]*backResult === 'pop'[\s\S]*finishRootLaunchBack\(rootLaunchRevision\)/);
  const registerEntryBackStart = registerEntrySource.indexOf('const startBackToOrigin =');
  const registerEntryBackEnd = registerEntrySource.indexOf('const handleBack =', registerEntryBackStart);
  const registerEntryBackSource = registerEntrySource.slice(registerEntryBackStart, registerEntryBackEnd);
  assert.notEqual(registerEntryBackStart, -1);
  assert.notEqual(registerEntryBackEnd, -1);
  assert.match(registerEntryBackSource, /backResult === 'pop' \|\| backResult === 'wait' \|\| backResult === 'handled'[\s\S]*finishRootLaunchBack\(rootLaunchRevision\);[\s\S]*if \(backResult === 'cancel'\) \{[\s\S]*hideRegisterLaunch\(rootLaunchRevision\);[\s\S]*\}[\s\S]*if \(returnsToBrokerDetail\)/);
  assert.doesNotMatch(registerEntryBackSource, /backResult === 'stale'[\s\S]*return/);
  assert.match(registerEntryBackSource, /const selection = brokerDetailLaunchController\.getSnapshot\(\)\.selection;[\s\S]*showBrokerDetailReturnLaunch\(selection\);[\s\S]*pathname: '\/settings\/broker-detail',[\s\S]*params: selection/);
  assert.match(registerEntrySource, /BackHandler\.addEventListener\('hardwareBackPress',[\s\S]*startBackToOrigin\(\);[\s\S]*return true/);
  assert.doesNotMatch(registerEntrySource, /scheduleRegisterEntryBackAfterVisualFrame|requestAnimationFrame\(runAfterFrame\)/);
  assert.doesNotMatch(registerEntrySource, /router\.dismissTo\(REGISTER_BACK_FALLBACK_HREF\)/);
  assert.doesNotMatch(registerEntrySource, /router\.replace\('\/register'\)|router\.push\('\/register'\)/);
  assert.doesNotMatch(registerEntrySource, /fontSize: 34|width: 68|minHeight: 84|useOrrnnDemoStatus|useOrrnnDemoGroups|useBrokerServers|ActionSheet|TextInput|useDeferredActiveFlag/);
  assert.match(registerPreviewSource, /<Text style=\{styles\.headerTitle\} numberOfLines=\{1\}>Demo Account<\/Text>[\s\S]*<PasswordPreview[\s\S]*label=\{t\('Master password'\)\}/);
  assert.doesNotMatch(registerPreviewSource, /heroSection|stats-chart-outline|Open Demo Account/);
  assert.doesNotMatch(registerPreviewSource, /label=\{t\('Group'\)\}/);
  assert.doesNotMatch(registerPreviewSource, /fontSize: 34|width: 68|minHeight: 84|useOrrnnDemoStatus|useOrrnnDemoGroups|useBrokerServers|ActionSheet|TextInput|useDeferredActiveFlag/);
  assert.match(registerHandoffSource, /type RegisterScreenReadyListener = \(launchRevision\?: number\) => void/);
  assert.match(registerHandoffSource, /const registerScreenReadyListeners = new Set<RegisterScreenReadyListener>\(\)/);
  assert.match(registerHandoffSource, /export function subscribeRegisterScreenReady/);
  assert.match(registerHandoffSource, /export function notifyRegisterScreenReady\(launchRevision\?: number\)[\s\S]*listener\(launchRevision\)/);
  assert.match(registerPreloadSource, /let preloadedRegisterScreen: RegisterScreenComponent \| null = null/);
  assert.match(registerPreloadSource, /export function getPreloadedRegisterScreen/);
  assert.match(registerPreloadSource, /export function preloadRegisterScreen/);
  assert.match(registerPreloadSource, /import\('\.\.\/\.\.\/\.\.\/app\/register'\)/);
  assert.match(registerSource, /const REGISTER_INITIAL_PICKER_PRESS_GUARD_MS = 150/);
  assert.doesNotMatch(registerSource, /REGISTER_SECONDARY_CONTENT_DELAY_MS|registerSecondaryContentReady/);
  assert.match(registerSource, /const REGISTER_ROUTE_DATA_DELAY_MS = 180/);
  assert.match(registerSource, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.match(registerSource, /const registerDataActive = useDeferredActiveFlag\(\s*isScreenFocused && firstPaintReady,\s*REGISTER_ROUTE_DATA_DELAY_MS,\s*\)/);
  assert.match(registerSource, /notifyRegisterScreenReady/);
  assert.match(registerSource, /const registerReadyNotifiedRef = React\.useRef\(false\)/);
  assert.match(registerSource, /const handleRegisterRootLayout = React\.useCallback\(\(\) => \{[\s\S]*const notifyAfterPaint = \(\) => \{[\s\S]*notifyRegisterScreenReady\(\s*Number\.isInteger\(parsedRegisterLaunchRevision\)\s*\? parsedRegisterLaunchRevision\s*: undefined,[\s\S]*requestAnimationFrame\(notifyAfterPaint\)[\s\S]*\}, \[parsedRegisterLaunchRevision\]\)/);
  assert.doesNotMatch(registerSource, /requestAnimationFrame\(\(\) => \{\s*globalThis\.requestAnimationFrame\(notifyAfterPaint\)/);
  assert.match(registerSource, /<View style=\{styles\.bg\} onLayout=\{handleRegisterRootLayout\}>/);
  assert.match(registerSource, /const getRegisterInteractionNow = \(\) => \(/);
  assert.match(registerSource, /const registerPickerPressBlockedUntilRef = React\.useRef\(\s*getRegisterInteractionNow\(\) \+ REGISTER_INITIAL_PICKER_PRESS_GUARD_MS,\s*\)/);
  assert.match(registerSource, /const registerPickerFocusSeenRef = React\.useRef\(false\)/);
  assert.match(registerSource, /if \(registerPickerFocusSeenRef\.current !== isScreenFocused\) \{[\s\S]*registerPickerPressBlockedUntilRef\.current =\s*getRegisterInteractionNow\(\) \+ REGISTER_INITIAL_PICKER_PRESS_GUARD_MS;[\s\S]*\}/);
  assert.match(registerSource, /const isRegisterInitialPickerPressBlocked = React\.useCallback\(\(\) => \(\s*getRegisterInteractionNow\(\) < registerPickerPressBlockedUntilRef\.current\s*\), \[\]\)/);
  assert.doesNotMatch(registerSource, /registerPickerPressReady|setRegisterPickerPressReady/);
  assert.match(registerSource, /const handleOpenPhoneCountryPicker = React\.useCallback\(\(\) => \{\s*if \(isRegisterInitialPickerPressBlocked\(\)\) \{\s*return;\s*\}[\s\S]*setPhoneCountryPickerOpen\(true\);/);
  assert.match(registerSource, /const handleOpenGroupPicker = React\.useCallback\(\(\) => \{\s*if \(isRegisterInitialPickerPressBlocked\(\)\) \{\s*return;\s*\}[\s\S]*setGroupPickerOpen\(true\);/);
  assert.match(registerSource, /onLayout=\{handleFieldLayout\('password'\)\}[\s\S]*journalActionLabel="pressed Register demo account button"/);
  assert.doesNotMatch(registerSource, /if \(!registerSecondaryContentReady\)|\{registerSecondaryContentReady \?/);
  assert.match(registerSource, /const \[mountedPickerHosts, setMountedPickerHosts\] = useState<Record<RegisterPickerHostKey, boolean>>/);
  assert.match(registerSource, /const mountPickerHost = React\.useCallback\(\(key: RegisterPickerHostKey\) => \{/);
  assert.doesNotMatch(registerSource, /REGISTER_PICKER_HOST_DELAY_MS|registerPickerHostReady/);
  assert.match(registerSource, /useOrrnnDemoStatus\(registerDataActive\)/);
  assert.match(registerSource, /useOrrnnDemoGroups\(registerDataActive && isDemoServiceReady\)/);
  assert.match(registerSource, /useBrokerServers\(registerDataActive\)/);
  assert.match(registerSource, /type RegisterPickerHostKey =[\s\S]*\| 'phoneCountry'[\s\S]*\| 'group'/);
  assert.match(registerSource, /const phoneCountryPickerMounted = mountedPickerHosts\.phoneCountry \|\| phoneCountryPickerOpen/);
  assert.match(registerSource, /const groupPickerMounted = mountedPickerHosts\.group \|\| groupPickerOpen/);
  assert.match(registerSource, /mountPickerHost\('phoneCountry'\)/);
  assert.match(registerSource, /mountPickerHost\('group'\)/);
  assert.match(registerSource, /\{phoneCountryPickerMounted \? \([\s\S]*<ActionSheet[\s\S]*visible=\{phoneCountryPickerOpen\}/);
  assert.match(registerSource, /\{groupPickerMounted \? \([\s\S]*<ActionSheet[\s\S]*visible=\{groupPickerOpen\}/);
  assert.doesNotMatch(registerSource, /REGISTER_ROUTE_CONTENT_DELAY_MS|RegisterScreenContent|routeShell|useDeferredRouteContentReady/);
  assert.doesNotMatch(settingsSource, /title=\{t\('Mailbox'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/mailbox'\)\}/);
  assert.doesNotMatch(settingsSource, /title=\{t\('News'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/news'\)\}/);
  assert.match(settingsSource, /title=\{t\('Economic Calender'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/economic-calendar'\)\}/);
  assert.match(settingsSource, /title=\{t\('Support'\)\}[\s\S]*sub=\{supportEmail\}[\s\S]*onPress=\{handleEmailSupport\}/);
  assert.match(settingsSource, /title=\{t\('Help'\)\}[\s\S]*onPress=\{\(\) => openReadySettingsRoute\('\/settings\/help'\)\}/);
  assert.match(settingsSource, /latencyLabel="settings\.logout\.prompt"/);
  assert.doesNotMatch(settingsSource, /traceUiInteraction/);
  assert.match(accountsSource, /paddingLeft: 16/);
  assert.match(accountsSource, /marginLeft: 8/);
  assert.match(accountsSource, /const accountsOptionsSheetConfig = React\.useMemo[\s\S]*presentation: 'mt5Plain',[\s\S]*detent: 'auto'[\s\S]*entryMotion: 'mt5Slide'[\s\S]*runImmediateAction\('accounts\.optionsSheet\.open'[\s\S]*showAccountsActionSheet\(accountsOptionsSheetConfig\)/);
  assert.match(accountsSource, /latencyLabel="accounts\.back"[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(accountsSource, /import \{ usePathname, useRouter \} from 'expo-router'/);
  assert.match(accountsSource, /const ACCOUNTS_BROKER_RETURN_FALLBACK_MS = 700/);
  assert.match(accountsSource, /const isBrokerFlowRoute = \(pathname: string\) => \([\s\S]*pathname === '\/settings\/brokers'[\s\S]*pathname === '\/settings\/broker-detail'[\s\S]*pathname === '\/register-entry'[\s\S]*pathname === '\/register'/);
  assert.match(accountsSource, /const pathname = usePathname\(\);[\s\S]*const pathnameRef = React\.useRef\(pathname\);[\s\S]*const pendingBrokerReturnCloseRef = React\.useRef\(false\);[\s\S]*const pendingBrokerReturnTimerRef = React\.useRef<ReturnType<typeof setTimeout> \| null>\(null\)/);
  assert.match(accountsSource, /const finishPendingBrokerReturnClose = React\.useCallback\([\s\S]*pendingBrokerReturnCloseRef\.current = false;[\s\S]*hideSidebarDestination\(\);[\s\S]*settledPathname === '\/settings\/accounts'[\s\S]*safeRouterBack\(router, '\/\(tabs\)\/quotes'\)/);
  assert.match(accountsSource, /pendingBrokerReturnCloseRef\.current[\s\S]*!isBrokerFlowRoute\(pathname\)[\s\S]*finishPendingBrokerReturnClose\(pathname\)/);
  assert.match(accountsSource, /const closeAccountsScreen = React\.useCallback\(\(\) => \{[\s\S]*sidebarDestinationController\.getSnapshot\(\)[\s\S]*hostedSnapshot\.activeDestination === 'accounts'[\s\S]*hostedSnapshot\.source === 'route-sync'[\s\S]*isBrokerFlowRoute\(pathnameRef\.current\)[\s\S]*pendingBrokerReturnCloseRef\.current = true;[\s\S]*setTimeout\(\(\) => \{[\s\S]*router\.replace\('\/\(tabs\)\/quotes'\);[\s\S]*ACCOUNTS_BROKER_RETURN_FALLBACK_MS[\s\S]*return;[\s\S]*if \(hideSidebarDestination\(\)\)/);
  assert.match(accountsSource, /if \(pendingBrokerReturnCloseRef\.current\) return;[\s\S]*router\.replace\('\/\(tabs\)\/quotes'\);[\s\S]*finishPendingBrokerReturnClose\('\/\(tabs\)\/quotes'\)/);
  assert.match(accountsSource, /sidebarDestinationController\.registerBackHandler\('accounts',[\s\S]*closeAccountsScreen\(\);[\s\S]*return true/);
  const connectAccountStart = accountsSource.indexOf('const handleConnectAccount =');
  const connectAccountEnd = accountsSource.indexOf('const [connectingKey', connectAccountStart);
  const connectAccountSource = accountsSource.slice(connectAccountStart, connectAccountEnd);
  assert.notEqual(connectAccountStart, -1);
  assert.notEqual(connectAccountEnd, -1);
  assert.match(connectAccountSource, /const launchRevision = showBrokersLaunch\(\);[\s\S]*scheduleBrokersLaunchNavigation\(launchRevision, \(\) => \{[\s\S]*try \{[\s\S]*router\.push\('\/settings\/brokers'\);[\s\S]*hideSidebarDestination\(\);[\s\S]*catch \(error\) \{[\s\S]*hideBrokersLaunch\(launchRevision\);[\s\S]*throw error/);
  assert.ok(
    connectAccountSource.indexOf("router.push('/settings/brokers')")
      < connectAccountSource.indexOf('hideSidebarDestination()'),
    'Accounts must remain visible until the Brokers route push succeeds',
  );
  assert.doesNotMatch(
    connectAccountSource,
    /preloadBrokersScreen/,
  );
  assert.match(accountsSource, /onPress=\{handleConnectAccount\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="accounts\.connect\.open"[\s\S]*latencyBudgetMs=\{50\}/);
  assert.match(accountsSource, /latencyLabel="accounts\.options\.open"/);
  assert.doesNotMatch(accountsSource, /traceUiInteraction/);
  assert.match(brokersSource, /paddingLeft: 16/);
  assert.match(brokersSource, /gap: 8/);
  assert.match(brokersSource, /latencyLabel="brokers\.back"/);
  assert.match(brokersSource, /const handleBack = useCallback\(\(\) => \{[\s\S]*showSidebarDestination\('accounts', 'route-sync'\);[\s\S]*if \(brokersLaunchController\.isVisible\(\)\) \{\s*hideBrokersLaunch\(\);\s*\}[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(routerInstance, '\/\(tabs\)\/quotes'\)/);
  assert.doesNotMatch(brokersSource, /latencyLabel="brokers\.qr"/);
  assert.doesNotMatch(brokersSource, /qr-code-outline/);
  assert.match(brokersSource, /latencyLabel="brokers\.custom"/);
  assert.match(brokersSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(brokersSource, /const coveredLaunchRevisionRef = useRef<number \| null>\(null\)/);
  assert.doesNotMatch(brokersSource, /directoryQuerySettled|brokerRecords\.length === 0/);
  assert.match(brokersSource, /useLayoutEffect\(\(\) => \{[\s\S]*if \(!isScreenFocused\)[\s\S]*const launchSnapshot = brokersLaunchController\.getSnapshot\(\);[\s\S]*!launchSnapshot\.visible[\s\S]*coveredLaunchRevisionRef\.current === launchSnapshot\.revision[\s\S]*coveredLaunchRevisionRef\.current = launchSnapshot\.revision;[\s\S]*hideSidebarDestination\(\);[\s\S]*scheduleBrokersLaunchCoverRemoval\(launchSnapshot\.revision\);[\s\S]*\}, \[isScreenFocused, onSelectBroker\]\)/);
  assert.doesNotMatch(brokersSource, /brokerRecords\.length === 0/);
  assert.doesNotMatch(brokersSource, /routePaintReady|useDeferredRouteContentReady/);
  assert.doesNotMatch(brokersSource, /preloadBrokerDetailScreen|preloadRegisterScreen/);
  assert.match(brokersSource, /BackHandler\.addEventListener\('hardwareBackPress',[\s\S]*handleBack\(\);[\s\S]*return true/);
  assert.match(brokersSource, /onPress=\{handleBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="brokers\.back"[\s\S]*latencyBudgetMs=\{50\}/);
  assert.doesNotMatch(brokersSource, /handleScreenLayout|onLayout=\{handleScreenLayout\}/);
  assert.match(tabsSource, /const isRestoringAccountsFromBrokerFlow =[\s\S]*hostedDestination\.activeDestination === 'accounts'[\s\S]*hostedDestination\.source === 'route-sync'[\s\S]*if \(!isRestoringAccountsFromBrokerFlow\) \{\s*hideSidebarDestination\(\);/);
  const routeSyncOwnershipStart = tabsSource.indexOf('const isRestoringAccountsFromBrokerFlow =');
  const routeSyncOwnershipEnd = tabsSource.indexOf('if (!isRestoringAccountsFromBrokerFlow)', routeSyncOwnershipStart);
  assert.notEqual(routeSyncOwnershipStart, -1);
  assert.notEqual(routeSyncOwnershipEnd, -1);
  assert.doesNotMatch(
    tabsSource.slice(routeSyncOwnershipStart, routeSyncOwnershipEnd),
    /previousPath/,
    'frozen Tabs pathname history must not cancel an explicitly owned broker-flow return',
  );
  assert.match(brokersSource, /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/);
  assert.match(brokersSource, /pointerEvents="box-none"/);
  assert.match(brokersSource, /const BROKER_ROW_PRESS_CANCEL_MOVE_PX = 14/);
  assert.match(brokersSource, /type BrokerPressGesture = \{[\s\S]*start: BrokerPressPoint \| null;[\s\S]*handled: boolean;[\s\S]*cancelled: boolean;[\s\S]*selection: BrokerDetailLaunchSelection \| null;[\s\S]*\}/);
  assert.match(brokersSource, /const brokerPressGestureRef = useRef<BrokerPressGesture>\(\{[\s\S]*start: null,[\s\S]*handled: false,[\s\S]*cancelled: false,[\s\S]*selection: null,[\s\S]*\}\)/);
  assert.match(brokersSource, /function hasBrokerPressMovedBeyondThreshold\(start: BrokerPressPoint, end: BrokerPressPoint\)[\s\S]*BROKER_ROW_PRESS_CANCEL_MOVE_PX \* BROKER_ROW_PRESS_CANCEL_MOVE_PX/);
  assert.match(brokersSource, /const recordBrokerRowPressStart = \(broker: BrokerRow, event: GestureResponderEvent\) => \{[\s\S]*if \(!broker\.selectable\) \{[\s\S]*cancelled: true,[\s\S]*selection: null,[\s\S]*return;[\s\S]*const selection = toBrokerDetailLaunchSelection\(broker\);[\s\S]*start: getBrokerPressPoint\(event\),[\s\S]*handled: false,[\s\S]*cancelled: false,[\s\S]*selection,/);
  const brokerPressStart = brokersSource.indexOf('const recordBrokerRowPressStart =');
  const brokerPressCancel = brokersSource.indexOf('const cancelBrokerRowPressForScroll =', brokerPressStart);
  assert.doesNotMatch(
    brokersSource.slice(brokerPressStart, brokerPressCancel),
    /preloadBrokerDetailScreen|prepareBrokerDetailLaunch/,
  );
  assert.match(brokersSource, /const cancelBrokerRowPressForScroll = \(\) => \{[\s\S]*cancelled: true,[\s\S]*selection: null/);
  assert.match(brokersSource, /const recordBrokerRowPressMove = \(event: GestureResponderEvent\) => \{[\s\S]*hasBrokerPressMovedBeyondThreshold\(gesture\.start, current\)[\s\S]*cancelBrokerRowPressForScroll\(\)/);
  assert.match(brokersSource, /const handleBrokerRowPress = \(broker: BrokerRow, event: GestureResponderEvent\) => \{[\s\S]*if \(!broker\.selectable\) \{[\s\S]*return;[\s\S]*shouldIgnoreBrokerRowPress\(event\)[\s\S]*const selection = toBrokerDetailLaunchSelection\(broker\);[\s\S]*selectedBrokerHealthGate\.run\(\{[\s\S]*serverUrl: broker\.serverUrl,[\s\S]*onAvailable: \(\) => \{[\s\S]*openBrokerDetail\(selection\)[\s\S]*onUnavailable: \(\) => \{[\s\S]*Alert\.alert\(SELECTED_BROKER_UNAVAILABLE_MESSAGE\)/);
  assert.match(brokersSource, /const openBrokerDetail = \(selection: BrokerDetailLaunchSelection\) => \{[\s\S]*selectGuestBroker\(record\)[\s\S]*routerInstance\.replace/);
  const openBrokerDetailStart = brokersSource.indexOf('const openBrokerDetail =');
  const recordBrokerPressStart = brokersSource.indexOf('const recordBrokerRowPressStart =', openBrokerDetailStart);
  assert.doesNotMatch(
    brokersSource.slice(openBrokerDetailStart, recordBrokerPressStart),
    /setBrokerConnection|persistSelectedBrokerSession/,
  );
  assert.match(brokersSource, /onScrollBeginDrag=\{cancelBrokerRowPressForScroll\}/);
  assert.match(brokersSource, /onMomentumScrollBegin=\{cancelBrokerRowPressForScroll\}/);
  const brokerRowsStart = brokersSource.indexOf('renderItem={({ item }) => (');
  const brokerRowsEnd = brokersSource.indexOf('ListEmptyComponent=', brokerRowsStart);
  assert.notEqual(brokerRowsStart, -1);
  assert.notEqual(brokerRowsEnd, -1);
  const brokerRowsSource = brokersSource.slice(brokerRowsStart, brokerRowsEnd);
  assert.equal((brokerRowsSource.match(/onPressIn=\{\(event\) => recordBrokerRowPressStart\(item, event\)\}/g) ?? []).length, 1);
  assert.equal((brokerRowsSource.match(/onTouchMove=\{recordBrokerRowPressMove\}/g) ?? []).length, 1);
  assert.equal((brokerRowsSource.match(/onPress=\{\(event\) => handleBrokerRowPress\(item, event\)\}/g) ?? []).length, 1);
  assert.doesNotMatch(brokerRowsSource, /onPress=\{\(\) => handleSelectBroker\(item\)\}/);
  assert.match(brokerRowsSource, /latencyLabel=\{`brokers\.row\.\$\{item\.brokerId\}`\}/);
  const brokerCardStart = brokersSource.indexOf('function BrokerDirectoryCardContent');
  const brokerCardEnd = brokersSource.indexOf('function BrokerAvatar', brokerCardStart);
  const brokerCardSource = brokersSource.slice(brokerCardStart, brokerCardEnd);
  assert.match(brokerCardSource, /style=\{styles\.selectBtn\} pointerEvents="none"/);
  assert.match(brokerCardSource, /name=\{broker\.selectable \? 'chevron-forward' : 'lock-closed'\}/);
  assert.doesNotMatch(brokerRowsSource, /latencyLabel=\{`brokers\.info\.\$\{item\.brokerId\}`\}/);
  assert.doesNotMatch(brokerRowsSource, /activateOnPressIn|activateOnTouchStart/);
  assert.doesNotMatch(brokersSource, /traceUiInteraction/);
  assert.match(brokerDetailSource, /paddingLeft: 16/);
  assert.match(brokerDetailSource, /gap: 8/);
  // Accent buttons accept either the theme token (T.accent) or the brand
  // blue (#2563EB) so the global color refresh doesn't break the contract.
  const accentColorPattern = `(?:T\\.accent|primaryBlue|['"]#2563EB['"])`;
  assert.match(registerSource, new RegExp(`registerBtn: \\{[\\s\\S]*backgroundColor: ${accentColorPattern}[\\s\\S]*shadowColor: ${accentColorPattern}`));
  assert.match(brokerDetailSource, new RegExp(`optionIconDemo: \\{[\\s\\S]*backgroundColor: ${accentColorPattern}`));
  assert.match(brokerDetailSource, new RegExp(`optionIconReal: \\{[\\s\\S]*backgroundColor: ${accentColorPattern}`));
  assert.match(brokerDetailSource, new RegExp(`loginBtn: \\{[\\s\\S]*backgroundColor: ${accentColorPattern}[\\s\\S]*shadowColor: ${accentColorPattern}`));
  assert.doesNotMatch(brokerDetailSource, /preloadRegisterScreen/);
  assert.match(brokerDetailSource, /const handleBack = useCallback\(\(\) => \{[\s\S]*showBrokersReturnLaunch\(\);[\s\S]*if \(brokerDetailLaunchController\.isVisible\(\)\) \{\s*hideBrokerDetailLaunch\(\);\s*\}[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, '\/settings\/brokers'\)/);
  assert.match(brokerDetailSource, /const handleOpenDemo = useCallback\(\(\) => \{[\s\S]*const registerRevision = showRegisterLaunch\(selection\);[\s\S]*scheduleRegisterLaunchNavigation\(registerRevision,[\s\S]*pathname: '\/register-entry',[\s\S]*origin: 'broker-detail',[\s\S]*registerLaunchRevision: String\(registerRevision\)/);
  const brokerDetailDemoHandlerStart = brokerDetailSource.indexOf('const handleOpenDemo =');
  const brokerDetailDemoHandlerEnd = brokerDetailSource.indexOf('useLayoutEffect(', brokerDetailDemoHandlerStart);
  const brokerDetailDemoHandlerSource = brokerDetailSource.slice(
    brokerDetailDemoHandlerStart,
    brokerDetailDemoHandlerEnd,
  );
  assert.notEqual(brokerDetailDemoHandlerStart, -1);
  assert.notEqual(brokerDetailDemoHandlerEnd, -1);
  assertRegisterLaunchBeforeRegisterPush(brokerDetailDemoHandlerSource, 'Broker Detail screen Demo');
  assert.doesNotMatch(
    brokerDetailDemoHandlerSource,
    /hideBrokerDetailLaunch/,
  );
  // Contract v3: the demo entry is withheld when /broker/config disables sign-up.
  assert.match(brokerDetailSource, /<BrokerDetailLaunchShell[\s\S]*onBack=\{handleBack\}[\s\S]*onOpenDemo=\{launchSignUpGate\.demo \? handleOpenDemo : undefined\}[\s\S]*backLatencyLabel="brokerDetail\.initial\.back"/);
  assert.equal((brokerDetailSource.match(/pathname: '\/register-entry'/g) ?? []).length, 2);
  assert.equal((brokerDetailSource.match(/registerLaunchRevision: String\(registerRevision\)/g) ?? []).length, 2);
  assert.doesNotMatch(brokerDetailSource, /router\.replace\('\/register-entry'\)/);
  const demoNavigationStart = brokerDetailSource.indexOf("const navigateToRegister = useCallback((type: 'demo' | 'real')");
  const serverSelectorStart = brokerDetailSource.indexOf('const openServerSelector =', demoNavigationStart);
  assert.notEqual(demoNavigationStart, -1);
  assert.notEqual(serverSelectorStart, -1);
  const navigateToRegisterSource = brokerDetailSource.slice(demoNavigationStart, serverSelectorStart);
  assertRegisterLaunchBeforeRegisterPush(navigateToRegisterSource, 'Broker Detail option Demo');
  assert.doesNotMatch(
    navigateToRegisterSource,
    /persistSelectedBrokerSession|setSecureItemAsync/,
  );
  assert.match(brokerDetailSource, /showRegisterLaunch,[\s\S]*scheduleRegisterLaunchNavigation/);
  assert.match(brokerDetailSource, /useLayoutEffect\(\(\) => \{[\s\S]*!isScreenFocused \|\| !contentReady[\s\S]*const launchRevision = brokerDetailLaunchController\.getSnapshot\(\)\.revision;[\s\S]*scheduleBrokerDetailLaunchCoverRemoval\(launchRevision\)/);
  assert.doesNotMatch(brokerDetailSource, /void preloadRegisterScreen\(\)/);
  assert.match(brokerDetailSource, /activateOnTouchStart[\s\S]*latencyLabel="brokerDetail\.openDemo"/);
  assert.match(
    brokerDetailSource,
    /runImmediateAction\('brokerDetail\.openDemo'[\s\S]*showRegisterLaunch\(selection\)/,
  );
  assert.doesNotMatch(brokerDetailSource, /pathname: '\/register'/);
  assert.doesNotMatch(brokerDetailSource, /MT5_BLUE_LIGHT/);
  assert.doesNotMatch(brokerDetailSource, /LOGIN_VIOLET/);
  assert.match(registerSource, /const REGISTER_BACK_FALLBACK_HREF = '\/\(tabs\)\/settings'/);
  assert.match(registerSource, /const styles = React\.useMemo\(\(\) => makeStyles\(T, isDark, insets, width, fontScale\), \[T, isDark, insets, width, fontScale\]\)/);
  assert.match(registerSource, /const registerBackNavigationStartedRef = React\.useRef\(false\)/);
  assert.match(registerSource, /if \(isScreenFocused\) \{[\s\S]*registerBackNavigationStartedRef\.current = false;[\s\S]*\}, \[isScreenFocused\]\);/);
  assert.match(registerSource, /const \{ origin, registerLaunchRevision \} = useLocalSearchParams/);
  assert.match(registerSource, /const handleRegisterBack = React\.useCallback\(\(event: GestureResponderEvent\) => \{[\s\S]*requestRegisterLaunchBack\(parsedRegisterLaunchRevision\);[\s\S]*backResult === 'pop' \|\| backResult === 'wait' \|\| backResult === 'handled'[\s\S]*launchSnapshot\.selection[\s\S]*showBrokerDetailReturnLaunch\(launchSnapshot\.selection\);[\s\S]*hideRegisterLaunch\(parsedRegisterLaunchRevision\);[\s\S]*scheduleBackNavigationAfterVisualFrame[\s\S]*pathname: '\/settings\/broker-detail',[\s\S]*params: launchSnapshot\.selection \?\? undefined/);
  assert.match(registerSource, /if \(backResult !== 'stale'\) \{\s*return;\s*\}[\s\S]*registerBackNavigationStartedRef\.current = true;[\s\S]*if \(returnsToBrokerDetail\)/);
  assert.match(registerSource, /if \(returnsToBrokerDetail\) \{[\s\S]*const selection = brokerDetailLaunchController\.getSnapshot\(\)\.selection;[\s\S]*showBrokerDetailReturnLaunch\(selection\);[\s\S]*scheduleBackNavigationAfterVisualFrame[\s\S]*pathname: '\/settings\/broker-detail',[\s\S]*params: selection/);
  assert.doesNotMatch(registerSource, /scheduleRegisterBackAfterVisualFrame|requestAnimationFrame\(runAfterFrame\)/);
  assert.doesNotMatch(registerSource, /router\.dismissTo\(REGISTER_BACK_FALLBACK_HREF\)/);
  assert.match(registerSource, /onPress=\{handleRegisterBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="register\.back"[\s\S]*latencyBudgetMs=\{50\}[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(rootSource, /const brokerFlowBackground = T\.bg/);
  assert.match(rootSource, /const brokerFlowScreenOptions = \{[\s\S]*headerShown: false,[\s\S]*animation: 'none',[\s\S]*freezeOnBlur: false,[\s\S]*contentStyle: \{ backgroundColor: brokerFlowBackground \},[\s\S]*\} as const;/);
  assert.match(rootSource, /const registerScreenOptions = \{[\s\S]*headerShown: false,[\s\S]*animation: 'none',[\s\S]*presentation: 'card',[\s\S]*gestureEnabled: false,[\s\S]*freezeOnBlur: false,[\s\S]*contentStyle: \{ backgroundColor: brokerFlowBackground \},[\s\S]*\} as const;/);
  assert.match(rootSource, /<Stack\.Screen name='register-entry' options=\{registerScreenOptions\}/);
  assert.match(rootSource, /<Stack\.Screen name='register' options=\{registerScreenOptions\}/);
  assert.match(rootSource, /<Stack\.Screen name='settings\/brokers' options=\{brokerFlowScreenOptions\}/);
  assert.match(rootSource, /<Stack\.Screen name='settings\/broker-detail' options=\{brokerFlowScreenOptions\}/);
  assert.match(brokerDetailSource, /latencyLabel="brokerDetail\.back"/);
  assert.match(brokerDetailSource, /onPress=\{onBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="brokerDetail\.back"[\s\S]*latencyBudgetMs=\{50\}/);
  assert.match(brokerDetailSource, /latencyLabel="brokerDetail\.login\.submit"/);
  assert.match(brokerDetailSource, /latencyLabel="brokerDetail\.server\.open"/);
  assert.match(brokerDetailSource, /activateOnPressIn/);
  assert.doesNotMatch(brokerDetailSource, /traceUiInteraction/);
  assert.match(rootSource, /<FastPressable[\s\S]*activateOnPressIn[\s\S]*latencyLabel="stack\.back"/);
  assert.doesNotMatch(rootSource, /traceUiInteraction/);
});

test('trade ticket execution actions use the immediate fast press path', () => {
  const source = readSource('src/features/trade/OrderTicketScreen.tsx');
  const launchShellSource = readSource('src/features/trade/OrderTicketLaunchShell.tsx');

  assert.match(source, /latencyLabel="orderTicket\.back"/);
  assert.match(source, /const originHref = getOrderTicketOriginHref\(resolveOrderTicketOrigin\(origin\)\)/);
  assert.match(source, /const handleOrderTicketBack = useCallback\(\(\) => \{[\s\S]*backNavigationStartedRef\.current = true;[\s\S]*hideOrderTicketLaunch\(\);[\s\S]*scheduleBackNavigationAfterVisualFrame\(\(\) => \{[\s\S]*safeRouterBack\(router, originHref\)/);
  assert.match(source, /onPress=\{handleOrderTicketBack\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="orderTicket\.back"[\s\S]*latencyBudgetMs=\{50\}[\s\S]*unstable_pressDelay=\{0\}/);
  assert.doesNotMatch(source, /onPress=\{handleOrderTicketBack\}[\s\S]{0,240}activateOnTouchStart/);
  assert.match(source, /const wasFocusedRef = useRef\(false\);[\s\S]*if \(isScreenFocused\) \{[\s\S]*wasFocusedRef\.current = true;[\s\S]*if \(wasFocusedRef\.current\) \{[\s\S]*hideOrderTicketLaunch\(\)/);
  assert.match(source, /if \(!isScreenFocused \|\| !contentReady\) \{[\s\S]*return;[\s\S]*hideOrderTicketLaunch\(\)/);
  assert.match(launchShellSource, /backLatencyLabel = 'orderTicket\.shell\.back'/);
  assert.match(launchShellSource, /onPress=\{onBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*latencyLabel=\{backLatencyLabel\}[\s\S]*latencyBudgetMs=\{50\}[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(source, /latencyLabel="orderTicket\.symbol\.open"/);
  assert.match(source, /visible=\{symbolPickerOpen\}/);
  assert.match(source, /const OrderTicketSymbolPickerSheetHost = memo\(forwardRef</);
  assert.match(source, /symbolPickerSheetRef\.current\?\.open\(\)/);
  assert.match(source, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{sellTradeAction\.side\}`\}/);
  assert.match(source, /latencyLabel=\{`orderTicket\.pricePanel\.\$\{buyTradeAction\.side\}`\}/);
  assert.match(source, /latencyLabel=\{`orderTicket\.exec\.\$\{action\.side\}`\}/);
  assert.match(source, /latencyLabel="orderTicket\.pending\.submit"/);
  assert.match(source, /latencyLabel="orderTicket\.volume\.decrement"/);
  assert.match(source, /latencyLabel="orderTicket\.volume\.increment"/);
  assert.match(source, /latencyLabel="orderTicket\.sl\.decrement"/);
  assert.match(source, /latencyLabel="orderTicket\.tp\.increment"/);
  assert.match(source, /import \{ useDeferredRouteContentReady \} from '\.\.\/\.\.\/ui\/components\/DeferredRouteMount'/);
  assert.match(source, /const ORDER_TICKET_FULL_CONTENT_DELAY_MS = 0/);
  assert.match(source, /export function OrderTicketScreen\(\) \{[\s\S]*const isScreenFocused = useIsFocused\(\);[\s\S]*useDeferredRouteContentReady\(ORDER_TICKET_FULL_CONTENT_DELAY_MS, isScreenFocused\)/);
  assert.match(source, /const ORDER_TICKET_DATA_READY_DELAY_MS = 0/);
  assert.match(source, /const ORDER_TICKET_HEAVY_CONTENT_DELAY_MS = 0/);
  assert.match(source, /const routeDataReady = useDeferredRouteContentReady\(ORDER_TICKET_DATA_READY_DELAY_MS\)/);
  assert.match(source, /const heavyContentReady = useDeferredRouteContentReady\(ORDER_TICKET_HEAVY_CONTENT_DELAY_MS\)/);
  assert.match(source, /const routeQueriesActive = isScreenFocused && routeDataReady/);
  assert.match(source, /useMarketSymbols\(routeQueriesActive\)/);
  assert.match(source, /useInstrumentMeta\(symbol, routeQueriesActive\)/);
  assert.match(source, /useLiveQuoteSubscription\(symbol, routeQueriesActive\)/);
  assert.match(source, /const liveQuote = useLiveQuoteSnapshot\(symbol, isScreenFocused\)/);
  assert.match(source, /resolveSessionQuoteActionAvailability\(/);
  assert.match(source, /useAccountSummary\(loginStr, \{ enabled: routeQueriesActive \}\)/);
  assert.match(source, /if \(!routeQueriesActive\) return null/);
  assert.match(source, /heavyContentReady \? \([\s\S]*<LiveOrderTickExecutionGraph/);
  assert.match(source, /styles\.executionGraphPlaceholder/);
  assert.doesNotMatch(source, /livePill|liveDot|liveLabel/);
  assert.doesNotMatch(source, /traceUiInteraction/);
});

test('close position actions use the immediate trade path', () => {
  const rootSource = readSource('app/_layout.tsx');
  const overlaySource = readSource('src/ui/components/TradePositionRow/OverlayActions.tsx');
  const closePositionSource = readSource('src/features/trade/ClosePositionScreen.tsx');
  const closeBySource = readSource('src/features/trade/CloseByScreen.tsx');
  const positionsStateSource = readSource('src/state/positionsState.ts');
  const rowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');
  const closeFlowSource = readSource('src/features/trade/closePositionFlow.ts');
  const hostSource = readSource('src/features/trade/TradePositionActionHost.tsx');
  const hostControllerSource = readSource('src/features/trade/tradePositionActionHostController.ts');
  const tradeScreenSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');

  assert.match(rootSource, /import \{ TradePositionActionHost \} from/);
  assert.match(rootSource, /<TradePositionActionHost \/>/);
  assert.match(rootSource, /<Stack\.Screen name='quotes\/details' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='quotes\/market-statistics' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='trade\/order-ticket' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='trade\/close-position' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='trade\/close-by' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(rootSource, /<Stack\.Screen name='trade\/modify-position' options=\{\{ headerShown: false, animation: 'none' \}\}/);
  assert.match(hostControllerSource, /export function showTradePositionAction/);
  assert.match(hostControllerSource, /visualApplier\?\.\(true\)/);
  assert.match(hostControllerSource, /visualApplier\?\.\(false\)/);
  assert.match(hostSource, /setNativeProps/);
  assert.match(hostSource, /ClosePositionScreen[\s\S]*hosted[\s\S]*onHostedBack=\{closeHost\}/);
  assert.match(hostSource, /CloseByScreen[\s\S]*hosted[\s\S]*onHostedBack=\{closeHost\}/);
  assert.match(hostSource, /ModifyPositionScreen[\s\S]*hosted[\s\S]*onHostedBack=\{closeHost\}/);
  assert.match(tradeScreenSource, /import \{ showTradePositionAction \} from '\.\.\/tradePositionActionHostController'/);
  assert.match(tradeScreenSource, /showTradePositionAction\('close', item\.id\)/);
  assert.match(tradeScreenSource, /showTradePositionAction\('modify', item\.id\)/);
  assert.doesNotMatch(tradeScreenSource, /router\.push\(\{ pathname: '\/trade\/close-position'/);
  assert.doesNotMatch(tradeScreenSource, /router\.push\(\{ pathname: '\/trade\/close-by'/);
  assert.doesNotMatch(tradeScreenSource, /router\.push\(\{ pathname: '\/trade\/modify-position'/);
  assert.match(overlaySource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS \} from '\.\.\/\.\.\/\.\.\/utils\/actionLatency'/);
  // Overlay actions sit under the row swipe gesture: they must fire on press
  // RELEASE so a swipe-back that starts on a button is cancelled by the pan
  // claim instead of instantly submitting (a touch-down close fired the trade
  // close during reverse swipes). Never re-add activateOnPressIn/onPressIn here.
  assert.match(overlaySource, /onPress=\{onClose\}[\s\S]*latencyLabel="tradeRow\.closePosition\.submit"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.doesNotMatch(overlaySource, /activateOnPressIn|activateOnTouchStart|onPressIn=\{/);
  assert.match(overlaySource, /onPress=\{onModify\}/);
  // The row's X closes the position immediately (optimistic) instead of opening the Close Position screen.
  assert.match(rowSource, /import \{ closePositionImmediately \} from '\.\.\/\.\.\/\.\.\/features\/trade\/closePositionFlow'/);
  assert.match(rowSource, /import \{ showTradePositionAction \} from '\.\.\/\.\.\/\.\.\/features\/trade\/tradePositionActionHostController'/);
  assert.match(rowSource, /onClose=\{\(\) => runOverlayAction\(\(\) => closePositionImmediately\(item, \{[\s\S]*quote: liveQuote,[\s\S]*resolvedLogin: tradingLogin,[\s\S]*\}\)\)\}/);
  assert.match(rowSource, /showTradePositionAction\(destination, item\.id\)/);
  assert.doesNotMatch(rowSource, /onCloseBy|openPositionAction\('close-by'/);
  assert.doesNotMatch(rowSource, /router\.push\(\{ pathname: '\/trade\/close-by'/);
  assert.doesNotMatch(rowSource, /router\.push\(\{ pathname: '\/trade\/modify-position'/);
  assert.match(closeFlowSource, /beginOptimisticClose\(ticketId\)[\s\S]*void positionsApi[\s\S]*\.closePosition\(ticketId\)/);
  assert.match(closeFlowSource, /finishOptimisticClose\(ticketId\)/);
  assert.match(closeFlowSource, /rollbackOptimisticClose\(closeSnapshot\)/);
  assert.match(closeFlowSource, /Alert\.alert\(feedback\.title, feedback\.message\)/);
  assert.match(closePositionSource, /import \{ CRITICAL_TRADE_ACTION_MAX_LATENCY_MS \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(closePositionSource, /onPress=\{\(\) => \{ void handleClosePosition\(\); \}\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="closePosition\.submit"[\s\S]*latencyBudgetMs=\{CRITICAL_TRADE_ACTION_MAX_LATENCY_MS\}/);
  assert.match(closePositionSource, /beginOptimisticClose\(ticketId\)[\s\S]*leaveScreen\(\)[\s\S]*void positionsApi\.closePosition\(ticketId\)/);
  assert.match(closePositionSource, /const leaveScreen = useCallback\(\(\) => \{[\s\S]*if \(hosted\) \{[\s\S]*hideTradePositionActionHost/);
  assert.match(closePositionSource, /finishOptimisticClose\(ticketId\)/);
  assert.match(closePositionSource, /rollbackOptimisticClose\(closeSnapshot\)/);
  assert.match(closePositionSource, /Alert\.alert\(feedback\.title, feedback\.message\)/);
  assert.match(closeBySource, /Close By is unavailable for this API contract/);
  assert.doesNotMatch(closeBySource, /positionsApi|beginOptimisticClose|ticket_by/);
  assert.match(closeBySource, /const leaveScreen = useCallback\(\(\) => \{[\s\S]*if \(hosted\) \{[\s\S]*hideTradePositionActionHost/);
  assert.match(positionsStateSource, /const OPTIMISTIC_CLOSE_SUPPRESS_MS = 60_000/);
  assert.match(positionsStateSource, /const optimisticCloseUntilByPositionId = new Map<string, number>\(\)/);
  assert.match(positionsStateSource, /beginOptimisticClose: \(positionId\) => \{[\s\S]*markPositionOptimisticallyClosing\(positionId\)[\s\S]*get\(\)\.removePosition\(positionId\)/);
  assert.match(positionsStateSource, /finishOptimisticClose: \(positionId\) => \{[\s\S]*markPositionOptimisticallyClosing\(positionId\)[\s\S]*get\(\)\.removePosition\(positionId\)/);
  assert.match(positionsStateSource, /rollbackOptimisticClose: \(position\) => \{[\s\S]*clearPositionOptimisticallyClosing\(position\.id\)[\s\S]*positionSnapshots:/);
  assert.match(positionsStateSource, /dtos\.filter\(\(dto\) => !isPositionOptimisticallyClosing\(resolvePositionId\(dto\)\)\)/);
  assert.match(positionsStateSource, /if \(isPositionOptimisticallyClosing\(resolvePositionId\(dto\)\)\) \{/);
});

test('high-traffic tab screens keep fast actions off the old trace wrapper', () => {
  const quotesSource = readSource('src/features/quotes/QuotesScreen.tsx');
  const historySource = readSource('src/features/history/HistoryScreen.tsx');
  const tradeSummarySource = readSource('src/features/trade/TradeScreen/SummaryHeader.tsx');
  const chartSettingsSource = readSource('src/features/chart/ChartSettingsScreen.tsx');

  assert.match(quotesSource, /const hideActionSheet = useUIState\(\(s\) => s\.hideActionSheet\)/);
  assert.match(quotesSource, /const openAddSymbolModal = useCallback/);
  assert.match(quotesSource, /hideActionSheet\(\);\s*setShowAddModal\(true\)/);
  assert.match(quotesSource, /<Modal[\s\S]*visible=\{visible\}[\s\S]*animationType="none"/);
  assert.match(quotesSource, /onPress=\{openAddSymbolModal\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quotes\.addAsset\.open"/);
  assert.match(quotesSource, /animationType="none"/);
  assert.match(quotesSource, /latencyLabel="quotes\.addSymbol\.search\.clear"/);
  assert.match(quotesSource, /latencyLabel=\{`quotes\.addSymbol\.folder\.\$\{item\.key\}`\}/);
  assert.match(quotesSource, /canCancelContentTouches=\{(?:false|Platform\.OS\s*===\s*['"]ios['"])\}/);
  assert.match(quotesSource, /onPress=\{toggleEditMode\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quotes\.editMode\.toggle"/);
  assert.match(quotesSource, /onPress=\{handleHeaderBack\}[\s\S]*activateOnPressIn[\s\S]*latencyLabel="quotes\.addSymbol\.back"/);
  assert.match(quotesSource, /latencyLabel="quotes\.search\.clear"/);
  assert.doesNotMatch(quotesSource, /traceUiInteraction/);
  assert.match(historySource, /latencyLabel="history\.sort\.open"/);
  assert.match(historySource, /latencyLabel="history\.sort\.open"[\s\S]*activateOnTouchStart/);
  assert.match(historySource, /latencyLabel=\{`history\.tab\.\$\{item\}`\}/);
  assert.doesNotMatch(historySource, /traceUiInteraction/);
  assert.match(tradeSummarySource, /latencyLabel="trade\.summary\.toggle"/);
  assert.match(tradeSummarySource, /latencyLabel="trade\.bulk\.open"/);
  assert.match(tradeSummarySource, /latencyLabel="trade\.bulk\.open"[\s\S]*activateOnTouchStart/);
  assert.doesNotMatch(tradeSummarySource, /traceUiInteraction/);
  assert.match(chartSettingsSource, /latencyLabel="chartSettings\.back"/);
  assert.match(chartSettingsSource, /latencyLabel=\{`chartSettings\.nav\.\$\{label\}`\}/);
  assert.doesNotMatch(chartSettingsSource, /traceUiInteraction/);
});

test('chart native and web hot actions use the shared immediate action guard', () => {
  const nativeChartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const webChartSource = readSource('src/features/chart/ChartScreen.web.tsx');

  assert.match(nativeChartSource, /import \{ runImmediateAction \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(nativeChartSource, /runImmediateAction\('chart\.timeframePicker\.open'/);
  assert.match(nativeChartSource, /runImmediateAction\('chart\.moreMenu\.open'/);
  assert.match(nativeChartSource, /runImmediateAction\('chart\.tradeSheet\.pending\.submit'/);
  assert.match(nativeChartSource, /onPress=\{handleOpenSymbolPicker\}[\s\S]*activateOnTouchStart/);
  const scrollableToolbar = nativeChartSource.slice(
    nativeChartSource.indexOf('const renderCompactHeaderToolbar'),
    nativeChartSource.indexOf('const renderChartTradeSheetTopHeader'),
  );
  for (const action of ['timeframe', 'sltp', 'drawings', 'more']) {
    assert.ok(scrollableToolbar.includes(`onPress={() => routeChartWindowToolbarAction('${action}')}`));
  }
  // Release activation keeps horizontal toolbar swipes from opening a sheet.
  assert.doesNotMatch(scrollableToolbar, /activateOnTouchStart|activateOnPressIn|onPressIn=/);
  assert.match(
    nativeChartSource,
    /useChartWindowToolbarRouter\([\s\S]*timeframe: handleOpenTimeframePicker[\s\S]*drawings: handleOpenDrawingTools[\s\S]*more: handleOpenMoreMenu/,
  );
  assert.doesNotMatch(nativeChartSource, /traceUiInteraction/);
  assert.match(webChartSource, /import \{ runCriticalTradeAction, runImmediateAction \} from '\.\.\/\.\.\/utils\/actionLatency'/);
  assert.match(webChartSource, /runImmediateAction\('chart\.web\.timeframePicker\.open'/);
  assert.match(webChartSource, /runImmediateAction\('chart\.web\.moreMenu\.open'/);
  assert.doesNotMatch(webChartSource, /traceUiInteraction/);
});

test('fast action surfaces keep light and dark theme styling wired', () => {
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const actionSheetStyles = readSource('src/ui/components/ActionSheet/styles.ts');
  const settingsStyles = readSource('src/features/settings/SettingsScreen/styles.ts');
  const orderTicketSource = readSource('src/features/trade/OrderTicketScreen.tsx');
  const sidebarSource = readSource('src/ui/components/SidebarDrawer.tsx');

  assert.match(tabsSource, /backgroundColor: isDark \? T\.bg : '#ffffff'/);
  assert.match(tabsSource, /borderTopColor: isDark \? T\.borderSubtle : 'rgba\(0,0,0,0\.05\)'/);
  assert.match(tabsSource, /const inactiveTabColor = isDark \? T\.textMuted : T\.textDimmed/);
  assert.match(tabsSource, /const themeMode = useThemeMode\(\)/);
  assert.doesNotMatch(tabsSource, /useDeferredThemeMode\(\)/);
  assert.match(actionSheetStyles, /makeActionSheetStyles\(T: ThemeColors, isDark: boolean\)/);
  assert.match(actionSheetStyles, /backgroundColor: isDark \? 'rgba\(0,0,0,0\.28\)' : 'rgba\(0,0,0,0\.12\)'/);
  assert.match(settingsStyles, /makeSettingsStyles = \(T: ThemeColors, themeMode: 'light' \| 'dark'\)/);
  assert.match(settingsStyles, /const SETTINGS_DARK_BACKGROUND = '#121212'/);
  assert.match(settingsStyles, /const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E'/);
  assert.match(settingsStyles, /const resolveSettingsBackground = \(T: ThemeColors, themeMode: 'light' \| 'dark'\) =>\s*themeMode === 'dark' \? SETTINGS_DARK_BACKGROUND : T\.bg/);
  assert.match(settingsStyles, /const resolveSettingsCardBackground = \(T: ThemeColors, themeMode: 'light' \| 'dark'\) =>\s*themeMode === 'dark' \? SETTINGS_DARK_CARD_BACKGROUND : T\.glass2/);
  assert.match(settingsStyles, /const settingsBackground = resolveSettingsBackground\(T, themeMode\)/);
  assert.match(settingsStyles, /const settingsCardBackground = resolveSettingsCardBackground\(T, themeMode\)/);
  assert.match(settingsStyles, /screen: \{ flex: 1, backgroundColor: settingsBackground \}/);
  assert.match(settingsStyles, /container: \{ flex: 1, backgroundColor: settingsBackground \}/);
  assert.match(settingsStyles, /headerWrap: \{[\s\S]*backgroundColor: settingsBackground/);
  assert.match(settingsStyles, /metricBlock: \{[\s\S]*backgroundColor: settingsCardBackground/);
  assert.match(settingsStyles, /singleRowCard: \{[\s\S]*backgroundColor: settingsCardBackground/);
  assert.match(settingsStyles, /singleRowCardLogout: \{[\s\S]*backgroundColor: settingsCardBackground/);
  assert.match(settingsStyles, /groupCard: \{ backgroundColor: settingsCardBackground/);
  assert.match(orderTicketSource, /function makeStyles\(T: ThemeColors, isDark: boolean\)/);
  assert.match(orderTicketSource, /root: \{ flex: 1, backgroundColor: BG \}/);
  assert.match(sidebarSource, /const themeMode = useThemeMode\(\)/);
  assert.match(sidebarSource, /const T = themeMode === 'light' \? GLight : GDark/);
  assert.match(sidebarSource, /const ds = SIDEBAR_STYLES_BY_MODE\[themeMode\]/);
});

test('theme toggles paint drawer chrome before retained scenes and preference persistence', () => {
  const storeSource = readSource('src/state/userPreferences/store.ts');
  const themeModeSource = readSource('src/state/themeMode.ts');
  const rootSource = readSource('app/_layout.tsx');
  const tabsSource = readSource('app/(tabs)/_layout.tsx');
  const fastTabNavigatorSource = readSource('src/ui/navigation/FastTabNavigator.tsx');
  const sidebarSource = readSource('src/ui/components/SidebarDrawer.tsx');
  const sidebarDestinationHostSource = readSource('src/ui/components/SidebarDestinationHost.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const settingRowSource = readSource('src/features/settings/SettingsScreen/SettingRow.tsx');
  const directPreferenceThemeSubscribers = [
    ...walkSourceFiles('app'),
    ...walkSourceFiles('src'),
  ].filter(
    (file) =>
      !file.endsWith('.test.ts')
      && !file.endsWith('.test.tsx')
      && file !== 'src/state/userPreferences/store.ts',
  ).filter((file) => {
    const source = readSource(file);
    return (
      /useUserPreferences\(\s*\([^)]*\)\s*=>\s*[^)]*?\.themeMode\s*\)/.test(source)
      || /themeMode:\s*state\.themeMode/.test(source)
    );
  });

  assert.deepEqual(
    directPreferenceThemeSubscribers,
    [],
    'rendering code must use the priority-aware theme clock, not the persisted preference mirror',
  );
  assert.match(storeSource, /const pendingPreferenceWrites = new Map<string, StorageValue<PersistedUserPreferencesState>>\(\)/);
  assert.match(storeSource, /function schedulePreferenceWriteFlush\(\)/);
  assert.match(storeSource, /requestAnimationFrame/);
  assert.match(storeSource, /setTimeout\(flushPendingPreferenceWrites, 0\)/);
  assert.match(storeSource, /preferenceWriteFlushFallbackTimer = setTimeout\(flushPendingPreferenceWrites, 100\)/);
  assert.match(storeSource, /partialize: partializeUserPreferences/);
  assert.match(
    storeSource,
    /function flushPendingPreferenceWrites\(\) \{[\s\S]*sanitizePreferenceAuthStorageValue\(value\)[\s\S]*AsyncStorage\.setItem\(name, JSON\.stringify\(sanitized\)\)/,
  );
  const storageSetterStart = storeSource.indexOf('setItem: (name, value) => {');
  const storageSetterEnd = storeSource.indexOf('\n  removeItem:', storageSetterStart);
  assert.notEqual(storageSetterStart, -1);
  assert.notEqual(storageSetterEnd, -1);
  const storageSetterSource = storeSource.slice(storageSetterStart, storageSetterEnd);
  assert.match(storageSetterSource, /pendingPreferenceWrites\.set\(name, value\)/);
  assert.doesNotMatch(storageSetterSource, /sanitizePreferenceAuthStorageValue|JSON\.stringify/);
  const preferenceThemeSetterStart = storeSource.indexOf('setThemeMode: (mode) => {');
  const preferenceThemeSetterEnd = storeSource.indexOf('\n      addQuoteSymbol:', preferenceThemeSetterStart);
  assert.notEqual(preferenceThemeSetterStart, -1);
  assert.notEqual(preferenceThemeSetterEnd, -1);
  const preferenceThemeSetterSource = storeSource.slice(preferenceThemeSetterStart, preferenceThemeSetterEnd);
  assert.match(preferenceThemeSetterSource, /setImmediateThemeMode\(mode\)/);
  assert.match(preferenceThemeSetterSource, /if \(get\(\)\.themeMode !== mode\) \{\s*set\(\{ themeMode: mode \}\)/);
  assert.doesNotMatch(preferenceThemeSetterSource, /scheduleThemeModePreferenceCommit/);
  assert.ok(
    preferenceThemeSetterSource.indexOf('setImmediateThemeMode(mode)')
      < preferenceThemeSetterSource.indexOf('set({ themeMode: mode })'),
    'the lightweight theme clock must update before its persisted preference mirror',
  );
  assert.match(storeSource, /setImmediateThemeMode\(state\.themeMode, \{ deferRetained: false \}\)/);
  assert.doesNotMatch(storeSource, /createJSONStorage\(\(\) => AsyncStorage\)/);
  assert.match(themeModeSource, /const immediateThemeVisualAppliers = new Set<ImmediateThemeVisualApplier>\(\)/);
  assert.match(themeModeSource, /export function registerImmediateThemeVisualApplier\(applier: ImmediateThemeVisualApplier\)[\s\S]*immediateThemeVisualAppliers\.add\(applier\)[\s\S]*immediateThemeVisualAppliers\.delete\(applier\)/);
  assert.match(themeModeSource, /retainedThemeMode: ThemeMode/);
  assert.match(
    themeModeSource,
    /ThemeModeRenderPriorityContext =\s*createContext<ThemeModeRenderPriority>\('immediate'\)/,
  );
  assert.match(themeModeSource, /const themeModePostPaintTasks = new Set<ThemeModePostPaintTask>\(\)/);
  assert.match(themeModeSource, /let themeModePostPaintFlushing = false/);
  assert.match(
    themeModeSource,
    /function scheduleThemeModePostPaintFlush\(\)[\s\S]*scheduleAfterVisualFrame\(flushThemeModePostPaintWork\)/,
  );
  assert.match(
    themeModeSource,
    /export function scheduleAfterImmediateThemePaint\(task: ThemeModePostPaintTask\)[\s\S]*themeModePostPaintTasks\.add\(task\)[\s\S]*scheduleThemeModePostPaintFlush\(\)/,
  );
  assert.match(
    themeModeSource,
    /export function setImmediateThemeMode\([\s\S]*state\.setImmediateThemeMode\(mode\)[\s\S]*pendingRetainedThemeMode =[\s\S]*scheduleThemeModePostPaintFlush\(\)/,
  );
  assert.match(
    themeModeSource,
    /if \(retainedMode !== null\) \{[\s\S]*applyImmediateThemeVisuals\(retainedMode\)[\s\S]*setRetainedThemeMode\(retainedMode\)/,
  );
  assert.ok(
    themeModeSource.indexOf('postPaintTasks.forEach((task) => {')
      < themeModeSource.indexOf('const retainedMode = pendingRetainedThemeMode;'),
    'queued rapid reversals must resolve before the retained mode is captured',
  );
  assert.match(themeModeSource, /export function useDeferredThemeMode\(delayMs = 750\): ThemeMode/);
  // Visual palettes never freeze; hidden shells follow the retained clock.
  assert.doesNotMatch(themeModeSource, /NavigationContext|NavigationRouteContext|useNavigationFocusState/);
  assert.match(themeModeSource, /const renderPriority = useContext\(ThemeModeRenderPriorityContext\)/);
  assert.match(themeModeSource, /const useRetainedThemeClock =[\s\S]*renderPriority === 'retained' \|\| options\?\.active === false/);
  assert.match(themeModeSource, /useRetainedThemeClock[\s\S]*state\.retainedThemeMode[\s\S]*state\.themeMode/);
  assert.match(themeModeSource, /\[useRetainedThemeClock\]/);
  assert.doesNotMatch(themeModeSource, /frozenThemeModeRef|renderPriority === 'frozen'/);
  assert.match(themeModeSource, /setTimeout\(\(\) => \{[\s\S]*setThemeMode\(state\.themeMode\);[\s\S]*\}, delayMs\)/);
  assert.match(readSource('src/ui/theme/useTheme.ts'), /const themeMode = useThemeMode\(options\)/);
  assert.match(rootSource, /function AppStatusBar\(\)[\s\S]*const isDark = useIsDarkTheme\(\)/);
  assert.match(rootSource, /function ThemedNavigatorShell\(\)[\s\S]*const navigationThemeMode = useThemeMode\(\)/);
  assert.match(
    rootSource,
    /<ThemeModeRenderPriorityContext\.Provider value="retained">[\s\S]*<SidebarDestinationHost \/>[\s\S]*<TradePositionActionHost \/>[\s\S]*<ChartConfigDestinationHost \/>[\s\S]*<\/ThemeModeRenderPriorityContext\.Provider>[\s\S]*<SidebarDrawer \/>/,
  );
  assert.doesNotMatch(rootSource, /function InnerLayout\(\) \{\s*const T = useTheme\(\)/);
  assert.match(
    fastTabNavigatorSource,
    /<ThemeModeRenderPriorityContext\.Provider value="retained">[\s\S]*<SceneContent[\s\S]*<\/ThemeModeRenderPriorityContext\.Provider>/,
  );
  assert.match(
    sidebarDestinationHostSource,
    /<ThemeModeRenderPriorityContext\.Provider value="retained">[\s\S]*<DestinationView active=\{active\} \/>/,
  );
  assert.match(tabsSource, /ThemedTabsChrome/);
  assert.match(tabsSource, /const themeMode = useThemeMode\(\)/);
  assert.match(tabsSource, /const isDark = themeMode === 'dark'/);
  assert.match(tabsSource, /const T = themeMode === 'light' \? GLight : GDark/);
  assert.doesNotMatch(tabsSource, /useDeferredThemeMode\(\)/);
  assert.doesNotMatch(tabsSource, /const T = useTheme\(\)/);
  assert.doesNotMatch(sidebarSource, /SIDEBAR_THEME_COMMIT_DELAY_MS/);
  assert.match(sidebarSource, /const themeMode = useThemeMode\(\)/);
  assert.match(sidebarSource, /const \[pendingThemeMode, setPendingThemeMode\] = useState<ThemeMode \| null>\(null\)/);
  assert.match(sidebarSource, /const selectedThemeMode = pendingThemeMode \?\? appliedThemeMode/);
  assert.match(sidebarSource, /const themeCommitGenerationRef = useRef\(0\)/);
  assert.match(
    sidebarSource,
    /setImmediateThemeMode\(nextMode\);[\s\S]*scheduleAfterImmediateThemePaint\(\(\) => \{[\s\S]*setPreferenceThemeMode\(nextMode\)/,
  );
  assert.match(
    sidebarSource,
    /setPendingThemeMode\(nextMode\);[\s\S]*onSelectThemeMode\(nextMode\)/,
  );
  assert.match(
    sidebarSource,
    /<SidebarThemeSelector[\s\S]*appliedThemeMode=\{themeMode\}[\s\S]*onSelectThemeMode=\{handleThemeModePress\}/,
  );
  assert.match(
    sidebarSource,
    /function SidebarThemeSelector\(\{[\s\S]*appliedThemeMode,[\s\S]*onSelectThemeMode,[\s\S]*\}: SidebarThemeSelectorProps\)/,
  );
  assert.match(sidebarSource, /const SIDEBAR_STYLES_BY_MODE: Record<ThemeMode, ReturnType<typeof makeStyles>>/);
  assert.doesNotMatch(sidebarSource, /setTimeout\(commitPendingThemeMode/);
  assert.match(sidebarSource, /onPress=\{\(\) => handleThemeModePress\('light'\)\}/);
  assert.match(sidebarSource, /onPress=\{\(\) => handleThemeModePress\('dark'\)\}/);
  assert.match(sidebarSource, /<Pressable[\s\S]*style=\{!selectedIsDark \? ds\.themeOptActive : ds\.themeOptInactive\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="sidebar\.themeLight"[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(sidebarSource, /<Pressable[\s\S]*style=\{selectedIsDark \? ds\.themeOptActive : ds\.themeOptInactive\}[\s\S]*activateOnTouchStart[\s\S]*latencyLabel="sidebar\.themeDark"[\s\S]*unstable_pressDelay=\{0\}/);
  assert.match(settingsSource, /const appliedThemeMode = useThemeMode\(\)/);
  assert.match(settingsSource, /const \[pendingThemeMode, setPendingThemeMode\] = useState/);
  assert.match(settingsSource, /const applyThemeMode = useCallback\(\(nextMode: 'light' \| 'dark'\) => \{/);
  assert.match(settingsSource, /const toggleThemeMode = useCallback\(\(\) => \{\s*applyThemeMode\(themeMode === 'light' \? 'dark' : 'light'\);/);
  assert.match(settingsSource, /const isThemeItem = item\.title === 'Theme'/);
  assert.match(settingsSource, /const routePath = item\.routePath/);
  assert.match(settingsSource, /onPress=\{isThemeItem \? toggleThemeMode : routePath \|\| item\.action \? \(\) => handleSearchResultPress\(item\) : undefined\}/);
  assert.match(settingsSource, /onPressIn=\{routePath \? \(\) => prepareReadySettingsRoute\(routePath\) : undefined\}/);
  assert.doesNotMatch(settingsSource, /activateOnPressIn=\{isThemeItem\}/);
  assert.doesNotMatch(settingsSource, /title=\{t\('Theme'\)\}[\s\S]*onPress=\{toggleThemeMode\}[\s\S]*activateOnPressIn/);
  assert.match(settingsSource, /<View pointerEvents="none">[\s\S]*<Switch/);
  assert.match(settingRowSource, /activateOnPressIn\?: boolean/);
  assert.match(settingRowSource, /activateOnPressIn=\{activateOnPressIn\}/);
});
