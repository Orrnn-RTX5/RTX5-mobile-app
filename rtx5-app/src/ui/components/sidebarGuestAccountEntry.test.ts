import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { dismissAuthFlow, getAuthFlowState, requestAccountEntry } from '../../features/trade/authFlowState';
import { getPublicBrokerContext, setPublicBrokerContext } from '../../state/publicBrokerContext';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import {
  clearFastTabVisual, fastTabVisualController, scheduleFastTabNavigation,
  setFastTabActualRoute, showFastTabVisualForSidebar,
} from '../navigation/fastTabVisualController';
import {
  hideSidebarDestination, resolveSidebarHostDestination,
  showSidebarDestination, sidebarDestinationController,
} from './sidebarDestinationHostController';

function mountGuestDrawerAction(pathname = '/quotes') {
  const source = readFileSync('src/ui/components/SidebarDrawer.tsx', 'utf8');
  const start = source.indexOf('  const navigateSidebarRoute = useCallback');
  const end = source.indexOf('  const openSupportEmail = useCallback', start);
  assert.ok(start >= 0 && end > start, 'execute the production drawer callback');
  const locked = { current: false };
  let drawerOpen = true;
  let unlockRequested = false;
  const events: string[] = [];
  const routes: string[] = [];
  const navigate = runInNewContext(ts.transpileModule(
    source.slice(start, end) + '\nnavigateSidebarRoute;', {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    },
  ).outputText, {
    useCallback: (callback: unknown) => callback,
    navigationLockedRef: locked,
    pathnameRef: { current: pathname },
    normalizeSidebarPath: (path: string) => path.replace(/\/\([^)]*\)/g, '') || '/',
    sidebarDestinationController, resolveSidebarHostDestination, showSidebarDestination,
    SIDEBAR_PRIMARY_TAB_ROUTES: new Set(['/quotes', '/chart', '/trade', '/history', '/settings']),
    clearFastTabVisual: () => { events.push('cancel-tab'); clearFastTabVisual(); },
    hideSidebarDestination: () => { events.push('hide-host'); hideSidebarDestination(); },
    closeForNavigation: () => { events.push('close-drawer'); drawerOpen = false; },
    unlockSidebarNavigation: () => { events.push('unlock'); unlockRequested = true; },
    requestAccountEntry: (form: 'login' | 'demo') => {
      assert.equal(drawerOpen, false, 'the drawer relinquishes touch ownership before auth opens');
      assert.equal(sidebarDestinationController.isVisible(), false);
      events.push('open-auth');
      requestAccountEntry(form);
    },
    requestOrrnnDemoTradeAuth: () => false,
    runSidebarNavigation: (route: string) => { routes.push(route); },
    showFastTabVisualForSidebar, scheduleFastTabNavigation, TAB_BAR_NAVIGATION_SETTLE_DELAY_MS: 0,
  }) as (route: string) => void;
  return {
    press: () => navigate('/login'), events, routes,
    finishNavigationLock: () => {
      assert.equal(unlockRequested, true);
      locked.current = false;
      unlockRequested = false;
    },
    reopenDrawer: () => { drawerOpen = true; },
  };
}

test.beforeEach(() => {
  dismissAuthFlow();
  setPublicBrokerContext(null);
  clearFastTabVisual();
  hideSidebarDestination();
});
test.afterEach(() => {
  dismissAuthFlow();
  setPublicBrokerContext(null);
  clearFastTabVisual();
  hideSidebarDestination();
});

