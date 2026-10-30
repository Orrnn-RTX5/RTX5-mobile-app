import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProductionModule } from '../../../tests/helpers/productionModule';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import { getPublicBrokerContext, setPublicBrokerContext } from '../../state/publicBrokerContext';
import { dismissAuthFlow, getAuthFlowState, openAuthFlow } from './authFlowState';
import { shouldRequestTradingAuth, shouldRequestOrrnnDemoTradeAuth, type TradeAuthIntent } from './tradeAuthGate';

const brokers = ['orrnn-demo', 'orrnn', 'Nexa', 'new-broker-with-no-special-case'];
function brokerFixture(brokerId: string) {
  const domain = `${brokerId.toLowerCase()}.example.com`;
  return publicBrokerFixture(brokerId, {
    services_domain: domain, server_url: `https://${domain}`, market_api_url: `https://${domain}/api/v2`,
    feed_wss_url: `wss://${domain}/ws/feed`, feed_status_https_url: `https://${domain}/ws/feed/status`,
    trade_wss_url: `wss://${domain}/ws/v2`,
  });
}
const intents: TradeAuthIntent[] = [
  { kind: 'trade-tab' },
  { kind: 'history-tab' },
  { kind: 'order-ticket', symbol: 'EURUSD', side: 'buy', origin: 'quotes' },
  { kind: 'market-order', symbol: 'EURUSD', side: 'sell', origin: 'chart' },
  { kind: 'pending-order', symbol: 'EURUSD', side: 'buy' },
  { kind: 'position-action', symbol: 'EURUSD', action: 'close' },
  { kind: 'bulk-action', bulkMode: 'all' },
];

function createPrompt(brokerId: string, isLoggedIn = false) {
  const preferences = {
    brokerId, isLoggedIn, tradeVolume: 0.02,
    accountDetails: isLoggedIn ? { id: '12345', credentials: { accessToken: 'persisted-test-token' } } : undefined,
  };
  const active = isLoggedIn ? {
    session: { brokerId, accountLogin: '12345' },
    credentials: { accessToken: 'active-test-token', expiresAt: '', refreshToken: '' },
  } : null;
  const prompt = loadProductionModule<{
    hasTradingSession(): boolean;
    requireTradingSession(intent: TradeAuthIntent): boolean;
    requestOrrnnDemoTradeAuth(intent: TradeAuthIntent): boolean;
  }>('src/features/trade/tradeAuthPrompt.ts', {
    captureActiveBrokerSession: () => active,
    useUserPreferences: { getState: () => preferences },
    shouldRequestTradingAuth, openAuthFlow,
  });
  return { ...prompt, preferences, active };
}

test.afterEach(() => { dismissAuthFlow(); setPublicBrokerContext(null); });

test('all guest account/trade actions open the same popup for the selected broker', () => {
  for (const broker of brokers) {
    setPublicBrokerContext(brokerFixture(broker));
    const prompt = createPrompt(broker);
    assert.equal(prompt.requestOrrnnDemoTradeAuth, prompt.requireTradingSession);
    for (const intent of intents) {
      dismissAuthFlow();
      let executions = 0;
      // This is the shared boundary used before navigation or order transport.
      if (!prompt.requireTradingSession(intent)) executions++;
      assert.equal(executions, 0, `${broker}: ${intent.kind} cannot execute as a guest`);
      const flow = getAuthFlowState();
      assert.equal(flow.screen, 'choice', `${broker}: ${intent.kind} must show the account popup`);
      assert.equal(flow.context, getPublicBrokerContext());
      assert.equal(flow.context?.brokerId, broker, 'login must use the selected broker');
      assert.equal(flow.context?.apiBase, brokerFixture(broker).market_api_url);
      assert.equal(flow.intent?.symbol, intent.symbol && ['order-ticket', 'market-order'].includes(intent.kind) ? 'EURUSD' : undefined);
    }
  }
});

test('valid sessions continue normally for any broker; another broker or expired session cannot authorize trading', () => {
  for (const broker of brokers) {
    setPublicBrokerContext(brokerFixture(broker));
    const prompt = createPrompt(broker, true);
    dismissAuthFlow();
    assert.equal(prompt.hasTradingSession(), true);
    for (const intent of intents) assert.equal(prompt.requireTradingSession(intent), false);
    assert.equal(getAuthFlowState().screen, 'guest', 'valid sessions do not open a popup');
    prompt.preferences.brokerId = 'different-broker';
    assert.equal(prompt.hasTradingSession(), false);
    prompt.preferences.brokerId = broker;
    prompt.active!.credentials.expiresAt = '2000-01-01T00:00:00.000Z';
    assert.equal(prompt.requireTradingSession({ kind: 'trade-tab' }), true);
    assert.equal(getAuthFlowState().context?.brokerId, broker);
  }
});

test('switching public brokers dismisses the old popup and the next request belongs to the new broker', () => {
  const prompt = createPrompt(brokers[0]);
  for (const broker of brokers) {
    setPublicBrokerContext(brokerFixture(broker));
    prompt.preferences.brokerId = broker;
    assert.equal(getAuthFlowState().screen, 'guest');
    prompt.requireTradingSession({ kind: 'market-order', symbol: 'EURUSD', side: 'buy' });
    assert.equal(getAuthFlowState().screen, 'choice');
    assert.equal(getAuthFlowState().context?.brokerId, broker);
  }
});

test('the broker-independent policy has no broker allowlist and rejects missing broker ownership', () => {
  assert.equal(shouldRequestOrrnnDemoTradeAuth, shouldRequestTradingAuth);
  for (const brokerId of [...brokers, undefined]) {
    assert.equal(shouldRequestTradingAuth({ selectedBrokerId: brokerId, isLoggedIn: false }), true);
  }
  assert.equal(shouldRequestTradingAuth({
    selectedBrokerId: '', activeBrokerId: '', isLoggedIn: true,
    accountId: '12345', accessToken: 'test', activeAccountLogin: '12345', activeAccessToken: 'test',
  }), true);
});
