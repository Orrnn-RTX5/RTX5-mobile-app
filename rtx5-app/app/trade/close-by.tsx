import { Stack } from 'expo-router';
import { CloseByScreen } from '../../src/features/trade/CloseByScreen';

export default function CloseByRoute() {
  return (
    <>
      <Stack.Screen options={{ headerTitleAlign: 'center' }} />
      <CloseByScreen />
    </>
  );
}
