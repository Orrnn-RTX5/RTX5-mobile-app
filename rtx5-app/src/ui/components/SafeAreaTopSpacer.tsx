import { View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeAreaTopSpacerProps = {
  minHeight?: number;
  style?: ViewStyle;
};

export function SafeAreaTopSpacer({ minHeight = 0, style }: SafeAreaTopSpacerProps) {
  const insets = useSafeAreaInsets();

  return <View style={[{ height: Math.max(insets.top, minHeight) }, style]} />;
}
