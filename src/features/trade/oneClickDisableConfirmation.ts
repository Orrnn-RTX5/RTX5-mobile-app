export const ONE_CLICK_DISABLE_TITLE = 'Disable One-Click Trading?';
export const ONE_CLICK_DISABLE_MESSAGE =
  'One-Click Trading places trades faster with fewer taps. Are you sure you want to disable it?';

type Translate = (value: string) => string;

export type OneClickDisableAlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type ShowAlert = (
  title: string,
  message: string,
  buttons: OneClickDisableAlertButton[],
) => void;

type RequestOneClickPreferenceChangeOptions = {
  nextEnabled: boolean;
  translate: Translate;
  commit: (enabled: boolean) => void;
  showAlert: ShowAlert;
};

/** Keeps the controlled switch enabled until the user confirms disabling it. */
export function requestOneClickPreferenceChange({
  nextEnabled,
  translate,
  commit,
  showAlert,
}: RequestOneClickPreferenceChangeOptions): void {
  if (nextEnabled) {
    commit(true);
    return;
  }

  showAlert(
    translate(ONE_CLICK_DISABLE_TITLE),
    translate(ONE_CLICK_DISABLE_MESSAGE),
    [
      { text: translate('Cancel'), style: 'cancel' },
      { text: translate('OK'), onPress: () => commit(false) },
    ],
  );
}
