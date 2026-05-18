/**
 * Sign-in / Sign-out flow stubs (TUI-app.3).
 *
 * Replaced with the real implementations in TUI-app.4 (next commit).
 * Kept here so the driver can compile and the menu wiring can be
 * unit-tested in isolation from the OTP code path.
 */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';

export const signInFlow: Flow = {
  id: 'sign-in',
  label: 'Sign in',
  hint: 'Authenticate via phone + OTP (stub — see TUI-app.4)',
  visibleIn: ['auth'],
  async run({ prompter }): Promise<FlowResult> {
    prompter.log.info('Sign-in flow not yet implemented.');
    return stay;
  },
};

export const signOutFlow: Flow = {
  id: 'sign-out',
  label: 'Sign out',
  hint: 'Clear credentials (stub — see TUI-app.4)',
  visibleIn: ['authed'],
  async run({ prompter }): Promise<FlowResult> {
    prompter.log.info('Sign-out flow not yet implemented.');
    return stay;
  },
};
