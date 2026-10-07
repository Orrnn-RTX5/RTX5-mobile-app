import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Keyboard, Modal } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useBrokerDirectory } from '../../query/broker';
import { getBrokerDirectoryForBroker } from '../../api/broker';
import { useUserPreferences } from '../../state/userPreferences';
import { createPublicBrokerContext, getPublicBrokerContext, setPublicBrokerContext, subscribePublicBrokerContext, publicBrokerFetch, isPublicBrokerContextCurrent } from '../../state/publicBrokerContext';
import { captureActiveBrokerSession, getActiveBrokerSessionProvenance } from '../../state/activeBrokerSession';
import { getAuthFlowState, subscribeAuthFlow, dismissAuthFlow, showAuthForm, beginAuthSubmission, isAuthAttemptCurrent, setAuthProgress, completeAuthenticatedFlow, retainAuthEntryHandoff } from '../trade/authFlowState';
import { authenticateGuest, demoRegistrationBody, GuestAuthError, loginRequestBody, isDemoRegistrationEnabled } from '../../api/guestAuthentication';
import { authorizeBrokerSessionCommit, cancelBrokerSessionCommitAuthorization, commitBrokerSession, logoutBrokerSession } from '../../services/brokerSessionCoordinator';
import { selectGuestBroker } from '../../services/selectGuestBroker';
import { bootstrapApp } from '../../services/bootstrapApp';
import { acceptTradingHydration } from '../../services/tradingAccess';
import { getOrrnnDemoPublicMarketCatalog } from '../../api/orrnnDemoPublicMarket';
import type { BrokerSessionCommitAuthorization } from '../../services/brokerSessionCoordinator';
import { extractMarketSymbols } from '../../domain/marketSymbols';
import { normalizeSymbol } from '../../domain/symbols';
import { DemoAccountScreen } from './DemoAccountScreen';
import { LoginAccountScreen } from './LoginAccountScreen';
import { GuestBrokerPicker } from '../settings/BrokersScreen/BrokersScreen';
import { buildBrokerDirectoryRows } from '../settings/BrokersScreen/brokerDirectoryRows';
import { setSavedAccountPassword, removeSavedAccountPassword } from '../../state/savedAccounts';

