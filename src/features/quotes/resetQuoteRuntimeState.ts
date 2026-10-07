import { resetLiveSymbolQuoteRuntimeState } from '../../query/websocket';
import { resetLiveQuoteSnapshotRuntimeState } from './useLiveQuotes';

/** Single coordinator seam for clearing all module-level quote runtime state. */
export const resetQuoteRuntimeState = (): void => {
  resetLiveSymbolQuoteRuntimeState();
  resetLiveQuoteSnapshotRuntimeState();
};
