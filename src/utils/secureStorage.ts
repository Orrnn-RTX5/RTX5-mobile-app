import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Platform-aware Secure Storage Wrapper.
 * 
 * Uses Expo SecureStore (Keychain/Keystore) natively to meet security controls.
 * Web deliberately has no fallback: writing credentials to AsyncStorage would
 * silently downgrade protected secrets to plaintext application storage.
 */

const IOS_SECURE_STORE_WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const assertNativeSecureStorage = (): void => {
  if (Platform.OS === 'web') {
    throw new Error('Secure credential storage is unavailable on web.');
  }
};

export const setSecureItemAsync = async (key: string, value: string): Promise<void> => {
  assertNativeSecureStorage();
  await SecureStore.setItemAsync(
    key,
    value,
    Platform.OS === 'ios' ? IOS_SECURE_STORE_WRITE_OPTIONS : undefined,
  );
};

export const getSecureItemAsync = async (key: string): Promise<string | null> => {
  try {
    assertNativeSecureStorage();
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    // Web has no secure store by design (expected); a native read failure is not.
    if (Platform.OS !== 'web') {
      console.error('[SecureStorage] Failed to read secure item', { key, error });
    }
    return null;
  }
};

export const removeSecureItemAsync = async (key: string): Promise<void> => {
  assertNativeSecureStorage();
  await SecureStore.deleteItemAsync(key);
};
