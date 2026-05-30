/**
 * Persistence for the camera screen's "Save to camera roll" toggle.
 *
 * Stored in AsyncStorage under a stable key so the preference survives
 * app restarts. Defaults to off — capturing site photos for a report
 * doesn't imply the user wants every shot in their personal library.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SAVE_TO_ROLL_KEY = 'harpa.camera.saveToCameraRoll';

export async function readSaveToRollPref(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_TO_ROLL_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function writeSaveToRollPref(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVE_TO_ROLL_KEY, value ? '1' : '0');
  } catch {
    // best-effort — the toggle still flips in-memory if storage is full
  }
}
