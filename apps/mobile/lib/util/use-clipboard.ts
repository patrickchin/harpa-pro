/**
 * useCopyToClipboard — cross-platform copy with transient confirmation
 * state. Ported from
 * `../haru3-reports/apps/mobile/hooks/useCopyToClipboard.ts`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ToastAndroid } from 'react-native';
import * as Clipboard from 'expo-clipboard';

const RESET_MS = 1500;

export function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    async (
      value: string | null | undefined,
      options?: { key?: string; toast?: string },
    ) => {
      if (!value) return false;
      try {
        await Clipboard.setStringAsync(value);
      } catch {
        return false;
      }
      if (Platform.OS === 'android') {
        ToastAndroid.show(options?.toast ?? 'Copied', ToastAndroid.SHORT);
      }
      const key = options?.key ?? value;
      setCopiedKey(key);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedKey(null), RESET_MS);
      return true;
    },
    [],
  );

  const isCopied = useCallback((key: string) => copiedKey === key, [copiedKey]);

  return { copy, isCopied, copiedKey };
}
