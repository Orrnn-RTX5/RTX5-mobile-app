import { createShakeDetector, type MotionSample } from './shakeDetector';

type Subscription = { remove: () => void };
export type ShakeSensor = {
  isAvailableAsync: () => Promise<boolean>;
  setUpdateInterval: (intervalMs: number) => void;
  addListener: (listener: (sample: MotionSample) => void) => Subscription;
};
type Lifecycle = {
  readonly currentState: string | null;
  addEventListener: (event: 'change', listener: (state: string) => void) => Subscription;
};

export const SHAKE_COOLDOWN_MS = 3000;

/** One foreground-only subscription shared by every app screen. */
export function subscribeToShake({ loadSensor, lifecycle, canOpen, onShake, now = Date.now }: {
  loadSensor: () => Promise<ShakeSensor>;
  lifecycle: Lifecycle;
  canOpen: () => boolean;
  onShake: () => void;
  now?: () => number;
}): () => void {
  const detector = createShakeDetector();
  let sensorSubscription: Subscription | null = null;
  let disposed = false;
  let foreground = lifecycle.currentState === 'active';
  let generation = 0;
  let lastOpenedAt = -Infinity;

  const stop = () => {
    generation += 1;
    sensorSubscription?.remove();
    sensorSubscription = null;
    detector.reset();
  };

  const start = async () => {
    const currentGeneration = ++generation;
    const isCurrent = () => !disposed && foreground && generation === currentGeneration;
    try {
      const sensor = await loadSensor();
      if (!isCurrent() || !await sensor.isAvailableAsync() || !isCurrent()) return;
      // 20 Hz is enough for a hand shake, well below Android's 200 Hz cap.
      sensor.setUpdateInterval(50);
      sensorSubscription = sensor.addListener((sample) => {
        if (!isCurrent()) return;
        const time = now();
        if (time - lastOpenedAt < SHAKE_COOLDOWN_MS || !canOpen()) {
          detector.reset();
          return;
        }
        const sampleTime = Number.isFinite(sample.timestamp) ? sample.timestamp! * 1000 : time;
        if (detector.add(sample, sampleTime)) {
          lastOpenedAt = time;
          onShake();
        }
      });
    } catch {
      // No sensor / an older native binary must not interrupt the app.
    }
  };

  const lifecycleSubscription = lifecycle.addEventListener('change', (state) => {
    const nextForeground = state === 'active';
    if (foreground === nextForeground) return;
    foreground = nextForeground;
    stop();
    if (foreground) void start();
  });
  if (foreground) void start();

  return () => {
    disposed = true;
    stop();
    lifecycleSubscription.remove();
  };
}
