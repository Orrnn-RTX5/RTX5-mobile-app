import {
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../state/activeBrokerSession';

/** Executes a queued React quote commit only for its originating session. */
export const commitQuoteSnapshotIfSessionCurrent = (
  provenance: ActiveBrokerSessionProvenance | null | undefined,
  commit: () => void,
): boolean => {
  if (!provenance || !isActiveBrokerSessionProvenanceCurrent(provenance)) {
    return false;
  }
  commit();
  return true;
};
