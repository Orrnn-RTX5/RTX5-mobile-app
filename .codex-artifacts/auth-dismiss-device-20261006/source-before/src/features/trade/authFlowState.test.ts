import assert from 'node:assert/strict';
import test from 'node:test';
import { beginAuthSubmission, completeAuthenticatedFlow, dismissAuthFlow, getAuthFlowState, isAuthAttemptCurrent, openAuthFlow, setAuthProgress, showAuthForm } from './authFlowState';
import { setPublicBrokerContext } from '../../state/publicBrokerContext';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
test.beforeEach(() => { setPublicBrokerContext(publicBrokerFixture()); dismissAuthFlow(); });
test.afterEach(() => { dismissAuthFlow(); setPublicBrokerContext(null); });
test('repeated taps preserve the first draft and duplicate submissions are blocked', () => {
  openAuthFlow({ kind: 'market-order', symbol: 'EURUSD.pro', side: 'buy', volume: .02 });
  openAuthFlow({ kind: 'market-order', symbol: 'OTHER', side: 'sell', volume: 1 });
  assert.equal(getAuthFlowState().intent?.symbol, 'EURUSD.pro'); showAuthForm('demo');
  const submission = beginAuthSubmission()!; assert.equal(beginAuthSubmission(), null);
  setAuthProgress(submission.state.attempt, 'hydrating');
  assert.equal(completeAuthenticatedFlow(submission.state.attempt, false, false), null);
  const draft = completeAuthenticatedFlow(submission.state.attempt, true, false);
  assert.equal(draft?.symbol, 'EURUSD.pro'); assert.equal(draft?.volume, .02);
  assert.equal(completeAuthenticatedFlow(submission.state.attempt, true, false), null);
});
test('plain Login, generic New Order, close/modify/bulk and investor sessions produce no draft', () => {
  for (const intent of [undefined, { kind: 'order-ticket' }, { kind: 'position-action', symbol: 'EURUSD', side: 'buy' }, { kind: 'bulk-action', symbol: 'EURUSD', side: 'buy' }] as const) {
    dismissAuthFlow(); openAuthFlow(intent, 'login'); const submission = beginAuthSubmission()!;
    setAuthProgress(submission.state.attempt, 'hydrating'); assert.equal(completeAuthenticatedFlow(submission.state.attempt, true, false), null);
  }
  dismissAuthFlow(); openAuthFlow({ kind: 'market-order', symbol: 'EURUSD', side: 'sell' }, 'login'); const submission = beginAuthSubmission()!;
  setAuthProgress(submission.state.attempt, 'hydrating'); assert.equal(completeAuthenticatedFlow(submission.state.attempt, true, true), null);
});
test('Back/dismissal and broker switching invalidate results and clear intents', () => {
  openAuthFlow({ kind: 'market-order', symbol: 'EURUSD', side: 'buy' }, 'login');
  const submission = beginAuthSubmission()!; dismissAuthFlow();
  assert.equal(submission.signal.aborted, true); assert.equal(isAuthAttemptCurrent(submission.state.attempt), false); assert.equal(getAuthFlowState().intent, null);
  openAuthFlow(undefined, 'login'); const second = beginAuthSubmission()!;
  setPublicBrokerContext(publicBrokerFixture('Other'));
  assert.equal(second.signal.aborted, true); assert.equal(completeAuthenticatedFlow(second.state.attempt, true, false), null);
});
