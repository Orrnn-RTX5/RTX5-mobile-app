import { useIsFocused } from '@react-navigation/native';
import { useEffect, useSyncExternalStore } from 'react';
import { router, usePathname } from 'expo-router';
import { Platform } from 'react-native';
import { getPublicBrokerContext, subscribePublicBrokerContext } from '../../state/publicBrokerContext';
import { deferAuthEntryUntilQuotes, openAuthFlow } from '../trade/authFlowState';
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
    if (Platform.OS === 'ios') {
      // Presenting now races UIKit's removal of this native stack screen and
      // can leave an invisible modal intercepting the hamburger on Quotes.
      deferAuthEntryUntilQuotes(form, pathname);
      // Keep one dashboard: replacing this entry would duplicate the tabs
      // already below it and retain a native screen over guest touch surfaces.
      router.dismissTo('/(tabs)/quotes');
      return;
    }
    openAuthFlow(undefined, form, pathname);
    router.dismissTo('/(tabs)/quotes');
  }, [context, form, pathname, focused]);
  return null;
}
