import { useEffect, useState } from 'react';
import { useUserPreferences } from '../../state/userPreferences';
import { scheduleIdleWork } from '../../utils/startupScheduler';

/**
 * Idle-scheduled startup boot for the chart WebView surface.
 *
 * Fresh app opens paid the entire chart cost (WebView document boot,
 * lightweight-charts parse and initChart handshake) on the
 * first Chart tab tap, which made that tap feel multi-second slow. Returning
 * true from this hook lets the surface mount while another tab is visible so
 * that surface work completes at app open; the first Chart visit can then
 * reveal the retained WebView and paint its focused data immediately. Hidden
 * tab scenes keep their full layout size
 * (opacity 0, never display:none), so the WebView boots and paints normally.
 *
 * An unconditional boot-prewarm was removed once before because it competed
 * with the login transition and first tab paint on low-memory devices. This
 * boot therefore holds back until:
 * - preferences have hydrated (the saved chart symbol/timeframe are available,
 *   so the surface boots against the right visual context), and
 * - CHART_SURFACE_STARTUP_BOOT_DELAY_MS has passed since those gates opened
 *   AND the JS thread reports an idle slot (scheduleIdleWork), so the boot
 *   never races startup navigation or the first visible tab's paint.
 *
 * The focused path still owns the boot when the user reaches Chart before the
 * idle boot fires (`surfaceAlreadyActivated` cancels the pending schedule).
 * Everything gated by chartRuntimeActive (including anonymous candle history,
 * quote hooks and positions polling) stays paused. The idle boot only mounts
 * the WebView surface; authenticated retained candle+Bid work still follows
 * its existing session-safe lifecycle.
 */
export const CHART_SURFACE_STARTUP_BOOT_DELAY_MS = 1000;
const CHART_SURFACE_STARTUP_BOOT_IDLE_TIMEOUT_MS = 3000;

export function useChartSurfaceStartupBoot(surfaceAlreadyActivated: boolean): boolean {
  const preferencesHydrated = useUserPreferences((state) => state.hasHydrated);
  const [startupBooted, setStartupBooted] = useState(false);

  useEffect(() => {
    if (startupBooted || surfaceAlreadyActivated || !preferencesHydrated) {
      return undefined;
    }

    return scheduleIdleWork(
      () => setStartupBooted(true),
      {
        delayMs: CHART_SURFACE_STARTUP_BOOT_DELAY_MS,
        timeoutMs: CHART_SURFACE_STARTUP_BOOT_IDLE_TIMEOUT_MS,
      },
    );
  }, [preferencesHydrated, startupBooted, surfaceAlreadyActivated]);

  return startupBooted;
}
