import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Input } from '../../../components/primitives/Input';

export default function InputShowcase() {
  const [text, setText] = useState('');
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-6 pb-24 gap-6"
    >
      <Text className="text-title-sm text-foreground">Input — states</Text>
      <View className="gap-4">
        <Input label="Email" placeholder="you@example.com" hint="We never spam" value={text} onChangeText={setText} />
        <Input label="Phone" placeholder="+1 555 000 0000" />
        <Input label="Site URL" error="Invalid URL" value="https://" />
        <Input label="Account ID" editable={false} value="acct_8f3a" />
        <Input placeholder="Bare (no label / no hint)" />
      </View>
    </ScrollView>
  );
}
