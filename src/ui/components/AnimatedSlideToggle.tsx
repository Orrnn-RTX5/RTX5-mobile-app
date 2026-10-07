import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';

export type AnimatedSlideToggleProps = Readonly<{
  value: boolean;
  onTrackColor: string;
  offTrackColor: string;
  onThumbColor: string;
  offThumbColor: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 20;
const THUMB_INSET = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;
const TOGGLE_DURATION_MS = 160;

/**
 * Pill toggle whose thumb slides side to side on the native driver while the
 * track/thumb colours flip on the same frame as the press.
 *
 * The platform `Switch` was unusable here: on some OEM skins it renders as a
 * bare knob, and its dark off-track equalled the Settings card colour so the
 * control looked like a static circle. A JS-driven colour tween also janked
 * while the whole app re-themed on the JS thread, which read as a late
 * toggle; animating only `translateX` with `useNativeDriver: true` keeps the
 * slide smooth no matter how busy the JS thread is.
 */
export const AnimatedSlideToggle = React.memo(function AnimatedSlideToggle({
  value,
  onTrackColor,
  offTrackColor,
  onThumbColor,
  offThumbColor,
  style,
  testID,
}: AnimatedSlideToggleProps) {
  const slide = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(slide, {
      toValue: value ? 1 : 0,
      duration: TOGGLE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [slide, value]);

  const thumbTranslate = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, THUMB_TRAVEL],
  });

  return (
    <View
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={[
        {
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: value ? onTrackColor : offTrackColor,
          justifyContent: 'center',
          paddingHorizontal: THUMB_INSET,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: THUMB_SIZE / 2,
          backgroundColor: value ? onThumbColor : offThumbColor,
          elevation: 2,
          shadowColor: '#000000',
          shadowOpacity: 0.25,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          transform: [{ translateX: thumbTranslate }],
        }}
      />
    </View>
  );
});