export function GuestFlowHost() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const flow = useSyncExternalStore(subscribeAuthFlow, getAuthFlowState, getAuthFlowState);
  const context = useSyncExternalStore(subscribePublicBrokerContext, getPublicBrokerContext, getPublicBrokerContext);
  const brokerId = useUserPreferences(state => state.brokerId);
  const isLoggedIn = useUserPreferences(state => state.isLoggedIn);
  const directory = useBrokerDirectory();
  const [name, setName] = useState(''); const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [config, setConfig] = useState<any>(null); const [localError, setLocalError] = useState('');
  const [retryAt, setRetryAt] = useState(0); const [now, setNow] = useState(Date.now());
  const [rateForm, setRateForm] = useState<'login' | 'demo'>('demo');
  const [ambiguous, setAmbiguous] = useState(false);
  const [remember, setRemember] = useState(true);
  const loginVariant = useRef<'login' | 'broker'>('login');
  if (flow.screen === 'choice') loginVariant.current = 'broker';
  else if (flow.screen === 'guest' || flow.screen === 'ready') loginVariant.current = 'login';
  const authorization = useRef<BrokerSessionCommitAuthorization | null>(null);
  const committedNamespace = useRef<string | null>(null);
  const submitting = useRef(false);
  const busy = flow.screen === 'submitting' || flow.screen === 'hydrating';
  const visible = !['guest', 'ready'].includes(flow.screen);
  useEffect(() => {
    if (!visible || !flow.context) return;
    // Warm only the selected broker's approved directory while the user types.
    // The coordinator still validates exact identity/endpoints before activation.
    void getBrokerDirectoryForBroker(flow.context.brokerId).catch(() => undefined);
  }, [visible, flow.context]);
  useEffect(() => subscribeAuthFlow(() => {
    if (getAuthFlowState().screen === 'guest') cancelBrokerSessionCommitAuthorization(authorization.current);
  }), []);
  useEffect(() => () => { cancelBrokerSessionCommitAuthorization(authorization.current); dismissAuthFlow(); }, []);
  useEffect(() => {
    const previous = previousPath.current; previousPath.current = pathname;
    if (previous === pathname || ['guest', 'ready'].includes(getAuthFlowState().screen)) return;
    // Child entry effects can open the modal before this route effect runs.
    // Keep both steps of that owned handoff; unrelated navigation still cancels.
    if (retainAuthEntryHandoff(pathname)) return;
    dismissAuthFlow(); cancelBrokerSessionCommitAuthorization(authorization.current);
    if (committedNamespace.current) { committedNamespace.current = null; void logoutBrokerSession(); }
  }, [pathname]);
  useEffect(() => {
    if (!directory.data) return;
    const activeSelection = captureActiveBrokerSession();
    const candidates = directory.data.selectableServers.filter(row => row.broker_id === brokerId);
    const selected = candidates.find(row => row.market_api_url === activeSelection?.session.apiBase) ?? candidates[0];
    if (!selected) { if (context) setPublicBrokerContext(null); if (captureActiveBrokerSession()) void logoutBrokerSession(); return; }
    try {
      const verified = createPublicBrokerContext(selected);
      const active = captureActiveBrokerSession();
      if (active && (active.session.brokerId !== verified.brokerId || active.session.configVersion !== verified.configVersion || active.session.apiBase !== verified.apiBase || active.session.feedWsBase !== verified.feedWsBase || active.session.tradeWsBase !== verified.endpoints.tradeWsBase)) void logoutBrokerSession();
      if (context?.brokerId === verified.brokerId && context.configVersion === verified.configVersion && context.apiBase === verified.apiBase && context.extendedApiBase === verified.extendedApiBase && context.feedWsBase === verified.feedWsBase && context.feedBrokerId === verified.feedBrokerId && context.feedStatusUrl === verified.feedStatusUrl) return;
      setPublicBrokerContext(selected);
    } catch (error) { setPublicBrokerContext(null); setLocalError(error instanceof Error ? error.message : 'Invalid broker configuration.'); }
  }, [directory.data, brokerId, context]);
  useEffect(() => {
    setConfig(null); setPassword(''); setConfirmation(''); setRetryAt(0); setAmbiguous(false);
    if (!context) return;
    setLocalError(''); setName(''); setIdentity('');
    const controller = new AbortController();
    void publicBrokerFetch('/broker/config?broker_id=' + encodeURIComponent(context.brokerId), controller.signal).then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(payload => { if (isPublicBrokerContextCurrent(context)) setConfig(payload?.data ?? payload); }).catch(() => {});
    return () => controller.abort();
  }, [context]);
  useEffect(() => {
    if (!context || isLoggedIn) return;
    const controller = new AbortController();
    void getOrrnnDemoPublicMarketCatalog(controller.signal).then(catalog => {
      if (!isPublicBrokerContextCurrent(context)) return;
      const preferences = useUserPreferences.getState();
      if (preferences.isLoggedIn) return;
      if (!catalog.symbols.includes(preferences.chartSymbol)) preferences.setChartSymbol(catalog.symbols[0]);
      const saved = preferences.quoteSymbols.filter(symbol => catalog.symbols.includes(symbol));
      preferences.setQuoteSymbols(saved.length ? saved : catalog.symbols.slice(0, 6)); preferences.setHasSetInitialSymbols(true);
    }).catch(() => {});
    return () => controller.abort();
  }, [context, isLoggedIn]);
  useEffect(() => { if (!retryAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [retryAt]);
  const demoAllowed = isDemoRegistrationEnabled(config);
  const close = () => {
    dismissAuthFlow(); setPassword(''); setConfirmation('');
    committedNamespace.current = null;
    void logoutBrokerSession();
  };
  const submit = async () => {
    if (submitting.current || busy || retryAt > Date.now() && rateForm === flow.form || ambiguous && flow.form === 'demo' || !flow.context || flow.form === 'demo' && !demoAllowed) return;
    let body: string | Record<string, unknown>;
    try { body = flow.form === 'demo' ? demoRegistrationBody({ name, email: identity, password, confirmation }, flow.context.brokerId) : loginRequestBody(identity, password, flow.context.brokerId); }
    catch (error) { setLocalError((error as Error).message); return; }
    const operation = beginAuthSubmission(); if (!operation) return;
    Keyboard.dismiss();
    submitting.current = true; setLocalError('');
    const attempt = operation.state.attempt; const selected = operation.state.context!;
    authorization.current = authorizeBrokerSessionCommit();
    // If form entry outlived the short directory cache, overlap revalidation
    // with authentication instead of adding another network wait afterward.
    void getBrokerDirectoryForBroker(selected.brokerId).catch(() => undefined);
    const submittedPassword = password; const submittedRemember = remember;
    const authStartedAt = Date.now();
    try {
      const session = await authenticateGuest(selected, operation.state.form === 'demo' ? 'register' : 'login', body, operation.signal);
      if (!isAuthAttemptCurrent(attempt)) return;
      setAuthProgress(attempt, 'hydrating');
      let hydration: ReturnType<typeof bootstrapApp> | undefined;
      const capture = await commitBrokerSession({
        session: { ...selected.endpoints, accountLogin: session.accountLogin, investor: session.investor },
        credentials: { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresAt: session.expiresAt },
        account: { name: String(session.metadata.name || name.trim() || 'Trader'), serverName: String(session.metadata.server || selected.name), accountType: 'unknown', accountEnvironmentSource: 'unknown' },
        isCurrent: () => isAuthAttemptCurrent(attempt),
        onActivated: active => {
          if (!isAuthAttemptCurrent(attempt)) return;
          committedNamespace.current = active.session.cacheNamespace;
          hydration = bootstrapApp({ accountLogin: session.accountLogin, expectedProvenance: getActiveBrokerSessionProvenance(active.session), waitFor: 'trading' });
          // Commit still owns persistence/cancellation; observe an early read
          // failure until the awaited handoff can report it to the form.
          void hydration.catch(() => undefined);
        },
      }, authorization.current);
      committedNamespace.current = capture.session.cacheNamespace;
      if (!isAuthAttemptCurrent(attempt)) { await logoutBrokerSession(); return; }
      const hydrated = await (hydration ?? bootstrapApp({ accountLogin: session.accountLogin, expectedProvenance: getActiveBrokerSessionProvenance(capture.session), waitFor: 'trading' }));
      if (!isAuthAttemptCurrent(attempt)) return;
      if (!acceptTradingHydration(capture.session.cacheNamespace, hydrated.me, hydrated.accounts, hydrated.instruments)) throw new Error('Account policy or authorized symbols could not be loaded. Trading remains disabled.');
      if (operation.state.form === 'login') {
        // Reuse the established secure saved-account password store.
        if (submittedRemember) await setSavedAccountPassword(selected.brokerId, session.accountLogin, submittedPassword).catch(() => undefined);
        else await removeSavedAccountPassword(selected.brokerId, session.accountLogin).catch(() => undefined);
        if (!isAuthAttemptCurrent(attempt)) return;
      }
      const investor = captureActiveBrokerSession()?.session.investor === true;
      const intent = completeAuthenticatedFlow(attempt, true, investor);
      if (__DEV__) console.info('[AuthTiming] authentication ready', Date.now() - authStartedAt);
      committedNamespace.current = null; setPassword(''); setConfirmation('');
      if (intent?.symbol && intent.side && !investor) {
        const symbols = extractMarketSymbols(hydrated.instruments);
        const equivalent = symbols.filter(symbol => normalizeSymbol(symbol) === normalizeSymbol(intent.symbol!));
        const authorizedSymbol = symbols.includes(intent.symbol) ? intent.symbol : equivalent.length === 1 ? equivalent[0] : null;
        if (!authorizedSymbol) { router.replace('/(tabs)/quotes'); return; }
        if (intent.volume) useUserPreferences.getState().setTradeVolume(intent.volume);
        router.replace({ pathname: '/trade/order-ticket', params: { symbol: authorizedSymbol, side: intent.side, origin: intent.origin ?? 'trade' } });
      } else router.replace('/(tabs)/quotes');
    } catch (error) {
      if (!isAuthAttemptCurrent(attempt)) return;
      if (error instanceof GuestAuthError) { setRetryAt(error.retryAt); setRateForm(operation.state.form); setAmbiguous(error.ambiguous); }
      setAuthProgress(attempt, 'recoverable-error', error instanceof Error ? error.message : 'Authentication could not be completed.');
    } finally { submitting.current = false; }
  };
  const changeBroker = () => { close(); setPublicBrokerContext(null); useUserPreferences.getState().setBrokerConnection('', ''); };
  const selectedRecord = directory.data?.selectableServers.find(row => row.broker_id === flow.context?.brokerId && row.market_api_url === flow.context?.apiBase)
    ?? directory.data?.selectableServers.find(row => row.broker_id === flow.context?.brokerId);
  const selectedRow = buildBrokerDirectoryRows(directory.data?.entries).find(row => row.brokerId === selectedRecord?.broker_id && row.serverUrl === selectedRecord?.server_url);
  const explanation = flow.intent ? `${flow.intent.side?.toUpperCase()} ${flow.intent.symbol} · ${flow.intent.volume} lots. After authentication, you will review an order draft. The order will not be sent automatically.` : undefined;
  return <>
    <Modal visible={!context} animationType="slide" onRequestClose={() => {}} presentationStyle="fullScreen">
      {!context ? <GuestBrokerPicker onBack={() => {}} selectionError={localError}
        onSelectBroker={row => { void selectGuestBroker(row).catch(error => setLocalError(error.message)); }} /> : null}
    </Modal>
    <Modal visible={visible && Boolean(context)} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      {visible && context ? flow.form === 'demo' && flow.screen !== 'choice' ? <DemoAccountScreen
        key={flow.context?.cacheNamespace}
        name={name} email={identity} password={password} confirmation={confirmation}
        onNameChange={setName} onEmailChange={setIdentity} onPasswordChange={setPassword} onConfirmationChange={setConfirmation}
        brokerName={flow.context?.name ?? ''} explanation={explanation}
        error={localError || flow.error || (!demoAllowed ? 'Demo signup is disabled. Login and guest browsing are available.' : '')}
        retryMessage={retryAt > now && rateForm === 'demo' ? `Try again in ${Math.ceil((retryAt - now) / 1000)} seconds.` : undefined}
        busy={busy} hydrating={flow.screen === 'hydrating'} disabled={busy || retryAt > now && rateForm === 'demo' || !demoAllowed || ambiguous}
        termsUrl={config?.terms_url ?? config?.legal?.terms_url} privacyUrl={config?.privacy_url ?? config?.legal?.privacy_url} recoveryUrl={config?.recovery_url}
        onSubmit={() => { void submit(); }} onBack={close}
        onLogin={() => { showAuthForm('login'); setAmbiguous(false); setLocalError(''); }}
        onChangeBroker={changeBroker}
      /> : <LoginAccountScreen
        key={flow.context?.cacheNamespace} variant={loginVariant.current}
        brokerId={flow.context?.brokerId ?? ''} brokerName={flow.context?.name ?? ''}
        serverName={selectedRow?.server || flow.context?.name || ''} logoUrl={selectedRow?.logoUrl}
        identity={identity} password={password} remember={remember}
        onIdentityChange={setIdentity} onPasswordChange={setPassword} onRememberChange={setRemember}
        explanation={explanation} error={localError || flow.error} recoveryUrl={config?.recovery_url}
        retryMessage={retryAt > now && rateForm === 'login' ? `Try again in ${Math.ceil((retryAt - now) / 1000)} seconds.` : undefined}
        busy={busy} hydrating={flow.screen === 'hydrating'} disabled={busy || retryAt > now && rateForm === 'login'} demoAllowed={demoAllowed}
        onSubmit={() => { if (flow.screen === 'choice') showAuthForm('login'); void submit(); }}
        onDemo={() => { showAuthForm('demo'); setLocalError(''); }} onBack={close} onChangeBroker={changeBroker}
      /> : null}
    </Modal>
  </>;
}
