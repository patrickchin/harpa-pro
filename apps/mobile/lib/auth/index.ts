/**
 * Public surface of `lib/auth/*`. App code imports from `@/lib/auth`.
 */
export {
  AuthSessionProvider,
  useAuthSession,
  useOptionalAuthSession,
  type AuthStatus,
  type AuthSessionValue,
  type SessionUser,
} from './session';
export { authClient } from './client';
