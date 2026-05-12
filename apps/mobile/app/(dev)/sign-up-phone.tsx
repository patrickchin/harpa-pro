/**
 * Dev mirror — sign-up-phone body with mock props.
 *
 * Demonstrates:
 *   - Empty phone input (default)
 *   - Error state
 *   - Submitting state (toggle via setTimeout, allowed in (dev) per Pitfall 5)
 */
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import SignUpPhone from '@/screens/sign-up-phone';
import { colors } from '@/lib/design-tokens/colors';

export default function SignUpPhoneDevPage() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (phone.trim().length === 0) {
      setError('Enter your phone number with country code, starting with +.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      alert('(Dev) Code sent!');
    }, 1500);
  };

  const handleBack = () => {
    alert('(Dev) Navigate back to sign-in');
  };

  const handleGoToSignIn = () => {
    alert('(Dev) Navigate to sign-in');
  };

  return (
    <View className="flex-1">
      <SignUpPhone
        phone={phone}
        onChangePhone={setPhone}
        onBack={handleBack}
        onGoToSignIn={handleGoToSignIn}
        error={error}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      />

      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-card p-4">
        <Text className="mb-2 text-sm font-semibold text-foreground">Dev controls</Text>
        <View className="flex-row gap-2">
          <Pressable
            className="flex-1 rounded-md border border-border bg-card px-3 py-2"
            onPress={() => setError(null)}
          >
            <Text className="text-center text-sm font-semibold text-foreground">Clear error</Text>
          </Pressable>
          <Pressable
            className="flex-1 rounded-md border border-border bg-card px-3 py-2"
            onPress={() =>
              setError('Enter your phone number with country code, starting with +.')
            }
          >
            <Text className="text-center text-sm font-semibold text-foreground">Show error</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
