import { useEffect, useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import { getPublicBrokerContext, subscribePublicBrokerContext } from '../../state/publicBrokerContext';
import { openAuthFlow } from '../trade/authFlowState';
import { hideRegisterLaunch } from '../settings/registerLaunchController';
import { hideBrokerDetailLaunch } from '../settings/brokerDetailLaunchController';
export function AuthEntryScreen({ form }: { form: 'login' | 'demo' }) {
  const context = useSyncExternalStore(subscribePublicBrokerContext, getPublicBrokerContext, getPublicBrokerContext);
  useEffect(() => {
    if (!context) return;
    hideRegisterLaunch(); hideBrokerDetailLaunch();
    openAuthFlow(undefined, form);
    router.replace('/(tabs)/quotes');
  }, [context, form]);
  return null;
}
