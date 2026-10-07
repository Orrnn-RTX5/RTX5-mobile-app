import { JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute } from '../features/settings/JournalScreen/deferredRoute';
import {
  ACCOUNTS_ROUTE_MODULE_CACHE_KEY,
  loadAccountsScreenRoute,
} from '../features/settings/accountsScreenPreload';
import { preloadDeferredRouteModule } from '../ui/components/DeferredRouteMount';
import { scheduleIdleWork } from './startupScheduler';

const SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS = 0;
const SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS = 16;
const SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_TIMEOUT_MS = 450;
const SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_TIMEOUT_MS = 650;

const SIDEBAR_ROUTE_MODULE_LOADERS = [
  { key: 'trade/index', load: () => import('../features/trade/TradeScreen').then((module) => module.TradeScreen) },
  { key: 'settings/index', load: () => import('../features/settings/SettingsScreen').then((module) => module.SettingsScreen) },
  { key: 'settings/about', load: () => import('../features/settings/AboutScreen').then((module) => module.AboutScreen) },
  { key: 'settings/user-guide', load: () => import('../features/settings/UserGuideScreen').then((module) => module.UserGuideScreen) },
  { key: 'settings/help', load: () => import('../features/settings/HelpScreen').then((module) => module.HelpScreen) },
  { key: JOURNAL_ROUTE_CACHE_KEY, load: loadJournalScreenRoute },
  { key: 'settings/economic-calendar', load: () => import('../features/settings/EconomicCalendarScreen').then((module) => module.EconomicCalendarScreen) },
  { key: ACCOUNTS_ROUTE_MODULE_CACHE_KEY, load: loadAccountsScreenRoute },
  { key: 'settings/interface', load: () => import('../features/settings/InterfaceScreen').then((module) => module.InterfaceScreen) },
] as const;

let sidebarRouteModuleWarmupStarted = false;

export function warmSidebarRouteModules() {
  if (sidebarRouteModuleWarmupStarted) {
    return () => {};
  }

  sidebarRouteModuleWarmupStarted = true;
  let cancelled = false;
  const cancelScheduledWork: Array<() => void> = [];
  let cursor = 0;

  const warmNextModule = () => {
    if (cancelled || cursor >= SIDEBAR_ROUTE_MODULE_LOADERS.length) {
      return;
    }

    const module = SIDEBAR_ROUTE_MODULE_LOADERS[cursor];
    cursor += 1;
    void preloadDeferredRouteModule(module.key, module.load).catch(() => undefined);

    if (cursor < SIDEBAR_ROUTE_MODULE_LOADERS.length) {
      const cancel = scheduleIdleWork(warmNextModule, {
        delayMs: SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS,
        timeoutMs: SIDEBAR_ROUTE_MODULE_WARMUP_BATCH_TIMEOUT_MS,
      });
      cancelScheduledWork.push(cancel);
    }
  };

  const cancelInitialWarmup = scheduleIdleWork(warmNextModule, {
    delayMs: SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS,
    timeoutMs: SIDEBAR_ROUTE_MODULE_WARMUP_INITIAL_TIMEOUT_MS,
  });
  cancelScheduledWork.push(cancelInitialWarmup);

  return () => {
    cancelled = true;
    cancelScheduledWork.forEach((cancel) => cancel());
    cancelScheduledWork.length = 0;
  };
}
