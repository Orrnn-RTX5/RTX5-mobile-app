import { useIsFocused } from '@react-navigation/native';
import { useEffect, useSyncExternalStore } from 'react';
import { router, usePathname } from 'expo-router';
import { getPublicBrokerContext, subscribePublicBrokerContext } from '../../state/publicBrokerContext';
import { openAuthFlow } from '../trade/authFlowState';
import { hideRegisterLaunch } from '../settings/registerLaunchController';
import { hideBrokerDetailLaunch } from '../settings/brokerDetailLaunchController';
export function AuthEntryScreen({ form }: { form: 'login' | 'demo' }) {
  const pathname = usePathname();
  const focused = useIsFocused();
  const context = useSyncExternalStore(subscribePublicBrokerContext, getPublicBrokerContext, getPublicBrokerContext);
  useEffect(() => {
    // Native stacks retain blurred entries. They must not redirect later tab
    // changes or reopen authentication after the user dismisses the modal.
    if (!context || !focused || !/^\/(?:login|register|register-entry|settings\/broker-detail)$/.test(pathname)) return;
    hideRegisterLaunch(); hideBrokerDetailLaunch();
    openAuthFlow(undefined, form, pathname);
    router.replace('/(tabs)/quotes');
  }, [context, form, pathname, focused]);
  return null;
}
