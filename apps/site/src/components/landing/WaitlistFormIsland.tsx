/**
 * Marketing product-updates form, mounted as a React island via
 * `<WaitlistFormIsland client:only="react" />` from `WaitlistForm.astro`.
 *
 * - Posts directly to `POST {apiBaseUrl}/waitlist` (CORS allowed by
 *   the API for harpapro.com + localhost dev).
 * - Cloudflare Turnstile widget supplies the bot-mitigation token;
 *   we never let the user submit without one.
 * - On success, replaces the form with a "check your inbox" message.
 * - On failure (network, 400, 429), shows a short, on-brand error.
 *
 * Styling uses the same Tailwind utility set as the rest of the
 * landing page so the island visually matches the placeholder it
 * replaces.
 */
import { useRef, useState } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { waitlist } from '@harpa/api-contract';
import { getPublicEnv } from '../../lib/env';

// Single source of truth for request shape + caps. Mirrors the server.
const { waitlistSignupRequest } = waitlist;

// Pull the field caps out of the shared schema so the inputs enforce
// exactly what the server enforces. If the schema changes, the form
// follows automatically.
type ZodLike = { _def?: { checks?: { kind: string; value?: number }[] }; unwrap?: () => ZodLike };
function maxOf(field: 'email' | 'source'): number {
  const shape = waitlistSignupRequest.shape;
  const fieldSchema = shape[field] as ZodLike;
  const inner: ZodLike =
    'unwrap' in fieldSchema && typeof fieldSchema.unwrap === 'function'
      ? fieldSchema.unwrap()
      : fieldSchema;
  return inner._def?.checks?.find((c: { kind: string }) => c.kind === 'max')?.value ?? 254;
}
const MAX = {
  email: maxOf('email'),
  source: maxOf('source'),
};

const PRODUCT_UPDATES_SOURCE = 'product-updates';
const SOURCE_SEPARATOR = ' | ';
const DETAILS_MAX = Math.max(
  0,
  MAX.source - PRODUCT_UPDATES_SOURCE.length - SOURCE_SEPARATOR.length,
);

function buildProductUpdatesSource(details: string): string {
  const trimmed = details.trim();
  return trimmed
    ? `${PRODUCT_UPDATES_SOURCE}${SOURCE_SEPARATOR}${trimmed}`
    : PRODUCT_UPDATES_SOURCE;
}

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

const inputCls =
  'min-h-11 w-full rounded-md border border-hairline bg-card px-4 py-2 text-base leading-6 text-ink placeholder:text-ink-soft/70 outline-none ring-focus transition disabled:cursor-not-allowed disabled:opacity-70';

const labelCls =
  'mb-2 flex items-center gap-1.5 text-[length:var(--font-size-label)] font-bold uppercase tracking-[var(--letter-spacing-label)] leading-[var(--line-height-label)] text-ink-soft';
const detailsLabelCls = 'mb-1 flex items-center gap-1.5 text-base font-bold leading-6 text-ink';

export default function WaitlistFormIsland() {
  const env = getPublicEnv();
  const turnstile = useRef<TurnstileInstance | null>(null);
  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const [turnstileToken, setTurnstileToken] = useState<string>('');

  const [email, setEmail] = useState('');
  const [source, setSource] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === 'submitting') return;
    if (!turnstileToken) {
      setState({
        kind: 'error',
        message: 'Please complete the verification challenge.',
      });
      return;
    }

    // Validate against the SAME Zod schema the server uses. This
    // catches over-length / malformed inputs before we round-trip
    // and surfaces the server's own error messages.
    const parsed = waitlistSignupRequest.safeParse({
      email,
      source: buildProductUpdatesSource(source),
      turnstileToken,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path[0];
      const label = field === 'email' ? 'Email' : field === 'source' ? 'Details' : 'Form';
      setState({
        kind: 'error',
        message: `${label}: ${first?.message ?? 'invalid value'}.`,
      });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const res = await fetch(`${env.apiBaseUrl}/waitlist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 202) {
        setState({ kind: 'success' });
        return;
      }
      if (res.status === 429) {
        setState({
          kind: 'error',
          message: 'Too many requests from your network. Please try again later.',
        });
      } else {
        setState({
          kind: 'error',
          message: 'Something went wrong. Please try again.',
        });
      }
      // Token is single-use — reset for the next attempt.
      turnstile.current?.reset();
      setTurnstileToken('');
    } catch {
      setState({
        kind: 'error',
        message: 'Network error. Please try again.',
      });
      turnstile.current?.reset();
      setTurnstileToken('');
    }
  }

  if (state.kind === 'success') {
    return (
      <div role="status" className="rounded-lg border border-hairline bg-paper-2 p-5">
        <h3 className="text-xl font-bold leading-[1.625rem] text-ink">Check your inbox.</h3>
        <p className="mt-2 text-sm leading-5 text-ink-soft">
          We've sent you a confirmation link. Click it within 7 days to confirm product updates. If
          it doesn't arrive, check your spam folder.
        </p>
      </div>
    );
  }

  const submitting = state.kind === 'submitting';

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-hairline bg-paper-2 p-5"
      aria-label="Product updates signup"
    >
      <div className="grid gap-4">
        <label className="block">
          <span className={labelCls}>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            maxLength={MAX.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jamie@buildco.com"
            className={inputCls}
            disabled={submitting}
          />
        </label>

        <label className="block">
          <span className={detailsLabelCls}>
            About your work
            <span className="rounded-sm bg-secondary px-1 py-px text-xs font-normal normal-case tracking-normal text-ink-soft">
              Optional
            </span>
          </span>
          <span className="mb-2 block text-sm leading-5 text-ink-soft">
            Android, web, team rollout, or reporting pain points are all optional.
          </span>
          <textarea
            rows={3}
            maxLength={DETAILS_MAX}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Anything useful for product updates."
            className={inputCls}
            disabled={submitting}
          />
        </label>

        <div className="mt-1">
          <Turnstile
            ref={turnstile}
            siteKey={env.turnstileSiteKey}
            onSuccess={(t) => setTurnstileToken(t)}
            onError={() => setTurnstileToken('')}
            onExpire={() => setTurnstileToken('')}
            options={{ theme: 'light', size: 'flexible' }}
          />
        </div>

        {state.kind === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex min-h-13 items-center justify-center gap-2 rounded-md bg-accent px-5 text-lg font-bold text-accent-foreground shadow-[var(--shadow-raised)] hover:brightness-95 ring-focus disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? 'Submitting…' : 'Get updates →'}
        </button>
        <p className="text-xs text-ink-soft">
          We'll only use your info to coordinate Harpa Pro updates. No spam, ever.
        </p>
      </div>
    </form>
  );
}
