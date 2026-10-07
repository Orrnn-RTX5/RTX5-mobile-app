import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readOrderTicketSource = () =>
  readFileSync(resolve(process.cwd(), 'src/features/trade/OrderTicketScreen.tsx'), 'utf8');

test('order ticket pending submit uses the pending-order API contract', () => {
  const source = readOrderTicketSource();
  const pendingStart = source.indexOf('const handlePlacePendingOrder = async () =>');
  const pendingEnd = source.indexOf('const rawSpreadPoints =', pendingStart);
  assert.notEqual(pendingStart, -1, 'pending submit handler must exist');
  assert.notEqual(pendingEnd, -1, 'pending submit handler boundary must exist');

  const pendingHandler = source.slice(pendingStart, pendingEnd);
  assert.match(pendingHandler, /price:\s*pendingEntryPrice/);
  assert.match(pendingHandler, /stopLimitPrice:\s*pendingStopLimitPrice/);
  assert.match(pendingHandler, /ordersApi\.placePendingOrder\(payload\)/);
  assert.doesNotMatch(pendingHandler, /ordersApi\.placeMarketOrder\(payload as any\)/);
});

test('order ticket keeps Market Execution available and visibly locks every pending type', () => {
  const source = readOrderTicketSource();
  const tabsStart = source.indexOf('{CHART_ORDER_TYPES.map((option) => {');
  const tabsEnd = source.indexOf('</ScrollView>', tabsStart);
  assert.notEqual(tabsStart, -1, 'order type tabs must exist');
  assert.notEqual(tabsEnd, -1, 'order type tab boundary must exist');

  const tabsSource = source.slice(tabsStart, tabsEnd);
  assert.match(source, /const \[orderType, setOrderType\] = useState<ChartOrderType>\('Market Execution'\)/);
  assert.match(tabsSource, /const isBackendLocked = isPendingOrderTypeBackendLocked\(option\)/);
  assert.match(tabsSource, /disabled=\{isBackendLocked\}/);
  assert.match(tabsSource, /accessibilityState=\{\{ selected: active, disabled: isBackendLocked \}\}/);
  assert.match(tabsSource, /if \(isPendingOrderTypeBackendLocked\(option\)\) \{\s*return;\s*\}[\s\S]*setOrderType\(option\)/);
  assert.match(tabsSource, /<Ionicons name="lock-closed" size=\{13\}/);
});

