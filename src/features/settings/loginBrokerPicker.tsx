import React, { memo, useSyncExternalStore, type ComponentProps } from 'react';
import { ActionSheet } from '../../ui/components/ActionSheet';
import type { LoginBrokerPickerStore } from './loginBrokerPickerStore';

export { createLoginBrokerPickerStore, type LoginBrokerPickerStore } from './loginBrokerPickerStore';

export function useLoginBrokerPickerOpen(store: LoginBrokerPickerStore): boolean {
  return useSyncExternalStore(store.subscribe, store.isOpen, store.isOpen);
}

type LoginBrokerPickerSheetProps = Omit<
  ComponentProps<typeof ActionSheet>,
  'visible' | 'onClose'
> & {
  store: LoginBrokerPickerStore;
};

export const LoginBrokerPickerSheet = memo(function LoginBrokerPickerSheet({
  store,
  ...sheetProps
}: LoginBrokerPickerSheetProps) {
  const open = useLoginBrokerPickerOpen(store);
  return (
    <ActionSheet
      {...sheetProps}
      instantOpen={sheetProps.instantOpen}
      detent={sheetProps.detent}
      visible={open}
      onClose={store.close}
    />
  );
});

type LoginBrokerPickerExpandedStateProps = {
  store: LoginBrokerPickerStore;
  children: (expanded: boolean) => React.ReactElement;
};

// Render-prop wrapper so the picker button can reflect `expanded` for
// accessibility without the parent screen subscribing to the flag.
export const LoginBrokerPickerExpandedState = memo(function LoginBrokerPickerExpandedState({
  store,
  children,
}: LoginBrokerPickerExpandedStateProps) {
  const expanded = useLoginBrokerPickerOpen(store);
  return children(expanded);
});
