import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const readSource = (filePath: string) =>
  readFileSync(resolve(process.cwd(), filePath), 'utf8');

const EXPECTED_WING_PATH =
  'M137 172L264.5 172L413 342.5L289.5 342.5Z M372 480.5L501.5 480.5L654.5 650.5L525.5 650.5Z M456.5 390L555 390C625 314 700 232 766 161C769.5 157.5 767 155.5 761 158.5C718 184.5 672 202 610 202L512 201.5C484 201.5 466 224 459 250C456.5 260 460 265 470 264.5L526 263C552 263 559 279 544 296L456.5 390Z M335 450L236.5 450C166.5 526 91.5 608 25.5 679C22 682.5 24.5 684.5 30.5 681.5C73.5 655.5 119.5 638 181.5 638L279.5 638.5C307.5 638.5 325.5 616 332.5 590C335 580 331.5 575 321.5 575.5L265.5 577C239.5 577 232.5 561 247.5 544L335 450Z';

const EXPECTED_FIVE_PATH =
  'M355 367L432.5 367L425 388.5L374.5 388.5L374.5 397L410 397C429 397 438.5 408 438.5 428.5C438.5 449.5 428 460.5 409 460.5L382 460.5C364.5 460.5 355 449 355 432L374.5 432C374.5 437.5 378.5 439.5 385 439.5L408 439.5C416 439.5 419.5 435.5 419.5 428.5C419.5 421.5 416 418 408 418L355 418L355 367Z';

