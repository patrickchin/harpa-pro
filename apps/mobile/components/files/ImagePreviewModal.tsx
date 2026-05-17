/**
 * ImagePreviewModal — fullscreen modal for previewing an image.
 *
 * Adapted from
 * `../haru3-reports/apps/mobile/components/files/ImagePreviewModal.tsx`
 * on branch `dev`. The canonical version uses `expo-image` +
 * `CachedImage` to support BlurHash placeholders, intrinsic sizing,
 * and adjacent-photo prefetch. v4 hasn't ported the image-cache
 * pipeline yet, so this port renders the plain RN `Image` and
 * surfaces an ActivityIndicator while the URI is null.
 *
 * TODO(P4): port `CachedImage` + `prefetchImages` + the signed-URL
 * fetch hooks once `useFileSignedUrl` / image-cache land.
 */
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { colors } from '@/lib/design-tokens/colors';

interface ImagePreviewModalProps {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function ImagePreviewModal({
  visible,
  uri,
  title = 'Image',
  onClose,
}: ImagePreviewModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom']}>
          <View className="flex-row items-center justify-between px-4 py-2">
            <ScreenHeader title={title} />
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close image preview"
              testID="btn-close-image-preview"
              className="rounded-full bg-white/20 p-2"
            >
              <X size={22} color={colors.primary.foreground} />
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center px-4">
            {uri ? (
              <Image
                source={{ uri }}
                style={{ width: SCREEN_WIDTH - 32, height: SCREEN_HEIGHT * 0.7 }}
                resizeMode="contain"
                testID="image-preview"
                accessibilityLabel={title}
              />
            ) : (
              <ActivityIndicator
                size="large"
                color={colors.primary.foreground}
                testID="image-preview-loading"
              />
            )}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
