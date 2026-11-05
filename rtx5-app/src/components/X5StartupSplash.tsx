import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StatusBar,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
  type ViewProps,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

export interface X5StartupSplashProps {
  /** Override theme ('dark' | 'light'); defaults to system/app color scheme */
  theme?: 'dark' | 'light';
  /** Optional callback fired as soon as the splash container lays out on screen */
  onLayout?: ViewProps['onLayout'];
}

export const X5_STARTUP_SPLASH_VIEW_BOX = '15 145 760 545';

export const WING_PATH =
  'M137 172L264.5 172L413 342.5L289.5 342.5Z M372 480.5L501.5 480.5L654.5 650.5L525.5 650.5Z M456.5 390L555 390C625 314 700 232 766 161C769.5 157.5 767 155.5 761 158.5C718 184.5 672 202 610 202L512 201.5C484 201.5 466 224 459 250C456.5 260 460 265 470 264.5L526 263C552 263 559 279 544 296L456.5 390Z M335 450L236.5 450C166.5 526 91.5 608 25.5 679C22 682.5 24.5 684.5 30.5 681.5C73.5 655.5 119.5 638 181.5 638L279.5 638.5C307.5 638.5 325.5 616 332.5 590C335 580 331.5 575 321.5 575.5L265.5 577C239.5 577 232.5 561 247.5 544L335 450Z';

export const FIVE_PATH =
  'M355 367L432.5 367L425 388.5L374.5 388.5L374.5 397L410 397C429 397 438.5 408 438.5 428.5C438.5 449.5 428 460.5 409 460.5L382 460.5C364.5 460.5 355 449 355 432L374.5 432C374.5 437.5 378.5 439.5 385 439.5L408 439.5C416 439.5 419.5 435.5 419.5 428.5C419.5 421.5 416 418 408 418L355 418L355 367Z';

export const X5_STARTUP_SPLASH_THEMES = {
  dark: {
    backgroundColor: '#0a0c10',
    wingFill: '#e2e8f0',
    fiveFill: '#7cc623',
    glowColor: '#7cc623',
  },
  light: {
    backgroundColor: '#f0f2f5',
    wingFill: '#334155',
    fiveFill: '#4d9e14',
    glowColor: '#4d9e14',
  },
} as const;

export const X5_STARTUP_SPLASH_PULSE_HALF_DURATION_MS = 700;
export const X5_STARTUP_SPLASH_PULSE_CYCLE_DURATION_MS = 1400;

/**
 * Calculates responsive dimensions for the centered X5 startup emblem:
 * - Width is 48% of the shorter screen dimension, clamped between 160px and 240px.
 * - Height preserves the exact 760:545 SVG viewBox aspect ratio.
 */
export function resolveX5StartupSplashDimensions(
  screenWidth: number,
  screenHeight?: number,
): { iconWidth: number; iconHeight: number } {
  const safeWidth = Number.isFinite(screenWidth) && screenWidth > 0 ? screenWidth : 0;
  const safeHeight =
    typeof screenHeight === 'number' && Number.isFinite(screenHeight) && screenHeight > 0
      ? screenHeight
      : safeWidth;
  const minDimension = safeHeight > 0 ? Math.min(safeWidth, safeHeight) : safeWidth;
  const iconWidth = Math.min(Math.max(minDimension * 0.48, 160), 240);
  const iconHeight = iconWidth * (545 / 760);
  return { iconWidth, iconHeight };
}

/**
 * Full-screen animated X5 startup splash screen matching the Web Terminal
 * (`index.html` and `TerminalLoadFallback.tsx`).
 *
 * - Supports Dark (`#0a0c10` bg, `#e2e8f0` wings, `#7cc623` "5" + glow) and
 *   Light (`#f0f2f5` bg, `#334155` wings, `#4d9e14` "5" + glow) themes.
 * - Runs a 1400ms (700ms in + 700ms out) native-driver pulse loop between
 *   `opacity: 0.32, scale: 0.94` and `opacity: 1.0, scale: 1.04`.
 * - Respects system Reduce Motion (`opacity: 1, scale: 1` with no looping).
 */
export const X5StartupSplash: React.FC<X5StartupSplashProps> = ({ theme, onLayout }) => {
  const systemScheme = useColorScheme();
  const resolvedTheme = theme ?? (systemScheme === 'light' ? 'light' : 'dark');
  const isLight = resolvedTheme === 'light';

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { iconWidth, iconHeight } = resolveX5StartupSplashDimensions(
    screenWidth,
    screenHeight,
  );

  // 0 -> 0% / 100% keyframe, 1 -> 50% peak keyframe
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduceMotion(Boolean(enabled)),
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }

    pulse.setValue(0);
    // Run a single 1.4s splash pulse (iterations: 1) so the X5 logo splashes
    // only once on startup before transitioning to the application.
    // 0% -> 50% (700ms) and 50% -> 100% (700ms)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: X5_STARTUP_SPLASH_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: X5_STARTUP_SPLASH_PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      { iterations: 1 },
    );

    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  // 0%, 100%: opacity 0.32 | 50%: opacity 1
  const animatedOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.32, 1],
  });

  // 0%, 100%: scale(0.94) | 50%: scale(1.04)
  const animatedScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.04],
  });

  const opacity = reduceMotion ? 1 : animatedOpacity;
  const scale = reduceMotion ? 1 : animatedScale;

  const palette = isLight ? X5_STARTUP_SPLASH_THEMES.light : X5_STARTUP_SPLASH_THEMES.dark;
  const { backgroundColor, wingFill, fiveFill } = palette;

  return (
    <View
      style={[styles.container, { backgroundColor }]}
      onLayout={onLayout}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading application"
    >
      <StatusBar
        barStyle={isLight ? 'dark-content' : 'light-content'}
        {...({ backgroundColor } as Record<string, unknown>)}
      />
      <Animated.View
        style={[
          styles.iconWrapper,
          {
            width: iconWidth,
            height: iconHeight,
            opacity,
            transform: [{ scale }],
            shadowColor: fiveFill,
          },
        ]}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={X5_STARTUP_SPLASH_VIEW_BOX}
          fill="none"
        >
          <Path d={WING_PATH} fill={wingFill} />
          <Path d={FIVE_PATH} fill={fiveFill} />
        </Svg>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconWrapper: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.36,
    shadowRadius: 18,
  },
});

export default X5StartupSplash;
