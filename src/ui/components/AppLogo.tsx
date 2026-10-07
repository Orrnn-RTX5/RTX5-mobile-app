import { Image, type ImageProps } from 'react-native';

export const APP_LOGO_SOURCE = require('../../../assets/adaptive-icon.png');

type AppLogoProps = Omit<ImageProps, 'source'>;

export function AppLogo({
  accessibilityLabel = 'RTX5 logo',
  resizeMode = 'cover',
  ...props
}: AppLogoProps) {
  return (
    <Image
      {...props}
      accessibilityLabel={accessibilityLabel}
      resizeMode={resizeMode}
      source={APP_LOGO_SOURCE}
    />
  );
}