function loadSplashModule(options?: {
  colorScheme?: 'dark' | 'light' | null;
  width?: number;
  height?: number;
  reduceMotion?: boolean;
}) {
  const colorScheme = options?.colorScheme ?? 'dark';
  const width = options?.width ?? 390;
  const height = options?.height ?? 844;
  let reduceMotionState = options?.reduceMotion ?? false;
  const timingCalls: Array<Record<string, unknown>> = [];
  let loopStarts = 0;
  let loopStops = 0;
  let pulseValue = 0;

  const react = {
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [
      reduceMotionState ?? initial,
      (next: boolean) => {
        reduceMotionState = next;
      },
    ],
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({
      type,
      props: { ...(props ?? {}), children },
    }),
  };

  class MockAnimatedValue {
    value: number;
    interpolations: Array<{ inputRange: number[]; outputRange: number[] }> = [];
    constructor(initial: number) {
      this.value = initial;
      pulseValue = initial;
    }
    setValue(next: number) {
      this.value = next;
      pulseValue = next;
    }
    stopAnimation() {}
    interpolate(config: { inputRange: number[]; outputRange: number[] }) {
      this.interpolations.push(config);
      return config;
    }
  }

  const exports: Record<string, any> = {};
  const moduleObj = { exports };
  const transpiled = ts.transpileModule(readSource('src/components/X5StartupSplash.tsx'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  runInNewContext(transpiled, {
    exports,
    module: moduleObj,
    require: (name: string) => {
      if (name === 'react') {
        return {
          ...react,
          default: react,
        };
      }
      if (name === 'react-native') {
        return {
          AccessibilityInfo: {
            isReduceMotionEnabled: () => Promise.resolve(reduceMotionState),
            addEventListener: () => ({ remove() {} }),
          },
          Animated: {
            Value: MockAnimatedValue,
            View: 'Animated.View',
            timing: (_val: unknown, config: Record<string, unknown>) => {
              timingCalls.push(config);
              return { type: 'timing', config };
            },
            sequence: (steps: unknown[]) => ({ type: 'sequence', steps }),
            loop: (animation: unknown) => ({
              type: 'loop',
              animation,
              start() {
                loopStarts += 1;
              },
              stop() {
                loopStops += 1;
              },
            }),
          },
          Easing: {
            ease: 'ease',
            inOut: (fn: unknown) => `inOut(${String(fn)})`,
          },
          StatusBar: 'StatusBar',
          StyleSheet: {
            create: <T,>(styles: T): T => styles,
          },
          useColorScheme: () => colorScheme,
          useWindowDimensions: () => ({ width, height }),
          View: 'View',
        };
      }
      if (name === 'react-native-svg') {
        return {
          default: 'Svg',
          Svg: 'Svg',
          Path: 'Path',
        };
      }
      throw new Error(`Unexpected module required in X5StartupSplash: ${name}`);
    },
  });

  return {
    exports: moduleObj.exports,
    timingCalls,
    get loopStarts() {
      return loopStarts;
    },
    get loopStops() {
      return loopStops;
    },
    get pulseValue() {
      return pulseValue;
    },
  };
}

test('X5StartupSplash renders exact SVG geometry and dark/light theme palettes', () => {
  const splashModule = loadSplashModule({
    colorScheme: 'dark',
    width: 400,
    height: 800,
  });
  const { exports, timingCalls } = splashModule;

  assert.equal(exports.X5_STARTUP_SPLASH_VIEW_BOX, '15 145 760 545');
  assert.equal(exports.WING_PATH, EXPECTED_WING_PATH);
  assert.equal(exports.FIVE_PATH, EXPECTED_FIVE_PATH);

  const darkTree = JSON.parse(JSON.stringify(exports.X5StartupSplash({ theme: 'dark' })));
  assert.equal(darkTree.type, 'View');
  assert.equal(darkTree.props.accessibilityRole, 'progressbar');
  assert.equal(darkTree.props.accessibilityLabel, 'Loading application');
  assert.deepEqual(darkTree.props.style[1], { backgroundColor: '#0a0c10' });

  const [darkStatusBar, darkAnimatedView] = darkTree.props.children;
  assert.equal(darkStatusBar.props.barStyle, 'light-content');
  assert.equal(darkStatusBar.props.backgroundColor, '#0a0c10');

  const darkWrapperStyle = darkAnimatedView.props.style[1];
  assert.equal(darkWrapperStyle.width, 192);
  assert.equal(darkWrapperStyle.height, 192 * (545 / 760));
  assert.equal(darkWrapperStyle.shadowColor, '#7cc623');
  assert.deepEqual(darkWrapperStyle.opacity, {
    inputRange: [0, 1],
    outputRange: [0.32, 1],
  });
  assert.deepEqual(darkWrapperStyle.transform, [
    {
      scale: {
        inputRange: [0, 1],
        outputRange: [0.94, 1.04],
      },
    },
  ]);

  const darkSvg = darkAnimatedView.props.children[0];
  assert.equal(darkSvg.props.viewBox, '15 145 760 545');
  const [darkWingPath, darkFivePath] = darkSvg.props.children;
  assert.equal(darkWingPath.props.d, EXPECTED_WING_PATH);
  assert.equal(darkWingPath.props.fill, '#e2e8f0');
  assert.equal(darkFivePath.props.d, EXPECTED_FIVE_PATH);
  assert.equal(darkFivePath.props.fill, '#7cc623');

  // Verify 1400ms (700ms + 700ms) native-driver pulse loop
  assert.ok(splashModule.loopStarts >= 1);
  assert.equal(timingCalls.length >= 2, true);
  assert.deepEqual(JSON.parse(JSON.stringify(timingCalls[0])), {
    toValue: 1,
    duration: 700,
    easing: 'inOut(ease)',
    useNativeDriver: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(timingCalls[1])), {
    toValue: 0,
    duration: 700,
    easing: 'inOut(ease)',
    useNativeDriver: true,
  });

  // Verify light theme palette
  const lightTree = JSON.parse(JSON.stringify(exports.X5StartupSplash({ theme: 'light' })));
  assert.deepEqual(lightTree.props.style[1], { backgroundColor: '#f0f2f5' });
  const [lightStatusBar, lightAnimatedView] = lightTree.props.children;
  assert.equal(lightStatusBar.props.barStyle, 'dark-content');
  assert.equal(lightStatusBar.props.backgroundColor, '#f0f2f5');
  assert.equal(lightAnimatedView.props.style[1].shadowColor, '#4d9e14');
  const lightSvg = lightAnimatedView.props.children[0];
  const [lightWingPath, lightFivePath] = lightSvg.props.children;
  assert.equal(lightWingPath.props.fill, '#334155');
  assert.equal(lightFivePath.props.fill, '#4d9e14');
});

test('X5StartupSplash respects reduceMotion and clamps responsive icon dimensions', () => {
  const reduced = loadSplashModule({
    colorScheme: 'dark',
    width: 320,
    height: 568,
    reduceMotion: true,
  });

  const tree = JSON.parse(JSON.stringify(reduced.exports.X5StartupSplash({})));
  const [, animatedView] = tree.props.children;
  const wrapperStyle = animatedView.props.style[1];

  assert.equal(reduced.loopStarts, 0);
  assert.equal(reduced.pulseValue, 1);
  assert.equal(wrapperStyle.opacity, 1);
  assert.deepEqual(wrapperStyle.transform, [{ scale: 1 }]);

  // Responsive sizing clamp [160, 240] with 760:545 aspect ratio
  const small = reduced.exports.resolveX5StartupSplashDimensions(280, 600);
  assert.equal(small.iconWidth, 160);
  assert.equal(small.iconHeight, 160 * (545 / 760));

  const medium = reduced.exports.resolveX5StartupSplashDimensions(390, 844);
  assert.equal(medium.iconWidth, 390 * 0.48);
  assert.equal(medium.iconHeight, 390 * 0.48 * (545 / 760));

  const tablet = reduced.exports.resolveX5StartupSplashDimensions(768, 1024);
  assert.equal(tablet.iconWidth, 240);
  assert.equal(tablet.iconHeight, 240 * (545 / 760));
});

test('RootLayout wires X5StartupSplash into StartupLogoScreen with #0a0c10 native splash handoff', () => {
  const rootLayoutSource = readSource('app/_layout.tsx');
  const appConfigSource = readSource('app.json');

  assert.match(rootLayoutSource, /from '\.\.\/src\/components\/X5StartupSplash'/);
  assert.match(
    rootLayoutSource,
    /function StartupLogoScreen\(\) \{[\s\S]*const themeMode = useThemeMode\(\);[\s\S]*SplashScreen\.hideAsync\(\)[\s\S]*<X5StartupSplash[\s\S]*theme=\{themeMode\}/,
  );
  assert.match(
    rootLayoutSource,
    /\{hasHydrated && sessionRestoreComplete && fontsReady \? <InnerLayout \/> : <StartupLogoScreen \/>\}/,
  );
  assert.match(
    appConfigSource,
    /"expo-splash-screen"[\s\S]*?"backgroundColor":\s*"#0a0c10"/,
  );
});
