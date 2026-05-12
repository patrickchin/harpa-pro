import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { AppDialogSheet } from '../../../components/primitives/AppDialogSheet';
import { Button } from '../../../components/primitives/Button';
import { getDeleteReportDialogCopy } from '../../../lib/app-dialog-copy';

export default function AppDialogSheetShowcase() {
  const [open, setOpen] = useState(false);
  const copy = getDeleteReportDialogCopy();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pt-6 pb-24 gap-8">
      <View>
        <Text className="mb-3 text-label text-muted-foreground">trigger</Text>
        <Button onPress={() => setOpen(true)}>Open delete-report dialog</Button>
      </View>

      <AppDialogSheet
        visible={open}
        title={copy.title}
        message={copy.message}
        noticeTone={copy.tone}
        noticeTitle={copy.noticeTitle}
        onClose={() => setOpen(false)}
        actions={[
          {
            label: copy.confirmLabel,
            onPress: () => setOpen(false),
            variant: copy.confirmVariant,
            testID: 'btn-confirm',
          },
          {
            label: copy.cancelLabel ?? 'Cancel',
            onPress: () => setOpen(false),
            variant: 'secondary',
            testID: 'btn-cancel',
          },
        ]}
      />
    </ScrollView>
  );
}