test('order ticket applies independent market and pending SL/TP gates', () => {
  const source = readOrderTicketSource();
  const gateStart = source.indexOf('const handleStopLevelAdjustment = useCallback');
  const gateEnd = source.indexOf('/* Pending order placement */', gateStart);
  const marketSubmitStart = source.indexOf('const handlePlaceOrder = async');
  const marketSubmitEnd = source.indexOf('const queryClient =', marketSubmitStart);
  const pendingSubmitStart = source.indexOf('const handlePlacePendingOrder = async');
  const pendingSubmitEnd = source.indexOf('const rawSpreadPoints =', pendingSubmitStart);
  assert.notEqual(gateStart, -1, 'SL/TP availability handler must exist');
  assert.notEqual(gateEnd, -1, 'SL/TP availability handler boundary must exist');
  assert.notEqual(marketSubmitStart, -1, 'market submit handler must exist');
  assert.notEqual(marketSubmitEnd, -1, 'market submit handler boundary must exist');
  assert.notEqual(pendingSubmitStart, -1, 'pending submit handler must exist');
  assert.notEqual(pendingSubmitEnd, -1, 'pending submit handler boundary must exist');

  const gateSource = source.slice(gateStart, gateEnd);
  const marketSubmitSource = source.slice(marketSubmitStart, marketSubmitEnd);
  const pendingSubmitSource = source.slice(pendingSubmitStart, pendingSubmitEnd);
  assert.match(
    source,
    /const newMarketOrderProtectionBackendLocked =[\s\S]*isNewMarketOrderProtectionBackendLocked\(\);[\s\S]*const pendingOrderProtectionBackendLocked =[\s\S]*isPendingOrderProtectionBackendLocked\(\);[\s\S]*const protectionBackendLocked = isPendingOrderType[\s\S]*\? pendingOrderProtectionBackendLocked[\s\S]*: newMarketOrderProtectionBackendLocked/,
  );
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*if \(!protectionBackendLocked\) \{[\s\S]*return;[\s\S]*\}[\s\S]*setSlEnabled\(false\);[\s\S]*setSlPrice\(0\);[\s\S]*setTpEnabled\(false\);[\s\S]*setTpPrice\(0\);[\s\S]*\}, \[protectionBackendLocked\]\)/,
  );
  assert.match(gateSource, /if \(protectionBackendLocked\)/);
  assert.match(
    gateSource,
    /Alert\.alert\(t\(SLTP_COMING_SOON_TITLE\), t\(getActiveSltpUnavailableMessage\(\)\)\)/,
  );
  assert.match(gateSource, /adjustStopLoss\(direction\)/);
  assert.match(gateSource, /adjustTakeProfit\(direction\)/);
  assert.equal(
    source.match(/onPress=\{\(\) => handleStopLevelAdjustment\('(?:sl|tp)', -?1\)\}/g)?.length,
    4,
    'all four SL/TP stepper actions must use the availability gate',
  );
  assert.match(source, /const adjustStopLoss = useCallback/);
  assert.match(source, /const adjustTakeProfit = useCallback/);
  assert.match(
    marketSubmitSource,
    /const marketProtectionLockedAtSubmit =[\s\S]*isNewMarketOrderProtectionBackendLocked\(\);[\s\S]*if \(marketProtectionLockedAtSubmit && hasProtectionIntent\) \{[\s\S]*showModal\([\s\S]*SLTP_COMING_SOON_TITLE[\s\S]*getActiveSltpUnavailableMessage\(\)[\s\S]*return;/,
  );
  assert.match(
    marketSubmitSource,
    /\.\.\.\(!marketProtectionLockedAtSubmit && slEnabled && slPrice > 0 \? \{ price_sl: slPrice \} : \{\}\)/,
  );
  assert.match(
    marketSubmitSource,
    /\.\.\.\(!marketProtectionLockedAtSubmit && tpEnabled && tpPrice > 0 \? \{ price_tp: tpPrice \} : \{\}\)/,
  );
  assert.match(
    pendingSubmitSource,
    /const pendingProtectionLockedAtSubmit =[\s\S]*isPendingOrderProtectionBackendLocked\(\);[\s\S]*if \(pendingProtectionLockedAtSubmit && hasProtectionIntent\) \{[\s\S]*showModal\([\s\S]*SLTP_COMING_SOON_TITLE[\s\S]*getActiveSltpUnavailableMessage\(\)[\s\S]*return;/,
  );
  assert.match(
    pendingSubmitSource,
    /\.\.\.\(!pendingProtectionLockedAtSubmit && slEnabled && slPrice > 0 \? \{ price_sl: slPrice \} : \{\}\)/,
  );
  assert.match(
    pendingSubmitSource,
    /\.\.\.\(!pendingProtectionLockedAtSubmit && tpEnabled && tpPrice > 0 \? \{ price_tp: tpPrice \} : \{\}\)/,
  );
  assert.equal(
    source.match(/disabled=\{protectionBackendLocked\}/g)?.length,
    4,
    'all four SL/TP stepper controls must be disabled while protection is locked',
  );
  assert.equal(
    source.match(/accessibilityState=\{\{ disabled: protectionBackendLocked \}\}/g)?.length,
    4,
    'all four SL/TP stepper controls must expose their locked state',
  );
  assert.match(
    source,
    /style=\{\[styles\.sltpRow, protectionBackendLocked && styles\.sltpRowDisabled\]\}/,
  );
});

test('order ticket symbol picker updates the same screen instead of routing', () => {
  const source = readOrderTicketSource();
  const interactiveStart = source.indexOf('function OrderTicketInteractiveContent()');
  const pickerStart = source.indexOf('const handleSymbolSelect = useCallback', interactiveStart);
  const pickerEnd = source.indexOf('const symbolPickerActions = useMemo', pickerStart);
  assert.notEqual(pickerStart, -1, 'symbol select handler must exist');
  assert.notEqual(pickerEnd, -1, 'symbol select handler boundary must exist');

  const pickerHandler = source.slice(pickerStart, pickerEnd);
  assert.match(source, /const \[symbol, setSymbol\] = useState\(routeInitialSymbol\)/);
  assert.doesNotMatch(source, /DEFAULT_CHART_SYMBOLS\.forEach\(addSymbol\)/);
  assert.match(source, /marketSymbols[\s\S]*\.forEach\(addSymbol\)/);
  assert.match(source, /const close = useCallback\(\(\) => setSymbolPickerOpen\(false\), \[\]\)/);
  assert.match(source, /onClose=\{close\}/);
  assert.match(pickerHandler, /setSymbol\(normalizedNextSymbol\)/);
  assert.doesNotMatch(pickerHandler, /router\.(?:push|replace)/);
  assert.match(source, /lastConfiguredPendingOrderTypeRef\.current = null/);
});

test('order ticket dollar picker opens without re-rendering the live ticket tree', () => {
  const source = readOrderTicketSource();
  const interactiveStart = source.indexOf('function OrderTicketInteractiveContent()');
  const interactiveSource = source.slice(interactiveStart);

  assert.match(source, /const OrderTicketSymbolPickerSheetHost = memo\(forwardRef</);
  assert.match(source, /useImperativeHandle\(ref, \(\) => \(\{ open \}\), \[open\]\)/);
  assert.match(source, /visualKey=\{ORDER_TICKET_SYMBOL_PICKER_VISUAL_KEY\}/);
  assert.match(interactiveSource, /const symbolPickerSheetRef = useRef<OrderTicketSymbolPickerSheetHostHandle>\(null\)/);
  assert.match(interactiveSource, /symbolPickerSheetRef\.current\?\.open\(\)/);
  assert.match(interactiveSource, /<OrderTicketSymbolPickerSheetHost[\s\S]*ref=\{symbolPickerSheetRef\}[\s\S]*actions=\{symbolPickerActions\}/);
  assert.doesNotMatch(interactiveSource, /const \[symbolPickerOpen, setSymbolPickerOpen\] = useState/);
  assert.match(interactiveSource, /const styles = useMemo\(\(\) => makeStyles\(T, isDark\), \[T, isDark\]\)/);
  assert.match(interactiveSource, /useMarketSymbols\(routeQueriesActive\)/);
});

test('order ticket dollar picker matches the Chart symbol ActionSheet presentation', () => {
  const source = readOrderTicketSource();
  const sheetStart = source.indexOf('<ActionSheet');
  const sheetEnd = source.indexOf('/>', sheetStart);
  assert.notEqual(sheetStart, -1, 'symbol ActionSheet must exist');
  assert.notEqual(sheetEnd, -1, 'symbol ActionSheet boundary must exist');

  const sheetSource = source.slice(sheetStart, sheetEnd);
  assert.match(sheetSource, /visible=\{symbolPickerOpen\}/);
  assert.match(sheetSource, /title=\{t\('Select Symbol'\)\}/);
  assert.match(sheetSource, /searchable/);
  assert.match(sheetSource, /compactText/);
  assert.match(sheetSource, /presentation="mt5Plain"/);
  assert.match(sheetSource, /deferOffscreenActions/);
  assert.match(sheetSource, /maximumVisibleActionRows=\{9\}/);
  assert.match(sheetSource, /detent="large"/);
  assert.match(sheetSource, /instantOpen/);
  assert.match(sheetSource, /entryMotion="mt5Slide"/);
  assert.match(sheetSource, /immediateHostHideOnClose/);
  assert.match(sheetSource, /visualKey=\{ORDER_TICKET_SYMBOL_PICKER_VISUAL_KEY\}/);
  assert.match(sheetSource, /runActionAfterClose=\{false\}/);
  assert.match(sheetSource, /keepFullHeightOnKeyboard/);
  assert.match(sheetSource, /actions=\{actions\}/);
  assert.doesNotMatch(sheetSource, /searchPlaceholder=/);
});

test('order ticket account leverage is read-only from backend account summary', () => {
  const source = readOrderTicketSource();
  const leverageSectionStart = source.indexOf('const backendLeverage =');
  const leverageSectionEnd = source.indexOf('const currency =', leverageSectionStart);
  assert.notEqual(leverageSectionStart, -1, 'backend leverage resolver must exist');
  assert.notEqual(leverageSectionEnd, -1, 'backend leverage resolver boundary must exist');

  const leverageSection = source.slice(leverageSectionStart, leverageSectionEnd);
  assert.match(leverageSection, /const backendLeverage = isOrderTicketLeverageValue\(accountSummary\?\.leverage\)[\s\S]*\? accountSummary\.leverage[\s\S]*: null/);
  assert.match(leverageSection, /const leverage = backendLeverage \?\? ORDER_TICKET_FALLBACK_LEVERAGE/);
  assert.match(leverageSection, /const leverageDisplay = backendLeverage !== null[\s\S]*\? formatOrderTicketLeverage\(backendLeverage\)[\s\S]*: '--'/);
  assert.match(source, /<InfoRow label=\{t\('Acc\. Leverage'\)\} value=\{leverageDisplay\} styles=\{styles\} \/>/);
  assert.match(source, /const resolvedMargin = serverRequiredMargin \?\? estimatedMargin/);
  assert.doesNotMatch(source, /ORDER_TICKET_LEVERAGE_OPTIONS|OrderTicketLeverageOption/);
  assert.doesNotMatch(source, /leveragePickerOpen|selectedLeverageValue|hasManualLeverage/);
  assert.doesNotMatch(source, /InfoSelectRow|handleOpenLeveragePicker|orderTicket\.leverage\.open/);
  assert.doesNotMatch(source, /visible=\{leveragePickerOpen\}|Search leverage/);
});

test('order ticket spread uses the symbol point size', () => {
  const source = readOrderTicketSource();

  assert.match(source, /const rawSpreadPoints = pricePointSize > 0 && Number\.isFinite\(ASK\) && Number\.isFinite\(BID\)[\s\S]*Math\.round\(\(ASK - BID\) \/ pricePointSize\)/);
  assert.match(source, /const spread = Math\.max\(0, rawSpreadPoints\)/);
  assert.doesNotMatch(source, /Math\.round\(\(ASK - BID\) \/ 0\.01\)/);
});

test('order ticket accepts route-seeded SL and TP only when market protection is unlocked', () => {
  const source = readOrderTicketSource();

  assert.match(source, /sl: routeSlParam/);
  assert.match(source, /tp: routeTpParam/);
  assert.match(
    source,
    /const initialMarketProtectionBackendLocked = isNewMarketOrderProtectionBackendLocked\(\)/,
  );
  assert.match(
    source,
    /const initialSlPrice = !initialMarketProtectionBackendLocked[\s\S]*Number\.isFinite\(initialRouteSlPrice\)[\s\S]*initialRouteSlPrice > 0[\s\S]*\? initialRouteSlPrice[\s\S]*: 0/,
  );
  assert.match(
    source,
    /const initialTpPrice = !initialMarketProtectionBackendLocked[\s\S]*Number\.isFinite\(initialRouteTpPrice\)[\s\S]*initialRouteTpPrice > 0[\s\S]*\? initialRouteTpPrice[\s\S]*: 0/,
  );
  assert.match(source, /const \[slEnabled, setSlEnabled\] = useState\(initialSlPrice > 0\)/);
  assert.match(source, /const \[tpEnabled, setTpEnabled\] = useState\(initialTpPrice > 0\)/);
});

test('order ticket graph uses the screen background instead of a white card', () => {
  const source = readOrderTicketSource();
  const graphStart = source.indexOf('<LiveOrderTickExecutionGraph');
  const graphEnd = source.indexOf('/>', graphStart);
  const stylesStart = source.indexOf('executionGraphWrap: {');
  const stylesEnd = source.indexOf('pendingSubmitPlaceholder:', stylesStart);
  assert.notEqual(graphStart, -1, 'order ticket graph must be rendered');
  assert.notEqual(graphEnd, -1, 'order ticket graph props boundary must exist');
  assert.notEqual(stylesStart, -1, 'graph wrapper style must exist');
  assert.notEqual(stylesEnd, -1, 'graph wrapper style boundary must exist');

  const graphProps = source.slice(graphStart, graphEnd);
  const graphWrapStyle = source.slice(stylesStart, stylesEnd);
  assert.match(graphProps, /backgroundColor=\{T\.bg\}/);
  assert.match(graphWrapStyle, /backgroundColor:\s*BG/);
  assert.doesNotMatch(graphWrapStyle, /#FFFFFF/);
});

test('order ticket trade confirmation toast follows the active app theme', () => {
  const source = readOrderTicketSource();
  const stylesStart = source.indexOf('tradeConfirmationCard: {');
  const stylesEnd = source.indexOf('tradeConfirmationSide:', stylesStart);
  assert.notEqual(stylesStart, -1, 'trade confirmation style must exist');
  assert.notEqual(stylesEnd, -1, 'trade confirmation style boundary must exist');

  const toastStyles = source.slice(stylesStart, stylesEnd);
  assert.match(toastStyles, /backgroundColor:\s*isDark \? SURFACE : '#FFFFFF'/);
  assert.match(toastStyles, /borderColor:\s*isDark \? T\.border : 'transparent'/);
  assert.match(toastStyles, /tradeConfirmationSymbol:[\s\S]*color:\s*WHITE/);
  assert.doesNotMatch(toastStyles, /color:\s*'#0F172A'/);
});

test('order ticket buy and sell buttons use blue and red trading colors', () => {
  const source = readOrderTicketSource();
  const actionsStart = source.indexOf('const tradeButtonActions: readonly OrderTicketTradeAction[] = [');
  const actionsEnd = source.indexOf('const sellTradeAction = tradeButtonActions[0];', actionsStart);
  const stylesStart = source.indexOf('execSell: {');
  const stylesEnd = source.indexOf('executionGraphWrap:', stylesStart);
  assert.notEqual(actionsStart, -1, 'trade action config must exist');
  assert.notEqual(actionsEnd, -1, 'trade action config boundary must exist');
  assert.notEqual(stylesStart, -1, 'execution button styles must exist');
  assert.notEqual(stylesEnd, -1, 'execution button style boundary must exist');

  const actionConfig = source.slice(actionsStart, actionsEnd);
  const execStyles = source.slice(stylesStart, stylesEnd);
  assert.match(source, /const SELL_C = T\.trading\.sell\.primary/);
  assert.match(source, /const BUY_C = T\.trading\.buy\.primary/);
  assert.match(source, /const BUY_BG = isDark \? 'rgba\(52,125,255,0\.14\)' : 'rgba\(37,99,235,0\.08\)'/);
  assert.doesNotMatch(source, /const BUY_BG = isDark \? 'rgba\(52,199,89|const BUY_BG = isDark \? 'rgba\(5,150,105/);
  assert.match(actionConfig, /displayLabel:\s*'SELL'[\s\S]*color:\s*SELL_C[\s\S]*backgroundColor:\s*SELL_BG/);
  assert.match(actionConfig, /displayLabel:\s*'BUY'[\s\S]*color:\s*BUY_C[\s\S]*backgroundColor:\s*BUY_BG/);
  assert.match(execStyles, /execSell:\s*\{\s*backgroundColor:\s*SELL_C,\s*shadowColor:\s*SELL_C\s*\}/);
  assert.match(execStyles, /execBuy:\s*\{\s*backgroundColor:\s*BUY_C,\s*shadowColor:\s*BUY_C\s*\}/);
});

test('order ticket SL/TP steppers explain a missing price seed instead of dying silently', () => {
  const source = readOrderTicketSource();
  const slStart = source.indexOf('const adjustStopLoss = useCallback');
  const tpEnd = source.indexOf('const handleStopLevelAdjustment = useCallback');
  assert.notEqual(slStart, -1, 'adjustStopLoss must exist');
  assert.notEqual(tpEnd, -1, 'adjustStopLoss boundary must exist');
  const adjustSource = source.slice(slStart, tpEnd);
  // Without a live seed the stepper used to `return` with no feedback, which
  // read as a dead button.
  assert.match(
    adjustSource,
    /if \(seed <= 0\) \{\s*\/\/ A silent return here read as a dead stepper button\.[\s\S]*showModal\(\{[\s\S]*Market Data Unavailable[\s\S]*return;\s*\}/,
  );
  assert.equal(
    adjustSource.match(/if \(seed <= 0\) \{/g)?.length,
    2,
    'both SL and TP steppers must surface the missing-seed case',
  );
});
