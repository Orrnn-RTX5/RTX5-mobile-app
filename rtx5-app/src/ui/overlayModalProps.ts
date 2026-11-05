import type { ModalProps } from 'react-native';

export const OVERLAY_MODAL_PROPS: Pick<
  ModalProps,
  'hardwareAccelerated' | 'navigationBarTranslucent' | 'presentationStyle' | 'statusBarTranslucent'
> = {
  hardwareAccelerated: true,
  navigationBarTranslucent: true,
  presentationStyle: 'overFullScreen',
  statusBarTranslucent: true,
};
