/** Deduplicate one gesture without throttling separate, rapid tab taps. */
export function createBottomTabPressGate(getEpoch: () => number = () => 0) {
  let phase: 'idle' | 'pressed' | 'released' = 'idle';
  let lastReleaseEvent: object | null = null;
  let epoch = getEpoch();
  const reset = () => {
    epoch = getEpoch();
    phase = 'idle';
    lastReleaseEvent = null;
  };
  const recoverInterruptedGesture = () => {
    if (epoch !== getEpoch()) reset();
  };

  return {
    beginGesture() {
      reset();
    },
    claimPressIn() {
      recoverInterruptedGesture();
      if (phase === 'pressed') return false;
      phase = 'pressed';
      return true;
    },
    claimPress(event: object) {
      recoverInterruptedGesture();
      if (event === lastReleaseEvent) return false;
      lastReleaseEvent = event;
      const alreadyActivated = phase === 'pressed';
      phase = 'released';
      // Accessibility and web clicks can arrive without touch-start/press-in.
      return !alreadyActivated;
    },
  };
}
