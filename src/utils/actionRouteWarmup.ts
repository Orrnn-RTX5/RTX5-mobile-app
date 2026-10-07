import { JOURNAL_ROUTE_CACHE_KEY, loadJournalScreenRoute } from '../features/settings/JournalScreen/deferredRoute';
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
import {
  MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY,
  SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY,
  loadMarketStatisticsScreenRoute,
  loadSymbolDetailsScreenRoute,
} from '../features/quotes/quotesRoutePreloads';
import {
  ORDER_TICKET_ROUTE_MODULE_CACHE_KEY,
  loadOrderTicketScreenRoute,
} from '../features/trade/orderTicketScreenPreload';
import { preloadDeferredRouteModule } from '../ui/components/DeferredRouteMount';
import { prefetchBrokerServers } from '../query/broker';
import { scheduleIdleWork } from './startupScheduler';
import { isStartupBackgroundWorkAllowed, subscribeStartupBackgroundWork } from './startupWorkGate';
import { createStartupWorkQueue } from './startupWorkQueue';

const ACTION_DEFERRED_MODULE_WARMUP_DELAY_MS = 180;

const ACTION_DEFERRED_MODULE_WARMUPS = [
  { cacheKey: JOURNAL_ROUTE_CACHE_KEY, load: loadJournalScreenRoute },
  // /settings/accounts hides its heavy screen behind DeferredRouteModule. Warm
  // only that module so the first "Manage accounts" tap does not wait for
  // evaluation; prefetching the route itself mounts a hidden navigation tree.
  { cacheKey: ACCOUNTS_ROUTE_MODULE_CACHE_KEY, load: loadAccountsScreenRoute },
  // Accounts' + action shows a mounted Brokers shell first; keep the real
  // screen module warm so the shell-to-route handoff completes within frames.
  { cacheKey: BROKERS_ROUTE_MODULE_CACHE_KEY, load: loadBrokersScreenRoute },
  // A broker row shows a live-data shell immediately; warm the full account
  // form so the shell is replaced by interactive controls within a few frames.
  { cacheKey: BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY, load: loadBrokerDetailScreenRoute },
  // Quotes symbol action-sheet destinations hide their heavy screens behind
  // DeferredRouteModule so the sheet tap commits only a light launch preview;
  // warm their modules so the preview lasts about one frame instead of a
  // first-visit module evaluation.
  { cacheKey: ORDER_TICKET_ROUTE_MODULE_CACHE_KEY, load: loadOrderTicketScreenRoute },
  { cacheKey: SYMBOL_DETAILS_ROUTE_MODULE_CACHE_KEY, load: loadSymbolDetailsScreenRoute },
  { cacheKey: MARKET_STATISTICS_ROUTE_MODULE_CACHE_KEY, load: loadMarketStatisticsScreenRoute },
] as const;

let directoryWarmupStarted = false;
let warmupOwners = 0;
let unsubscribeWorkGate: (() => void) | null = null;
const moduleWarmupQueue = createStartupWorkQueue({
  tasks: ACTION_DEFERRED_MODULE_WARMUPS.map(module => () =>
    preloadDeferredRouteModule(module.cacheKey, module.load)),
  canRun: isStartupBackgroundWorkAllowed,
  schedule: (work, index) => scheduleIdleWork(work, {
    delayMs: index === 0 ? ACTION_DEFERRED_MODULE_WARMUP_DELAY_MS : 0,
    timeoutMs: 1200,
  }),
});

export function warmActionRoutes() {
  if (!directoryWarmupStarted) {
    directoryWarmupStarted = true;
    // Directory reads are coalesced independently from optional module work;
    // the initial broker picker needs this data while auth prewarming pauses.
    void prefetchBrokerServers().catch(() => undefined);
  }
  warmupOwners += 1;
  if (warmupOwners === 1) {
    unsubscribeWorkGate = subscribeStartupBackgroundWork(moduleWarmupQueue.refresh);
    moduleWarmupQueue.setActive(true);
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    warmupOwners -= 1;
    if (warmupOwners === 0) {
      unsubscribeWorkGate?.();
      unsubscribeWorkGate = null;
      moduleWarmupQueue.setActive(false);
    }
  };
}
