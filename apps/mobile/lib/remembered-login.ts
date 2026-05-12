import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCanonicalPhoneNumber } from './phone';

export const REMEMBERED_PHONE_STORAGE_KEY = 'remembered_login_phone';

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export async function getRememberedPhoneNumber(
  storage: StorageLike = AsyncStorage
): Promise<string | null> {
  const value = await storage.getItem(REMEMBERED_PHONE_STORAGE_KEY);
  return value ? getCanonicalPhoneNumber(value) : null;
}

export async function rememberPhoneNumber(
  phoneNumber: string,
  storage: StorageLike = AsyncStorage
): Promise<string | null> {
  const trimmedPhoneNumber = phoneNumber.trim();

  if (trimmedPhoneNumber.length === 0) {
    await storage.removeItem(REMEMBERED_PHONE_STORAGE_KEY);
    return null;
  }

  const normalizedValue = getCanonicalPhoneNumber(trimmedPhoneNumber);

  if (!normalizedValue) {
    throw new Error('Cannot remember an invalid phone number.');
  }

  await storage.setItem(REMEMBERED_PHONE_STORAGE_KEY, normalizedValue);
  return normalizedValue;
}

export async function clearRememberedPhoneNumber(
  storage: StorageLike = AsyncStorage
) {
  await storage.removeItem(REMEMBERED_PHONE_STORAGE_KEY);
}