test('the guest drawer opens login every time for any broker without pushing a native route', () => {
  for (const broker of ['orrnn-demo', 'trivanta-markets', 'another-broker']) {
    setPublicBrokerContext(publicBrokerFixture(broker));
    const drawer = mountGuestDrawerAction();
    for (let attempt = 0; attempt < 8; attempt++) {
      drawer.reopenDrawer();
      drawer.press();
      assert.equal(getAuthFlowState().screen, 'login', `${broker}, opening ${attempt + 1}`);
      assert.equal(getAuthFlowState().context, getPublicBrokerContext());
      assert.equal(getAuthFlowState().context?.brokerId, broker);
      assert.equal(getAuthFlowState().intent, null);
      const activeAttempt = getAuthFlowState().attempt;
      drawer.press();
      assert.equal(getAuthFlowState().attempt, activeAttempt, 'one request per in-flight drawer action');
      drawer.finishNavigationLock();
      dismissAuthFlow();
    }
    assert.deepEqual(drawer.routes, [], 'login does not depend on a push/pop pathname handoff');
    assert.deepEqual(drawer.events.slice(0, 5), ['cancel-tab', 'hide-host', 'close-drawer', 'unlock', 'open-auth']);
  }
});

test('an old login pathname cannot turn a new guest account request into a no-op', () => {
  setPublicBrokerContext(publicBrokerFixture());
  const drawer = mountGuestDrawerAction('/login');
  drawer.press();
  assert.equal(getAuthFlowState().screen, 'login');
  assert.deepEqual(drawer.routes, []);
});

test('a cold guest account request remains visible until verified broker selection opens login', () => {
  const drawer = mountGuestDrawerAction();
  drawer.press();
  assert.equal(getAuthFlowState().screen, 'select-broker');
  assert.equal(getAuthFlowState().form, 'login');
  assert.equal(getAuthFlowState().context, null);
  assert.deepEqual(drawer.routes, []);
  // Directory loading may publish another empty context before it can resolve.
  setPublicBrokerContext(null);
  assert.equal(getAuthFlowState().screen, 'select-broker');
  setPublicBrokerContext(publicBrokerFixture('trivanta-markets'));
  assert.equal(getAuthFlowState().screen, 'login');
  assert.equal(getAuthFlowState().context, getPublicBrokerContext());
  assert.equal(getAuthFlowState().context?.brokerId, 'trivanta-markets');
});

test('Back revokes a cold account request before a later broker result arrives', () => {
  const drawer = mountGuestDrawerAction();
  drawer.press();
  assert.equal(getAuthFlowState().screen, 'select-broker');
  dismissAuthFlow();
  setPublicBrokerContext(publicBrokerFixture('later-broker'));
  assert.equal(getAuthFlowState().screen, 'guest', 'late selection must not reopen a cancelled form');
  drawer.finishNavigationLock();
  drawer.reopenDrawer();
  drawer.press();
  assert.equal(getAuthFlowState().screen, 'login', 'the next deliberate tap still opens');
  assert.equal(getAuthFlowState().context?.brokerId, 'later-broker');
});

test('opening guest login removes hosted content and cancels real queued tab navigation', async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;
  const queuedFrames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { queuedFrames.push(callback); return queuedFrames.length; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    setPublicBrokerContext(publicBrokerFixture());
    showSidebarDestination('/journal', 'sidebar');
    setFastTabActualRoute('/quotes');
    const revision = showFastTabVisualForSidebar('/settings');
    assert.notEqual(revision, null);
    let staleNavigations = 0;
    scheduleFastTabNavigation(revision!, () => {
      staleNavigations++;
      dismissAuthFlow();
    });
    const drawer = mountGuestDrawerAction();
    drawer.press();
    assert.equal(sidebarDestinationController.isVisible(), false);
    assert.equal(fastTabVisualController.getSnapshot().routeName, null);
    assert.equal(getAuthFlowState().screen, 'login');
    // Deliver even cancelled native frames, then let the scheduler fallback expire.
    for (const callback of queuedFrames.splice(0)) callback(0);
    await new Promise(resolve => setTimeout(resolve, 280));
    assert.equal(staleNavigations, 0);
    assert.equal(getAuthFlowState().screen, 'login');
    assert.deepEqual(drawer.routes, []);
  } finally {
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    if (originalCancelRaf) globalThis.cancelAnimationFrame = originalCancelRaf;
    else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  }
});
