/**
 * Dev gallery mirror for sign-up-verify.
 *
 * Inline mock props illustrating all states (empty OTP, error mid-entry,
 * countdown active).
 */
import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import SignUpVerify from '@/screens/sign-up-verify';

export default function SignUpVerifyDevPage() {
  const [otp, setOtp] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView>
        <View className="p-4">
          <Text className="mb-4 text-lg font-bold text-foreground">
            sign-up-verify — Empty OTP
          </Text>
          <SignUpVerify
            phone="+15551234567"
            otp={otp}
            onChangeOtp={setOtp}
            onChangeNumber={() => console.log('onChangeNumber')}
            onResend={() => console.log('onResend')}
            resendDisabled={false}
            resendCountdownSeconds={null}
            error={null}
            info={null}
            isSubmitting={false}
            onSubmit={() => console.log('onSubmit')}
          />
        </View>

        <View className="p-4 border-t border-border">
          <Text className="mb-4 text-lg font-bold text-foreground">
            sign-up-verify — Mid-error
          </Text>
          <SignUpVerify
            phone="+15559876543"
            otp="12345"
            onChangeOtp={setOtp}
            onChangeNumber={() => console.log('onChangeNumber')}
            onResend={() => console.log('onResend')}
            resendDisabled={false}
            resendCountdownSeconds={null}
            error="Invalid verification code. Please try again."
            info={null}
            isSubmitting={false}
            onSubmit={() => console.log('onSubmit')}
          />
        </View>

        <View className="p-4 border-t border-border">
          <Text className="mb-4 text-lg font-bold text-foreground">
            sign-up-verify — Countdown active
          </Text>
          <SignUpVerify
            phone="+15551112222"
            otp=""
            onChangeOtp={setOtp}
            onChangeNumber={() => console.log('onChangeNumber')}
            onResend={() => console.log('onResend')}
            resendDisabled={true}
            resendCountdownSeconds={25}
            error={null}
            info="New code sent successfully."
            isSubmitting={false}
            onSubmit={() => console.log('onSubmit')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
