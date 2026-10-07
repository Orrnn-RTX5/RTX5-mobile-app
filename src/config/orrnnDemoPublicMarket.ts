// Compatibility names retained for chart callers; routing is now directory-scoped.
import { getPublicBrokerContext, subscribePublicBrokerContext } from '../state/publicBrokerContext';
export let ORRNN_DEMO_PUBLIC_BROKER_ID = '';
export let ORRNN_PUBLIC_DEMO_LOGIN_BROKER_ID = '';
export let ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL = '';
export let ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE = 'public-market:unselected';
export let ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL = '';
export let ORRNN_DEMO_PUBLIC_FEED_WS_URL = '';
export let ORRNN_DEMO_PUBLIC_FEED_STATUS_URL = '';
function update() {
  const context = getPublicBrokerContext();
  ORRNN_DEMO_PUBLIC_BROKER_ID = ORRNN_PUBLIC_DEMO_LOGIN_BROKER_ID = context?.brokerId ?? '';
  ORRNN_DEMO_PUBLIC_MARKET_API_BASE_URL = context?.apiBase ?? '';
  ORRNN_DEMO_PUBLIC_GATEWAY_BASE_URL = context?.apiBase.replace(/\/api\/v2$/, '') ?? '';
  ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE = context?.cacheNamespace ?? 'public-market:unselected';
  ORRNN_DEMO_PUBLIC_FEED_WS_URL = context?.feedWsBase ?? '';
  ORRNN_DEMO_PUBLIC_FEED_STATUS_URL = context?.feedStatusUrl ?? '';
}
subscribePublicBrokerContext(update); update();
export function resolveBrokerConnectionWithPublicDemoDefault(input: { brokerId: string; serverUrl: string; isLoggedIn: boolean }) {
  return !input.isLoggedIn && input.brokerId === 'orrnn-demo'
    ? { brokerId: '', serverUrl: '' } : { brokerId: input.brokerId, serverUrl: input.serverUrl };
}

