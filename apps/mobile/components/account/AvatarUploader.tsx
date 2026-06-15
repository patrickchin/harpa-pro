/**
 * `AvatarUploader` — picks an avatar image, ships it through the
 * R2 upload pipeline (P3.15.1), and renders it as a circular tappable
 * via `CachedImage`.
 *
 * Pipeline:
 *
 *   pick → manipulate (resize 512²) → useFileUpload.enqueue → AsyncStorage
 *
 * The enqueue is an out-of-report upload (no `reportId`) — the queue
 * stops after `registerFile` and returns the server file row. We
 * persist `file.id` to AsyncStorage so the avatar survives app
 * restarts, and `useFileSignedUrl(fileId)` (cached, auto-refreshed at
 * 4 min) renders it.
 *
 * NOTE (P4): once the API ships a route to persist `avatarFileId` on
 * the user row (e.g. `PATCH /me` accepting `avatarFileId`, or a
 * dedicated `PUT /me/avatar`), call it from here on successful upload
 * and read the id from the session user instead of AsyncStorage.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File as FsFile } from 'expo-file-system';
import { User } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { useFileUpload, useFileSignedUrl } from '@/lib/uploads';
import { colors } from '@/lib/design-tokens/colors';

const AVATAR_STORAGE_KEY = 'harpa.avatarFileId.v1';

export interface AvatarUploaderProps {
  /** Pixel size of the round avatar. Defaults to 96. */
  size?: number;
  /** Optional initial fileId — passed when the session user gains an
   *  `avatarFileId` field (P4). Until then, the component
   *  round-trips through AsyncStorage. */
  initialFileId?: string | null;
  /** Notifies the parent on a successful upload so the route can
   *  PATCH /me once the contract lands (P4). Receives the server file id. */
  onUploaded?: (fileId: string) => void;
}

function statSize(uri: string): number {
  try {
    const size = new FsFile(uri).size;
    if (typeof size === 'number' && size > 0) {
      return size;
    }
  } catch {
    // ignore
  }
  // Fallback — 512×512 JPEG at 0.85 quality typically lands ~70 KB.
  return 80_000;
}

export function AvatarUploader({
  size = 96,
  initialFileId = null,
  onUploaded,
}: AvatarUploaderProps) {
  const [fileId, setFileId] = useState<string | null>(initialFileId);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { enqueue } = useFileUpload();

  // Hydrate persisted avatarFileId on mount when no initial id is supplied.
  useEffect(() => {
    if (initialFileId) return;
    let cancelled = false;
    void AsyncStorage.getItem(AVATAR_STORAGE_KEY).then((stored) => {
      if (!cancelled && stored) setFileId(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [initialFileId]);

  const signedUrl = useFileSignedUrl(fileId);

  const handlePick = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photos access is off. Open Settings to allow.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as never,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    setIsUploading(true);
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      const sizeBytes = statSize(compressed.uri);

      const result = await enqueue({
        sourceUri: compressed.uri,
        kind: 'image',
        filename: 'avatar.jpg',
        contentType: 'image/jpeg',
        sizeBytes,
        // No reportId — out-of-report upload (registerFile, no note).
        // `uploadScope: 'avatar'` routes the key to
        // `users/<userId>/avatar/<fileId>.jpg` and the API forces
        // `kind: 'image'` server-side.
        uploadScope: 'avatar',
      });

      const newId = result.file.id;
      setFileId(newId);
      await AsyncStorage.setItem(AVATAR_STORAGE_KEY, newId);
      onUploaded?.(newId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload avatar.");
    } finally {
      setIsUploading(false);
    }
  };

  const url = signedUrl.data?.url ?? null;

  return (
    <View className="items-center gap-2" testID="avatar-uploader">
      <Pressable
        testID="btn-avatar-upload"
        onPress={() => {
          void handlePick();
        }}
        disabled={isUploading}
        accessibilityRole="button"
        accessibilityLabel="Change profile picture"
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="items-center justify-center overflow-hidden border border-border bg-card"
      >
        {isUploading ? (
          <ActivityIndicator size="small" color={colors.foreground} />
        ) : url ? (
          <CachedImage
            testID="avatar-image"
            source={{ uri: url }}
            cacheKey={fileId ?? undefined}
            style={{ width: size, height: size }}
            accessibilityLabel="Profile picture"
          />
        ) : (
          <User size={Math.round(size * 0.42)} color={colors.muted.foreground} />
        )}
      </Pressable>
      <Text className="text-xs text-muted-foreground">
        {isUploading ? 'Uploading…' : 'Tap to change'}
      </Text>
      {error ? (
        <Text testID="avatar-error" className="text-xs text-danger-text">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
