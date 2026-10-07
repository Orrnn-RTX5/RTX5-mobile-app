import { Stack } from 'expo-router';
import { DeveloperContactRequestScreen } from '../../src/features/settings/AboutScreen';

export default function ContactDeveloperRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DeveloperContactRequestScreen mode="contact-developer" />
    </>
  );
}
