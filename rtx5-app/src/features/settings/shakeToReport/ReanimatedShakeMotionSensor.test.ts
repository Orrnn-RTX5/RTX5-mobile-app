import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const app = process.cwd();
const requireFromApp = createRequire(path.join(app, 'package.json'));
const babel = requireFromApp('@babel/core');

for (const platform of ['android', 'ios']) {
  test(`${platform} production worklets forward native readings without expo-sensors or visible UI`, () => {
    const file = path.join(app, 'src/features/settings/shakeToReport/ReanimatedShakeMotionSensor.tsx');
    const { code } = babel.transformFileSync(file, {
      cwd: app,
      configFile: path.join(app, 'babel.config.js'),
      caller: { name: 'metro', bundler: 'metro', platform, engine: 'hermes', isDev: false, isServer: false },
    });
    assert.match(code, /__workletHash/);
    let prepare!: () => { x: number; y: number; z: number; timeMs: number };
    let react!: (sample: ReturnType<typeof prepare>, previous: ReturnType<typeof prepare> | null) => void;
    let configuration: unknown;
    const sensor = { value: { x: 0, y: 0, z: 0 } };
    const samples: unknown[][] = [];
    const exports: { ReanimatedShakeMotionSensor?: (props: unknown) => unknown } = {};
    const context: Record<string, unknown> = {
      exports, Date, Error,
      require: (name: string) => {
        assert.equal(name, 'react-native-reanimated', 'the legacy OTA must use its existing native module');
        return {
          SensorType: { ACCELEROMETER: 1 },
          useAnimatedSensor: (type: number, config: Record<string, unknown>) => {
            configuration = { type, ...config };
            return { sensor };
          },
          useAnimatedReaction: (getSample: typeof prepare, onSample: typeof react) => {
            prepare = getSample;
            react = onSample;
          },
          runOnJS: (callback: (...args: unknown[]) => void) => callback,
        };
      },
    };
    context.global = context;
    vm.runInNewContext(code, context, { filename: file });
    assert.equal(exports.ReanimatedShakeMotionSensor?.({
      generation: 7, onSample: (...args: unknown[]) => samples.push(args),
    }), null);
    assert.deepEqual(configuration, { type: 1, interval: 50, adjustToInterfaceOrientation: false });
    const initial = prepare();
    react(initial, null);
    assert.equal(samples.length, 0);
    sensor.value = { x: 19.62, y: -9.81, z: 0 };
    react(prepare(), initial);
    assert.equal(samples.length, 1);
    assert.deepEqual(samples[0].slice(0, 4), [7, 19.62, -9.81, 0]);
    assert.ok(Number.isFinite(samples[0][4]));
  });
}
