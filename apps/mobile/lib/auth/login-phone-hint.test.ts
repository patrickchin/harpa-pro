import { describe, it, expect } from 'vitest';
import { getLoginPhoneHint } from './login-phone-hint';

describe('getLoginPhoneHint', () => {
  it('returns code-sent message when codeSent is true', () => {
    const result = getLoginPhoneHint({
      codeSent: true,
      rememberedPhone: null,
      phoneMatchesRemembered: false,
    });
    expect(result).toBe(
      'Code sent. Enter the 6-digit verification code from your text message.'
    );
  });

  it('returns remembered-phone message when phone matches', () => {
    const result = getLoginPhoneHint({
      codeSent: false,
      rememberedPhone: '+15551234567',
      phoneMatchesRemembered: true,
    });
    expect(result).toBe('Signed in recently with this number on this device.');
  });

  it('returns default instruction message otherwise', () => {
    const result = getLoginPhoneHint({
      codeSent: false,
      rememberedPhone: null,
      phoneMatchesRemembered: false,
    });
    expect(result).toBe(
      'Start with + and your country code so we can text your code (e.g. +1 555 123 4567).'
    );
  });

  it('prefers code-sent over remembered-phone match', () => {
    const result = getLoginPhoneHint({
      codeSent: true,
      rememberedPhone: '+15551234567',
      phoneMatchesRemembered: true,
    });
    expect(result).toBe(
      'Code sent. Enter the 6-digit verification code from your text message.'
    );
  });
});
