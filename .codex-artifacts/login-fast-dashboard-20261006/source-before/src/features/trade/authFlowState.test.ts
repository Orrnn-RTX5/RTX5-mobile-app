import assert from 'node:assert/strict';
import test from 'node:test';
import { beginAuthSubmission, completeAuthenticatedFlow, dismissAuthFlow, getAuthFlowState, isAuthAttemptCurrent, openAuthFlow, setAuthProgress, showAuthForm, retainAuthEntryHandoff } from './authFlowState';
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

test('Demo entry remains open when the child opens before the root entry-route effect', () => {
  openAuthFlow(undefined, 'demo', '/register-entry');
  const attempt = getAuthFlowState().attempt;
  assert.equal(retainAuthEntryHandoff('/register-entry'), true);
  assert.equal(getAuthFlowState().screen, 'demo');
  assert.equal(retainAuthEntryHandoff('/(tabs)/quotes'), true);
  assert.equal(getAuthFlowState().attempt, attempt);
  assert.equal(getAuthFlowState().intent, null);
  assert.equal(retainAuthEntryHandoff('/settings'), false);
});

test('entry replacement remains owned when React coalesces the intermediate pathname', () => {
  for (const path of ['/login', '/register', '/register-entry', '/settings/broker-detail']) {
    dismissAuthFlow(); openAuthFlow(undefined, 'login', path);
    assert.equal(retainAuthEntryHandoff('/quotes'), true);
    assert.equal(retainAuthEntryHandoff('/quotes'), false, 'handoff is consumed once');
  }
});

test('normal navigation cancels a submission after its entry handoff completes', () => {
  openAuthFlow(undefined, 'login', '/login');
  const submission = beginAuthSubmission()!;
  assert.equal(retainAuthEntryHandoff('/quotes'), true);
  assert.equal(isAuthAttemptCurrent(submission.state.attempt), true);
  assert.equal(retainAuthEntryHandoff('/history'), false);
  dismissAuthFlow();
  assert.equal(submission.signal.aborted, true);
  assert.equal(isAuthAttemptCurrent(submission.state.attempt), false);
});

test('Back and broker switches revoke an unfinished entry handoff', () => {
  openAuthFlow(undefined, 'demo', '/register-entry');
  dismissAuthFlow();
  assert.equal(retainAuthEntryHandoff('/quotes'), false);
  openAuthFlow(undefined, 'login', '/login');
  setPublicBrokerContext(publicBrokerFixture('Other'));
  assert.equal(retainAuthEntryHandoff('/quotes'), false);
  assert.equal(getAuthFlowState().screen, 'guest');
});

test('a root trading guard does not exempt arbitrary auth routes from disposal', () => {
  openAuthFlow({ kind: 'market-order', symbol: 'EURUSD', side: 'buy' }, 'login');
  assert.equal(retainAuthEntryHandoff('/login'), false);
  assert.equal(retainAuthEntryHandoff('/quotes'), false);
  dismissAuthFlow();
  assert.equal(getAuthFlowState().intent, null);
});
