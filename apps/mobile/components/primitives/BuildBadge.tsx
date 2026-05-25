/**
 * BuildBadge — discreet one-line footer on the auth screens.
 *
 * Renders `v{version}+{sha} · api v{version}+{sha} · {api}` so a
 * single glance tells you which frontend bundle and which backend
 * commit are talking, plus which environment (local / dev / prod /
 * other) the API URL classifies to. The `+sha` suffix follows the
 * SemVer 2.0.0 build metadata convention.
 *
 * SHA sources:
 *  - Frontend: `app.config.ts` runs `git rev-parse --short HEAD` at
 *    Expo CLI start (dev) or EAS-build time.
 *  - Backend: injected at Docker build time via the `GIT_COMMIT`
 *    build-arg (see `infra/fly/Dockerfile`) and returned by
 *    `/healthz`. Renders `?` while the fetch is in flight or if the
 *    request fails (badge stays best-effort, never blocks UI).
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { buildInfo, classifyApiTarget } from '@/lib/build-info';
import { getApiBaseUrl } from '@/lib/api/base-url';
import { useBackendVersion } from '@/lib/api/backend-version';

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

  const backend = useBackendVersion(apiUrl);
  const target = apiUrl ? classifyApiTarget(apiUrl) : null;
  const frontLabel = `v${buildInfo.version}+${buildInfo.gitCommit}`;
  const backLabel = backend
    ? `api v${backend.version}+${backend.gitCommit}`
    : apiUrl
    ? 'api v?'
    : 'api …';
  const apiLabel = target ? target.label : '…';

  const handleLongPress = async () => {
    const payload = backend
      ? `front ${buildInfo.gitCommit} · back ${backend.gitCommit}`
      : buildInfo.gitCommit;
    await Clipboard.setStringAsync(payload);
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
        accessibilityLabel={`Build ${frontLabel}. ${backLabel}. Long press to copy commits.`}
        testID={`${testID}-version`}
      >
        <Text
          className="text-[10px] text-muted-foreground"
          numberOfLines={1}
        >
          {copied
            ? `copied ${buildInfo.gitCommit}${backend ? ` / ${backend.gitCommit}` : ''}`
            : `${frontLabel} · ${backLabel} · ${apiLabel}`}
        </Text>
      </Pressable>
    </View>
  );
}
