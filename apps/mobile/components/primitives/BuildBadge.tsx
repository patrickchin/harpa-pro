/**
 * BuildBadge — discreet one-line footer on the auth screens.
 *
 * Renders `v{version}+{sha} · {api}` where `api` is a short label
 * (local / dev / prod / other) derived from the API base URL, so a
 * glance tells you which backend the app is hitting without exposing
 * the full host. The `+sha` suffix follows the SemVer 2.0.0 build
 * metadata convention.
 *
 * SHA source: `app.config.ts` runs `git rev-parse --short HEAD` at
 * Expo CLI start. In dev that's HEAD when Metro started; on EAS
 * builds it's the SHA at EAS-build time.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { buildInfo, classifyApiTarget } from '@/lib/build-info';
import { getApiBaseUrl } from '@/lib/api/base-url';

export function BuildBadge({ testID = 'build-badge' }: { testID?: string }) {
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getApiBaseUrl().then((url) => {
      if (!cancelled) setApiUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const target = apiUrl ? classifyApiTarget(apiUrl) : null;
  const versionLabel = `v${buildInfo.version}+${buildInfo.gitCommit}`;
  const apiLabel = target ? target.label : '…';

  const handleLongPress = async () => {
    await Clipboard.setStringAsync(buildInfo.gitCommit);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View
      testID={testID}
      accessibilityLabel="Build info"
      className="mt-6 items-center"
    >
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`Build ${versionLabel}. Long press to copy commit ${buildInfo.gitCommit}.`}
        testID={`${testID}-version`}
      >
        <Text
          className="text-[10px] text-muted-foreground"
          numberOfLines={1}
        >
          {copied ? `copied ${buildInfo.gitCommit}` : `${versionLabel} ${apiLabel}`}
        </Text>
      </Pressable>
    </View>
  );
}
