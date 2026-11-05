import type { MotionSample } from './shakeDetector';
import type { ShakeSensor } from './shakeSubscription';

// Reanimated reports m/s² on both platforms; the existing detector expects g.
const METRES_PER_SECOND_SQUARED_PER_G = 9.81;

/** Connect native worklet samples to the existing foreground/cooldown service.
 * Only listener activity changes React state; individual readings do not.
 */
export function createReanimatedShakeSensorBridge() {
  const listeners = new Set<(sample: MotionSample) => void>();
  const activityListeners = new Set<() => void>();
  let generation = 0;
  let nextGeneration = 0;
  const notifyActivity = () => activityListeners.forEach((listener) => listener());

  const sensor: ShakeSensor = {
    // This bridge is available without expo-sensors. Hardware availability is
    // handled by useAnimatedSensor, which emits nothing for an absent sensor.
    isAvailableAsync: async () => true,
    setUpdateInterval: () => {}, // The native hook owns the fixed 50 ms interval.
    addListener: (listener) => {
      const wasInactive = listeners.size === 0;
      listeners.add(listener);
      if (wasInactive) {
        generation = ++nextGeneration;
        notifyActivity();
      }
      let removed = false;
      return {
        remove: () => {
          if (removed) return;
          removed = true;
          listeners.delete(listener);
          if (!listeners.size) {
            generation = 0;
            notifyActivity();
          }
        },
      };
    },
  };

  return {
    sensor,
    getSnapshot: () => generation,
    subscribeActivity: (listener: () => void) => {
      activityListeners.add(listener);
      return () => { activityListeners.delete(listener); };
    },
    emit: (sampleGeneration: number, x: number, y: number, z: number, timeMs: number) => {
      // A queued UI-thread sample from before backgrounding must never reach
      // a newly mounted subscription after returning to the app.
      if (!generation || sampleGeneration !== generation) return;
      const sample: MotionSample = {
        x: x / METRES_PER_SECOND_SQUARED_PER_G,
        y: y / METRES_PER_SECOND_SQUARED_PER_G,
        z: z / METRES_PER_SECOND_SQUARED_PER_G,
        timestamp: timeMs / 1000,
      };
      listeners.forEach((listener) => listener(sample));
    },
  };
}
