import { redactDiagnosticValue } from './securityRedaction';

type RedactableConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn';
type ConsoleTarget = Record<RedactableConsoleMethod, (...args: unknown[]) => void>;

const METHODS: readonly RedactableConsoleMethod[] = ['debug', 'error', 'info', 'log', 'warn'];
const EXPO_OVERLAY_METHODS = new Set<RedactableConsoleMethod>(['error', 'warn']);
const installedTargets = new WeakSet<object>();

/**
 * Last-line defense for runtime diagnostics.
 *
 * React Native turns console.warn/error calls into Expo LogBox overlays. Those
 * methods are often used here from already-handled catch blocks, so presenting
 * them as another app error is both noisy and misleading. Preserve the message
 * in Metro/ADB with an explicit severity tag while routing it through log,
 * which does not create an overlay. Actual uncaught exceptions still use
 * ErrorUtils/ErrorBoundary and Sentry; this only changes explicit console calls.
 *
 * Individual call sites should still redact deliberately, but no console
 * argument may bypass this central scrubber.
 */
export const installSecurityRedactedConsole = (
  target: ConsoleTarget = console as unknown as ConsoleTarget,
): void => {
  if (installedTargets.has(target)) return;
  installedTargets.add(target);

  // Capture every original before replacing anything. In particular, warn and
  // error must call the original log rather than the wrapped log, otherwise a
  // custom console target could recurse or redact the same payload twice.
  const originals = Object.fromEntries(
    METHODS.map((method) => [method, target[method].bind(target)]),
  ) as Record<RedactableConsoleMethod, (...args: unknown[]) => void>;

  for (const method of METHODS) {
    target[method] = (...args: unknown[]) => {
      const redactedArgs = args.map(redactDiagnosticValue);
      if (EXPO_OVERLAY_METHODS.has(method)) {
        originals.log(`[console.${method}]`, ...redactedArgs);
        return;
      }
      originals[method](...redactedArgs);
    };
  }
};
