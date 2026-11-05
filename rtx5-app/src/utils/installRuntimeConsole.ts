import { installSecurityRedactedConsole } from './securityRedactedConsole';

// Install during module evaluation so imports mounted by the root layout cannot
// emit a handled warning/error before the Expo LogBox-safe console is active.
installSecurityRedactedConsole();
