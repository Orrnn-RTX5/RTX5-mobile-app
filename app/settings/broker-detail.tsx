import { AuthEntryScreen } from '../../src/features/auth/AuthEntryScreen';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { BrokerDetailLaunchShell } from '../../src/features/settings/BrokerDetailLaunchShell';
import {
  brokerDetailLaunchController,
  hideBrokerDetailLaunch,
  normalizeBrokerDetailLaunchSelection,
} from '../../src/features/settings/brokerDetailLaunchController';
import { showBrokersReturnLaunch } from '../../src/features/settings/brokersLaunchController';
import {
  scheduleRegisterLaunchNavigation,
  showRegisterLaunch,
} from '../../src/features/settings/registerLaunchController';
import {
  BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY,
  loadBrokerDetailScreenRoute,
} from '../../src/features/settings/brokerDetailScreenPreload';
import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../src/utils/navigation';

function LegacyBrokerDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    brokerId?: string;
    brokerName?: string;
    brokerServer?: string;
    brokerServerUrl?: string;
    brokerLogoUrl?: string;
    brokerDomain?: string;
  }>();
  const selection = useMemo(() => normalizeBrokerDetailLaunchSelection({
    brokerId: params.brokerId,
    brokerName: params.brokerName,
    brokerServer: params.brokerServer,
    brokerServerUrl: params.brokerServerUrl,
    brokerLogoUrl: params.brokerLogoUrl,
    brokerDomain: params.brokerDomain,
  }), [
    params.brokerDomain,
    params.brokerId,
    params.brokerLogoUrl,
    params.brokerName,
    params.brokerServer,
    params.brokerServerUrl,
  ]);
  const handleBack = useCallback(() => {
    showBrokersReturnLaunch();
    if (brokerDetailLaunchController.isVisible()) {
      hideBrokerDetailLaunch();
    }
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, '/settings/brokers');
    });
  }, [router]);
  const handleOpenDemo = useCallback(() => {
    const registerRevision = showRegisterLaunch(selection);
    scheduleRegisterLaunchNavigation(registerRevision, () => {
      router.push({
        pathname: '/register-entry',
        params: {
          origin: 'broker-detail',
          registerLaunchRevision: String(registerRevision),
        },
      });
    });
  }, [router, selection]);

  return (
    <DeferredRouteModule
      cacheKey={BROKER_DETAIL_ROUTE_MODULE_CACHE_KEY}
      load={loadBrokerDetailScreenRoute}
      mountDelayMs={0}
      fallback={brokerDetailLaunchController.isVisible()
        ? null
        : (
        <BrokerDetailLaunchShell
          selection={selection}
          onBack={handleBack}
          onOpenDemo={handleOpenDemo}
          backLatencyLabel="brokerDetail.routeFallback.back"
        />
      )}
    />
  );
}

export default function SharedAuthenticationEntry() { return <AuthEntryScreen form="login" />; }

