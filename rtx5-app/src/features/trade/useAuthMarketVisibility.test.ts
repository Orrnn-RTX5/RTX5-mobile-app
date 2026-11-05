import assert from 'node:assert/strict';
import test from 'node:test';
import { setPublicBrokerContext } from '../../state/publicBrokerContext';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import {
  beginAuthSubmission,
  completeAuthenticatedFlow,
  dismissAuthFlow,
  getAuthFlowState,
  openAuthFlow,
  setAuthProgress,
  showAuthForm,
  subscribeAuthFlow,
} from './authFlowState';
import { getAuthMarketDemandAllowed } from './useAuthMarketVisibility';

test.beforeEach(() => {
  setPublicBrokerContext(publicBrokerFixture());
  dismissAuthFlow();
});

test.afterEach(() => {
  dismissAuthFlow();
  setPublicBrokerContext(null);
});

test('guest browsing resumes after the authentication choice and both forms are dismissed', () => {
  assert.equal(getAuthMarketDemandAllowed(), true);
  openAuthFlow();
  assert.equal(getAuthFlowState().screen, 'choice');
  assert.equal(getAuthMarketDemandAllowed(), false);
  showAuthForm('login');
  assert.equal(getAuthMarketDemandAllowed(), false);
  showAuthForm('demo');
  assert.equal(getAuthMarketDemandAllowed(), false);
  dismissAuthFlow();
  assert.equal(getAuthMarketDemandAllowed(), true);
});

test('direct Login and Demo entries pause demand without requiring a trade intent', () => {
  for (const form of ['login', 'demo'] as const) {
    openAuthFlow(undefined, form);
    assert.equal(getAuthFlowState().intent, null);
    assert.equal(getAuthMarketDemandAllowed(), false);
    dismissAuthFlow();
    assert.equal(getAuthMarketDemandAllowed(), true);
  }
});

test('submitting, hydration and recoverable errors keep covered market work paused', () => {
  openAuthFlow(undefined, 'login');
  const submission = beginAuthSubmission()!;
  assert.equal(getAuthFlowState().screen, 'submitting');
  assert.equal(getAuthMarketDemandAllowed(), false);
  setAuthProgress(submission.state.attempt, 'hydrating');
  assert.equal(getAuthMarketDemandAllowed(), false);
  setAuthProgress(submission.state.attempt, 'recoverable-error', 'Try again');
  assert.equal(getAuthMarketDemandAllowed(), false);
  showAuthForm('login');
  assert.equal(getAuthMarketDemandAllowed(), false);
});

test('only accepted hydration resumes demand, including an investor session', () => {
  for (const investor of [false, true]) {
    dismissAuthFlow();
    openAuthFlow(undefined, 'login');
    const submission = beginAuthSubmission()!;
    setAuthProgress(submission.state.attempt, 'hydrating');
    completeAuthenticatedFlow(submission.state.attempt, false, investor);
    assert.equal(getAuthMarketDemandAllowed(), false);
    completeAuthenticatedFlow(submission.state.attempt, true, investor);
    assert.equal(getAuthFlowState().screen, 'ready');
    assert.equal(getAuthMarketDemandAllowed(), true);
  }
});

test('dismissal revokes stale results and a new flow cannot be resumed by the old attempt', () => {
  openAuthFlow(undefined, 'login');
  const previous = beginAuthSubmission()!;
  setAuthProgress(previous.state.attempt, 'hydrating');
  dismissAuthFlow();
  assert.equal(previous.signal.aborted, true);
  assert.equal(getAuthMarketDemandAllowed(), true);
  openAuthFlow(undefined, 'demo');
  completeAuthenticatedFlow(previous.state.attempt, true, false);
  setAuthProgress(previous.state.attempt, 'ready');
  assert.equal(getAuthFlowState().screen, 'demo');
  assert.equal(getAuthMarketDemandAllowed(), false);
});

test('broker switching releases the old covered flow and notifies demand subscribers', () => {
  const visibility: boolean[] = [];
  const release = subscribeAuthFlow(() => visibility.push(getAuthMarketDemandAllowed()));
  try {
    openAuthFlow(undefined, 'login');
    const submission = beginAuthSubmission()!;
    setPublicBrokerContext(publicBrokerFixture('Other'));
    assert.equal(submission.signal.aborted, true);
    assert.equal(getAuthMarketDemandAllowed(), true);
    assert.deepEqual(visibility, [false, false, true]);
    release();
    openAuthFlow(undefined, 'demo');
    assert.deepEqual(visibility, [false, false, true], 'disposed subscribers receive no stale updates');
  } finally {
    release();
  }
});
