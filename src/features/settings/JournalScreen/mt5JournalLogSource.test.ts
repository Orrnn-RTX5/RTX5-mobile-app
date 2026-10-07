import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('journal screen renders only the authenticated account-scoped server journal', () => {
  const source = readSource('src/features/settings/JournalScreen/JournalScreen.tsx');

  assert.match(source, /<ServerJournalPanel[\s\S]*isScreenFocused=\{isScreenFocused\}[\s\S]*sessionScope=\{sessionScope\}/);
  assert.match(source, /const sessionScope = useMemo\(\(\) => buildJournalSessionScopeKey\(querySession\), \[querySession\]\)/);
  assert.match(source, /isAuthenticated=\{querySession !== null\}/);
  assert.match(source, /t\('Terminal logs and connection events'\)/);
  assert.doesNotMatch(source, /useJournalTrades|Session Summary|useTerminalJournalState|TerminalLogTable|Calendar|setIsNoteOpen|JournalRefreshButton|SectionList/);
});

test('server journal panel: focused refresh, abortable latest-wins loads, clipboard copy', () => {
  const panel = readSource('src/features/settings/JournalScreen/serverJournal/ServerJournalPanel.tsx');
  const hook = readSource('src/features/settings/JournalScreen/serverJournal/useServerJournal.ts');
  const api = readSource('src/api/journal.ts');

  assert.match(hook, /JOURNAL_AUTO_REFRESH_MS = 15_000/);
  assert.match(hook, /setInterval/);
  assert.match(hook, /if \(!active\) \{\s*return undefined;\s*\}/);
  assert.match(hook, /if \(disposed \|\| controller\.signal\.aborted \|\| sequence !== requestSequenceRef\.current\) return;/);
  assert.match(hook, /if \(cacheScopeRef\.current !== sessionScope\) \{\s*cacheRef\.current\.clear\(\);/);
  assert.match(hook, /serverLogs: scopeHasLoaded \? state\.serverLogs : EMPTY_LOGS/);
  assert.match(api, /apiClient\(`\/journal\?\$\{query\}`/);
  assert.match(api, /apiVersion: 'v2'/);
  assert.match(api, /filter=\$\{encodeURIComponent\(filter\)\}/);
  assert.match(panel, /filter: search/);
  assert.match(panel, /scrollToEnd\(\{ animated: false \}\)/);
  assert.doesNotMatch(panel, /mergeJournalRows|terminalSamples|lastTradeLatencyMs/);
  assert.match(api, /timeoutMs: JOURNAL_REQUEST_TIMEOUT_MS/);
  assert.match(api, /'Request timed out after 30 seconds'/);
  assert.match(api, /`HTTP Error: \$\{response\.status\}`/);
  // Production binaries ship no clipboard native module (OTA runtime lock).
  assert.doesNotMatch(panel, /expo-clipboard/);
  assert.match(panel, /Share\.share\(\{ message: buildJournalTsv\(filteredLogs\) \}\)/);
  assert.match(panel, /const canCopy = ownsCurrentRequest && filteredLogs\.length > 0/);
  assert.match(panel, /getItemLayout=\{getItemLayout\}/);
  assert.match(panel, /const SEARCH_DEBOUNCE_MS = 150/);
  assert.match(panel, /const AUTO_FOLLOW_THRESHOLD_PX = 40/);
  assert.match(panel, /const COPY_FEEDBACK_MS = 2000/);
  for (const text of [
    'Sign in to view the server journal',
    'Loading server journal…',
    'Unable to load the server journal',
    'Refresh failed. Showing the latest response for this account.',
    'No journal entries for the selected filters',
  ]) {
    assert.ok(panel.includes(`t('${text}')`), `missing state text: ${text}`);
  }
});

test('journal live trade queries refresh without cancelling each other', () => {
  const liveJournalSource = readSource('src/features/settings/JournalScreen/liveJournal.ts');
  const dealsQuerySource = readSource('src/query/deals.ts');

  assert.match(liveJournalSource, /Promise\.all\(\[/);
  assert.equal((liveJournalSource.match(/cancelRefetch: false/g) ?? []).length, 2);
  assert.doesNotMatch(liveJournalSource, /usePositionsQuery|refetchPositions/);
  assert.match(liveJournalSource, /usePositionHistoryQuery/);
  assert.match(liveJournalSource, /pageLimit: 1000/);
  assert.match(liveJournalSource, /maxPages: 1/);
  assert.match(liveJournalSource, /mergeClosedPositionSources\(rangedHistoryPositions, derivedClosedPositions\)/);
  assert.match(liveJournalSource, /from: journalFrom/);
  assert.match(liveJournalSource, /to: journalTo/);
  assert.match(liveJournalSource, /refetchInterval: false/);
  assert.match(liveJournalSource, /subscribed: active/);
  assert.doesNotMatch(liveJournalSource, /\.isFetching|\.isLoading/);
  assert.match(dealsQuerySource, /getDealsQueryKey\(cacheNamespace, login, from, to\)/);
  assert.match(dealsQuerySource, /fetchAccountDealsWithLoginFallback\(login, from, to\)/);
  // Paged /account/deals is primary; /deals/{login} is only the fallback.
  assert.match(
    dealsQuerySource,
    /await fetchAllAccountDeals\(\{ from, to \}\)[\s\S]*catch \(accountError\)[\s\S]*getLoginDealsWithRangeFallback\(login, from, to\)/,
  );
  assert.match(dealsQuerySource, /if \(!shouldRetryDealsWithoutRange\(error\)\) throw error/);
  assert.match(dealsQuerySource, /subscribed: options\.subscribed/);
});

test('market orders record one placement_terminal telemetry sample from the tap', () => {
  const source = readSource('src/api/orders/placeMarketOrder.ts');

  assert.match(source, /const intentAtMs = takeTradeIntentStartedAt\(\);/);
  assert.match(source, /phase: 'placement_terminal',/);
  assert.match(source, /totalMs: Math\.max\(0, getApiLatencyNow\(\) - intentAtMs\)/);
  assert.match(source, /record\(\{ status: 'filled' \}\);/);
  assert.match(source, /record\(classifyPlacementFailure\(error, trace\.clientOrderId !== undefined\)\);/);
  for (const path of [
    'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts',
    'src/features/trade/OrderTicketScreen.tsx',
    'src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx',
    'src/features/chart/ChartScreen.web.tsx',
  ]) {
    assert.match(readSource(path), /\{\s*\/\/ Tap time for the Journal's order latency telemetry\.\s*markTradeIntent\(\);/, path);
  }
});

test('market order API records request, success, and failure journal rows', () => {
  const source = readSource('src/api/orders/placeMarketOrder.ts');

  assert.match(source, /recordMarketOrderJournalRequest/);
  assert.match(source, /recordMarketOrderJournalSuccess/);
  assert.match(source, /recordMarketOrderJournalFailure/);
  assert.match(source, /recordMarketOrderJournalRequest\(journalPayload\)/);
  assert.match(source, /recordMarketOrderJournalSuccess\([\s\S]*journalPayload[\s\S]*finalData/);
  assert.match(source, /recordMarketOrderJournalFailure\(journalPayload, error\)/);
});

test('positions API records close and SLTP modify journal rows', () => {
  const source = readSource('src/api/positions/index.ts');

  assert.match(source, /recordClosePositionJournalRequest/);
  assert.match(source, /recordClosePositionJournalSuccess/);
  assert.match(source, /recordClosePositionJournalFailure/);
  assert.match(source, /recordModifyPositionJournalRequest/);
  assert.match(source, /recordModifyPositionJournalSuccess/);
  assert.match(source, /recordModifyPositionJournalFailure/);
  assert.match(source, /recordClosePositionJournalRequest\(descriptor\.ticket, descriptor\.journalPayload\)/);
  assert.match(
    source,
    /recordModifyPositionJournalRequest\(normalizedTicket\.path, normalizedPayload\)/,
  );
});

test('terminal journal store writes MT5-like trade lines', () => {
  const source = readSource('src/state/terminalJournalState.ts');

  assert.match(source, /type TerminalJournalSource = 'Trades' \| 'Accounts' \| 'Actions' \| 'Terminal' \| 'Network' \| 'Notes'/);
  assert.match(source, /name: 'terminalJournalEntries'/);
  assert.match(source, /TERMINAL_JOURNAL_RETENTION_DAYS = 90/);
  assert.match(source, /retainRecentEntries/);
  assert.match(source, /recordAppActionJournalEvent/);
  assert.match(source, /recordAccountJournalEvent/);
  // Web-terminal wording: a start row, then the "Timing" + "Order ... filled" pair.
  assert.match(source, /message: `\$\{formatLoginPrefix\(login\)\}Trade started: \$\{buildMarketOrderText\(payload\)\}`/);
  assert.match(source, /Timing \$\{tradeText\}`/);
  assert.match(source, /Order executed \$\{formatTradeText\(side, symbol, row\.volume \?\? watch\.volume\)\}/);
  assert.match(source, /Order \$\{tradeText\} filled\$\{priceText\}\$\{ticketText\}/);
  assert.match(source, /const symbolText = symbol \? ` \$\{symbol\}` : ''/);
  assert.doesNotMatch(source, /return symbol \|\| 'symbol'/);
  assert.match(source, /close position #\$\{ticketId\}/);
  assert.match(source, /modify position #\$\{ticketId\}/);
  assert.match(source, /failed: \$\{getErrorMessage\(error\)\}/);
});

test('real account and app actions write journal events from command paths', () => {
  const fastPressableSource = readSource('src/ui/components/FastPressable.tsx');
  const loginSource = readSource('app/login.tsx');
  const registerSource = readSource('app/register.tsx');
  const savedAccountsSource = readSource('src/state/savedAccounts.ts');
  const accountsScreenSource = readSource('src/features/settings/AccountsScreen.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');

  assert.match(fastPressableSource, /journalActionLabel\?: string/);
  assert.match(fastPressableSource, /recordAppActionJournalEvent\(\{/);
  assert.match(loginSource, /recordAccountJournalEvent\(`login requested for broker/);
  assert.match(loginSource, /recordAccountJournalEvent\(`login succeeded on/);
  assert.match(loginSource, /recordAccountJournalEvent\(`login failed:/);
  assert.match(loginSource, /journalActionLabel="pressed Login button"/);
  assert.match(registerSource, /recordAccountJournalEvent\('demo account registration requested'/);
  assert.match(registerSource, /recordAccountJournalEvent\(`demo account created and signed in on/);
  assert.match(registerSource, /recordAccountJournalEvent\(`demo account registration failed:/);
  assert.match(registerSource, /journalActionLabel="pressed Register demo account button"/);
  assert.match(savedAccountsSource, /saved account added for broker/);
  assert.match(savedAccountsSource, /saved account updated for broker/);
  assert.match(savedAccountsSource, /saved account removed for broker/);
  assert.match(accountsScreenSource, /account switch requested for broker/);
  assert.match(accountsScreenSource, /account switched successfully on/);
  assert.match(accountsScreenSource, /current account deleted and local session logged out/);
  assert.match(brokerDetailSource, /broker detail login requested for broker/);
  assert.match(brokerDetailSource, /broker detail login failed:/);
  assert.match(settingsSource, /logged out from current account/);
});
