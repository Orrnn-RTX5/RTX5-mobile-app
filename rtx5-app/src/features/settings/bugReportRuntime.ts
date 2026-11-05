import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Dimensions, Platform } from 'react-native';
import { sanitizeBugReportContext, type BugReportContext } from '../../api/bugReports';
import { getFeedHealthSnapshot } from '../../market/feedHealthRuntime';
import { captureActiveBrokerSession } from '../../state/activeBrokerSession';
import { useTradingState } from '../../state/tradingState';
import { useUserPreferences } from '../../state/userPreferences';
import { sidebarDestinationController } from '../../ui/components/sidebarDestinationHostController';

/** Capture before navigation/overlay visibility changes, never inspect storage or session dumps. */
export function captureBugReportContext(pathname: string): BugReportContext {
  const route = sanitizeBugReportContext({ route: sidebarDestinationController.getSnapshot().activePath ?? pathname }).route ?? '';
  const chart = /chart/i.test(route);
  const preferences = useUserPreferences.getState();
  const health = getFeedHealthSnapshot();
  const symbol = chart ? preferences.chartSymbol : undefined;
  const quote = symbol ? useTradingState.getState().quotes[symbol] : undefined;
  const dimensions = Dimensions.get('screen');
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version;
  const build = Application.nativeBuildVersion;
  // Intl is part of the existing Hermes runtime and does not require the new
  // ExpoLocalization native module on older installed binaries.
  let locale: Intl.ResolvedDateTimeFormatOptions | undefined;
  try { locale = Intl.DateTimeFormat().resolvedOptions(); } catch { /* Context is optional. */ }
  return sanitizeBugReportContext({
    route, page: `RTX Mobile / ${route.split('/').filter(Boolean).join(' / ') || 'Home'}`,
    ...(version ? { app_version: `RTX Mobile ${version}${build ? ` (build ${build})` : ''}` } : {}),
    ...(Platform.OS !== 'web' ? { os: Platform.OS === 'android' ? `Android ${Platform.constants.Release}` : `iOS ${Platform.Version}`, browser: '' } : {}),
    screen_resolution: `${Math.round(dimensions.width * dimensions.scale)}x${Math.round(dimensions.height * dimensions.scale)}`,
    ...(locale?.timeZone ? { timezone: locale.timeZone } : {}),
    ...(locale?.locale ? { locale: locale.locale } : {}),
    connection_state: health.status,
    ...(symbol ? { symbol, timeframe: preferences.chartTimeframe } : {}),
    ...(quote?.lastReceivedAt ? { quote_age_ms: Math.max(0, Math.round(Date.now() - quote.lastReceivedAt)) } : {}),
  });
}

export { readBugReportDraft, saveBugReportDraft, clearBugReportDraft } from './bugReportDraftState';
let pendingContext: BugReportContext | undefined;
export function primeBugReportContext(pathname: string) { pendingContext = captureBugReportContext(pathname); }
export function takeBugReportContext(pathname: string) {
  const value = pendingContext ?? captureBugReportContext(pathname);
  pendingContext = undefined; return value;
}
export function bugReportDraftScope(): string {
  const capture = captureActiveBrokerSession();
  return capture ? `${capture.session.brokerId}:${capture.session.accountLogin}` : 'signed-out';
}

let closeGuard: (() => void) | undefined;
export function registerBugReportCloseGuard(guard: () => void) {
  closeGuard = guard; return () => { if (closeGuard === guard) closeGuard = undefined; };
}
export function requestBugReportClose(fallback: () => void) { if (closeGuard) closeGuard(); else fallback(); }
