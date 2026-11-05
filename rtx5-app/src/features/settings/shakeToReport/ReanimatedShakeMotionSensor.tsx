import { runOnJS, SensorType, useAnimatedReaction, useAnimatedSensor } from 'react-native-reanimated';

type Props = {
  generation: number;
  onSample: (generation: number, x: number, y: number, z: number, timeMs: number) => void;
};

/** Uses native sensor support already bundled with the production Reanimated
 * module. Mount only while subscribed; unmounting unregisters the hardware.
 */
export function ReanimatedShakeMotionSensor({ generation, onSample }: Props) {
  const { sensor } = useAnimatedSensor(SensorType.ACCELEROMETER, {
    interval: 50,
    adjustToInterfaceOrientation: false,
  });

  useAnimatedReaction(
    () => {
      const { x, y, z } = sensor.value;
      return { x, y, z, timeMs: Date.now() };
    },
    (sample, previous) => {
      // Ignore the hook's initial zero value before the first hardware event.
      if (previous === null) return;
      runOnJS(onSample)(generation, sample.x, sample.y, sample.z, sample.timeMs);
    },
    [generation, onSample, sensor],
  );

  return null;
}
