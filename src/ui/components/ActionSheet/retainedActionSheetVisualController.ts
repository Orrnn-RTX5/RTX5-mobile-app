export type RetainedActionSheetVisualMode = 'hidden' | 'preview' | 'committed';

export type RetainedActionSheetVisualSnapshot = Readonly<{
  mode: RetainedActionSheetVisualMode;
  visualKey: string | null;
  revision: number;
}>;

type RetainedActionSheetVisualApplier = (
  snapshot: RetainedActionSheetVisualSnapshot,
) => boolean;

type RetainedActionSheetHostParker = (activeVisualKey: string) => boolean;

const hiddenSnapshot = (revision: number): RetainedActionSheetVisualSnapshot => ({
  mode: 'hidden',
  visualKey: null,
  revision,
});

let nextRevision = 0;
let snapshot = hiddenSnapshot(nextRevision);
const visualAppliers = new Set<RetainedActionSheetVisualApplier>();
const hostParkers = new Set<RetainedActionSheetHostParker>();

const applySnapshot = (nextSnapshot: RetainedActionSheetVisualSnapshot) => {
  let applied = false;
  visualAppliers.forEach((applier) => {
    applied = applier(nextSnapshot) || applied;
  });
  return applied;
};

const publishVisualSnapshot = (
  nextSnapshot: RetainedActionSheetVisualSnapshot,
  apply = true,
) => {
  snapshot = nextSnapshot;
  if (apply) {
    return applySnapshot(snapshot);
  }
  return false;
};

/**
 * Arms an exact already-mounted sheet without revealing it. The caller must
 * still confirm the press or cancel it when a scroll/long-press wins.
 */
export function requestRetainedActionSheetPreview(visualKey: string) {
  const revision = ++nextRevision;

  if (snapshot.mode !== 'hidden') {
    publishVisualSnapshot(hiddenSnapshot(revision));
  }

  publishVisualSnapshot({
    mode: 'preview',
    visualKey,
    revision,
  });
  return revision;
}

/** Promotes a matching prepared sheet to visible pixels in the release turn. */
export function commitRetainedActionSheetPreview(
  revision: number,
  visualKey: string,
) {
  if (
    snapshot.revision !== revision ||
    snapshot.visualKey !== visualKey ||
    snapshot.mode === 'hidden'
  ) {
    return false;
  }

  return publishVisualSnapshot({
    mode: 'committed',
    visualKey,
    revision,
  });
}

/** Hides a preview immediately; stale gestures cannot hide a newer request. */
export function cancelRetainedActionSheetPreview(revision?: number) {
  if (
    snapshot.mode === 'hidden' ||
    (revision !== undefined && snapshot.revision !== revision)
  ) {
    return false;
  }

  publishVisualSnapshot(hiddenSnapshot(++nextRevision));
  return true;
}

/**
 * React has adopted the committed visibility. Release controller ownership
 * without writing a hidden native state over the now-visible sheet.
 */
export function acknowledgeRetainedActionSheetVisible(visualKey: string) {
  if (snapshot.mode !== 'committed' || snapshot.visualKey !== visualKey) {
    return false;
  }

  publishVisualSnapshot(hiddenSnapshot(++nextRevision), false);
  return true;
}

export function getRetainedActionSheetVisualSnapshot() {
  return snapshot;
}

/** Re-checks a pending preparation after its exact hidden content has committed. */
export function syncRetainedActionSheetVisual() {
  return applySnapshot(snapshot);
}

export function registerRetainedActionSheetVisualApplier(
  applier: RetainedActionSheetVisualApplier,
) {
  visualAppliers.add(applier);
  applier(snapshot);

  return () => {
    visualAppliers.delete(applier);
  };
}

/**
 * Hides the exact currently mounted host before React replaces its rows with a
 * different sheet configuration. This one-off preparation deliberately does
 * not change the retained preview snapshot.
 */
export function parkRetainedActionSheetHostForConfigSwap(activeVisualKey: string) {
  let parked = false;
  hostParkers.forEach((parker) => {
    parked = parker(activeVisualKey) || parked;
  });
  return parked;
}

export function registerRetainedActionSheetHostParker(
  parker: RetainedActionSheetHostParker,
) {
  hostParkers.add(parker);

  return () => {
    hostParkers.delete(parker);
  };
}

export function resetRetainedActionSheetVisualControllerForTests() {
  nextRevision = 0;
  snapshot = hiddenSnapshot(nextRevision);
  visualAppliers.clear();
  hostParkers.clear();
}
