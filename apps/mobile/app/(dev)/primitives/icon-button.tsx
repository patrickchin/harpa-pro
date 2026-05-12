/**
 * Dev-gallery showcase for the `IconButton` primitive.
 */
import { ScrollView, Text, View } from 'react-native';
import { Plus, X, Trash2, Camera, Mic } from 'lucide-react-native';

import { IconButton } from '../../../components/primitives/IconButton';
import { colors } from '../../../lib/design-tokens/colors';

export default function IconButtonShowcase() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-6 pb-24 gap-6"
    >
      <Text className="text-title-sm text-foreground">IconButton — variants</Text>
      <View className="flex-row gap-3">
        <IconButton variant="outline" accessibilityLabel="Add"><Plus size={18} color={colors.foreground} /></IconButton>
        <IconButton variant="ghost" accessibilityLabel="Close"><X size={18} color={colors.foreground} /></IconButton>
        <IconButton variant="muted" accessibilityLabel="Camera"><Camera size={18} color={colors.foreground} /></IconButton>
        <IconButton variant="primary" accessibilityLabel="Mic"><Mic size={18} color={colors.primary.foreground} /></IconButton>
        <IconButton variant="destructive" accessibilityLabel="Delete"><Trash2 size={18} color={colors.destructive.foreground} /></IconButton>
      </View>

      <Text className="text-title-sm text-foreground">IconButton — sizes (square)</Text>
      <View className="flex-row items-center gap-3">
        <IconButton size="xs" accessibilityLabel="xs"><X size={14} color={colors.foreground} /></IconButton>
        <IconButton size="sm" accessibilityLabel="sm"><X size={16} color={colors.foreground} /></IconButton>
        <IconButton size="default" accessibilityLabel="default"><X size={18} color={colors.foreground} /></IconButton>
      </View>

      <Text className="text-title-sm text-foreground">IconButton — sizes (circle)</Text>
      <View className="flex-row items-center gap-3">
        <IconButton size="xs" shape="circle" accessibilityLabel="xs-circle"><X size={14} color={colors.foreground} /></IconButton>
        <IconButton size="sm" shape="circle" accessibilityLabel="sm-circle"><X size={16} color={colors.foreground} /></IconButton>
        <IconButton size="default" shape="circle" accessibilityLabel="default-circle"><X size={18} color={colors.foreground} /></IconButton>
      </View>

      <Text className="text-title-sm text-foreground">Disabled</Text>
      <IconButton disabled accessibilityLabel="Disabled"><X size={18} color={colors.foreground} /></IconButton>
    </ScrollView>
  );
}
