import { ScrollView, Text, View } from 'react-native';

import { InlineNotice } from '../../../components/primitives/InlineNotice';

export default function InlineNoticeShowcase() {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pt-6 pb-24 gap-4">
      <View>
        <Text className="mb-3 text-label text-muted-foreground">info</Text>
        <InlineNotice tone="info" title="Heads up">
          We refreshed your session.
        </InlineNotice>
      </View>
      <View>
        <Text className="mb-3 text-label text-muted-foreground">success</Text>
        <InlineNotice tone="success" title="Saved">
          Your changes have been saved.
        </InlineNotice>
      </View>
      <View>
        <Text className="mb-3 text-label text-muted-foreground">warning</Text>
        <InlineNotice tone="warning" title="Confirm finalization">
          Once finalized, you cannot regenerate.
        </InlineNotice>
      </View>
      <View>
        <Text className="mb-3 text-label text-muted-foreground">danger</Text>
        <InlineNotice tone="danger" title="Permanent action">
          This cannot be undone.
        </InlineNotice>
      </View>
    </ScrollView>
  );
}
