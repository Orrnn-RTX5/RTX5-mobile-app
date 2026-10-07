import { JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute } from '../features/settings/JournalScreen/deferredRoute';
import { preloadRegisterScreen } from '../features/settings/registerScreenPreload';
import {
  ACCOUNTS_ROUTE_MODULE_CACHE_KEY,
  loadAccountsScreenRoute,
} from '../features/settings/accountsScreenPreload';
import {
  BROKERS_ROUTE_MODULE_CACHE_KEY,
  loadBrokersScreenRoute,
} from '../features/settings/BrokersScreen/brokersScreenPreload';
import {
  BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY,
  loadBrokerDetailScreenRoute,
} from '../features/settings/brokerDetailScreenPreload';
import { preloadDeferredRouteModule } from '../ui/components/DeferredRouteMount';
import { scheduleIdleWork } from './startupScheduler';

const SETTINGS_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS = 0;
const SETTINGS_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS = 12;
const SETTINGS_ROUTE_MODULE_WARMUP_INITIAL_TIMEOUT_MS = 350;
const SETTINGS_ROUTE_MODULE_WARMUP_BATCH_TIMEOUT_MS = 500;

const SETTINGS_ROUTE_MODULE_LOADERS = [
  { key: ACCOUNTS_ROUTE_MODULE_CACHE_KEY, load: loadAccountsScreenRoute },
  { key: BROKERS_ROUTE_MODULE_CACHE_KEY, load: loadBrokersScreenRoute },
  { key: BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY, load: loadBrokerDetailScreenRoute },
  { key: 'settings/economic-calendar', load: () => import('../features/settings/EconomicCalendarScreen').then((module) => module.EconomicCalendarScreen) },
  { key: 'settings/interface', load: () => import('../features/settings/InterfaceScreen').then((module) => module.InterfaceScreen) },
  { key: JOURNAL_ROUTE_CACHE_KEY, load: loadJournalScreenRoute },
  { key: 'settings/help', load: () => import('../features/settings/HelpScreen').then((module) => module.HelpScreen) },
] as const;

let settingsRouteWarmupStarted = false;

export function warmSettingsRouteModules() {
  if (settingsRouteWarmupStarted) {
    return () => {};
  }

  settingsRouteWarmupStarted = true;
  let cancelled = false;
  const cancelScheduledWork: Array<() => void> = [];
  let cursor = 0;

  const warmNextModule = () => {
    if (cancelled) {
      return;
    }

    if (cursor === 0) {
      void preloadRegisterScreen().catch(() => undefined);
    }

    if (cursor >= SETTINGS_ROUTE_MODULE_LOADERS.length) {
      return;
    }

    const module = SETTINGS_ROUTE_MODULE_LOADERS[cursor];
    cursor += 1;
    void preloadDeferredRouteModule(module.key, module.load).catch(() => undefined);

    if (cursor < SETTINGS_ROUTE_MODULE_LOADERS.length) {
      const cancel = scheduleIdleWork(warmNextModule, {
        delayMs: SETTINGS_ROUTE_MODULE_WARMUP_BATCH_DELAY_MS,
        timeoutMs: SETTINGS_ROUTE_MODULE_WARMUP_BATCH_TIMEOUT_MS,
      });
      cancelScheduledWork.push(cancel);
    }
  };

  const cancelInitialWarmup = scheduleIdleWork(warmNextModule, {
    delayMs: SETTINGS_ROUTE_MODULE_WARMUP_INITIAL_DELAY_MS,
    timeoutMs: SETTINGS_ROUTE_MODULE_WARMUP_INITIAL_TIMEOUT_MS,
  });
  cancelScheduledWork.push(cancelInitialWarmup);

  return () => {
    cancelled = true;
    cancelScheduledWork.forEach((cancel) => cancel());
    cancelScheduledWork.length = 0;
  };
}
