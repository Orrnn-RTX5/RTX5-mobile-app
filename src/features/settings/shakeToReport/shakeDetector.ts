export type MotionSample = Readonly<{ x: number; y: number; z: number; timestamp?: number }>;

const IMPULSE_THRESHOLD_G = 1.2;
const MIN_IMPULSE_GAP_MS = 80;
const MAX_IMPULSE_GAP_MS = 400;
const SHAKE_WINDOW_MS = 900;
const MAX_SAMPLE_GAP_MS = 250;

/** Three strong, alternating impulses distinguish a shake from a single bump.
 * Acceleration differences cancel constant gravity in any device orientation.
 */
export function createShakeDetector() {
  let previous: MotionSample | null = null;
  let previousTime = 0;
  let lastImpulse: MotionSample | null = null;
  let lastImpulseTime = 0;
  let firstImpulseTime = 0;
  let impulseCount = 0;

  const reset = () => {
    previous = null;
    lastImpulse = null;
    impulseCount = 0;
  };

  return {
    reset,
    add(sample: MotionSample, timeMs: number): boolean {
      if (![sample.x, sample.y, sample.z, timeMs].every(Number.isFinite)) {
        reset();
        return false;
      }
      if (previous && timeMs <= previousTime) return false;
      if (previous && timeMs - previousTime > MAX_SAMPLE_GAP_MS) reset();
      const prior = previous;
      previous = sample;
      previousTime = timeMs;
      if (!prior) return false;

      const impulse = { x: sample.x - prior.x, y: sample.y - prior.y, z: sample.z - prior.z };
      const strength = Math.hypot(impulse.x, impulse.y, impulse.z);
      if (strength < IMPULSE_THRESHOLD_G) return false;
      if (impulseCount && timeMs - lastImpulseTime < MIN_IMPULSE_GAP_MS) return false;

      if (timeMs - lastImpulseTime > MAX_IMPULSE_GAP_MS || timeMs - firstImpulseTime > SHAKE_WINDOW_MS) {
        impulseCount = 0;
        lastImpulse = null;
      }
      // Count only clear reversals, not sustained movement in one direction.
      const alignment = lastImpulse
        ? (impulse.x * lastImpulse.x + impulse.y * lastImpulse.y + impulse.z * lastImpulse.z)
          / (strength * Math.hypot(lastImpulse.x, lastImpulse.y, lastImpulse.z))
        : -1;
      if (alignment > -0.5) return false;
      if (!impulseCount) firstImpulseTime = timeMs;
      lastImpulse = impulse;
      lastImpulseTime = timeMs;
      impulseCount += 1;
      if (impulseCount < 3) return false;
      reset();
      return true;
    },
  };
}
