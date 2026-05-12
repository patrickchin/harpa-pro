/**
 * Dev-gallery showcase for the `Button` primitive. Mounts every
 * variant × size combo with canned props for visual review against
 * `../haru3-reports/apps/mobile@dev`.
 */
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../../components/primitives/Button';

const VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'ghost', 'quiet', 'hero'] as const;
const SIZES = ['default', 'sm', 'lg', 'xl'] as const;

export default function ButtonShowcase() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-6 pb-24 gap-6"
    >
      <Text className="text-title-sm text-foreground">Button — variants</Text>
      <View className="gap-3">
        {VARIANTS.map((variant) => (
          <Button key={variant} variant={variant} onPress={() => {}}>
            {variant}
          </Button>
        ))}
      </View>

      <Text className="text-title-sm text-foreground">Button — sizes</Text>
      <View className="gap-3">
        {SIZES.map((size) => (
          <Button key={size} size={size} onPress={() => {}}>
            {size}
          </Button>
        ))}
      </View>

      <Text className="text-title-sm text-foreground">Button — states</Text>
      <View className="gap-3">
        <Button onPress={() => {}} loading>
          Submitting…
        </Button>
        <Button onPress={() => {}} disabled>
          Disabled
        </Button>
      </View>
    </ScrollView>
  );
}
