import { Stack } from 'expo-router';
import { DeveloperContactRequestScreen } from '../../src/features/settings/AboutScreen';

export default function AccountDeletionRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeveloperContactRequestScreen mode="account-deletion" />
    </>
  );
}
