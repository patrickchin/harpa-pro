interface LoginPhoneHintOptions {
  codeSent: boolean;
  rememberedPhone: string | null;
  phoneMatchesRemembered: boolean;
}

export function getLoginPhoneHint({
  codeSent,
  rememberedPhone,
  phoneMatchesRemembered,
}: LoginPhoneHintOptions): string {
  if (codeSent) {
    return 'Code sent. Enter the 6-digit verification code from your text message.';
  }

  if (rememberedPhone && phoneMatchesRemembered) {
    return 'Signed in recently with this number on this device.';
  }

  return 'Start with + and your country code so we can text your code (e.g. +1 555 123 4567).';
}
