/**
 * Dev gallery mirror for onboarding.
 *
 * Inline mock props with local state so typing works. Submit toggles
 * isPending for ~600ms to visualize loading state.
 */
import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import Onboarding from '@/screens/onboarding';

export default function OnboardingDevPage() {
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = () => {
    const trimmedName = fullName.trim();
    const trimmedCompany = companyName.trim();

    if (trimmedName.length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (trimmedCompany.length < 2) {
      setError('Please enter your company name.');
      return;
    }

    setError(null);
    setIsPending(true);

    setTimeout(() => {
      setIsPending(false);
      console.log('Mock submit:', { fullName, companyName });
    }, 600);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView>
        <View className="p-4">
          <Text className="mb-4 text-lg font-bold text-foreground">
            onboarding — Empty state
          </Text>
          <Onboarding
            fullName={fullName}
            companyName={companyName}
            onChangeFullName={setFullName}
            onChangeCompanyName={setCompanyName}
            error={error}
            isPending={isPending}
            onSubmit={handleSubmit}
          />
        </View>

        <View className="p-4 border-t border-border">
          <Text className="mb-4 text-lg font-bold text-foreground">
            onboarding — Prefilled
          </Text>
          <Onboarding
            fullName="John Smith"
            companyName="Smith Construction LLC"
            onChangeFullName={console.log}
            onChangeCompanyName={console.log}
            error={null}
            isPending={false}
            onSubmit={() => console.log('onSubmit')}
          />
        </View>

        <View className="p-4 border-t border-border">
          <Text className="mb-4 text-lg font-bold text-foreground">
            onboarding — Error state
          </Text>
          <Onboarding
            fullName="J"
            companyName=""
            onChangeFullName={console.log}
            onChangeCompanyName={console.log}
            error="Please enter your full name."
            isPending={false}
            onSubmit={() => console.log('onSubmit')}
          />
        </View>

        <View className="p-4 border-t border-border">
          <Text className="mb-4 text-lg font-bold text-foreground">
            onboarding — Pending state
          </Text>
          <Onboarding
            fullName="John Smith"
            companyName="Smith Construction LLC"
            onChangeFullName={console.log}
            onChangeCompanyName={console.log}
            error={null}
            isPending={true}
            onSubmit={() => console.log('onSubmit')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
