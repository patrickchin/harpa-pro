/**
 * Marketing waitlist form, mounted as a React island via
 * `<WaitlistFormIsland client:visible />` from `WaitlistForm.astro`.
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
import { getPublicEnv } from '../../lib/env';

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

const inputCls =
  'w-full rounded-md border border-hairline bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-soft/70 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition disabled:cursor-not-allowed disabled:opacity-70';

const labelCls =
  'mb-1.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-soft';

export default function WaitlistFormIsland() {
  const env = getPublicEnv();
  const turnstile = useRef<TurnstileInstance | null>(null);
  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const [turnstileToken, setTurnstileToken] = useState<string>('');

  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('Foreman / Site Supervisor');
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
    if (!email) {
      setState({ kind: 'error', message: 'Email is required.' });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const res = await fetch(`${env.apiBaseUrl}/waitlist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          company: company || undefined,
          role: role || undefined,
          source: source || undefined,
          turnstileToken,
        }),
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
      <div
        role="status"
        className="rounded-xl border border-hairline bg-paper-2/70 p-5 sm:p-6"
      >
        <h3 className="text-lg font-semibold text-ink">Check your inbox.</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          We've sent you a confirmation link. Click it within 7 days to lock
          in your spot. If it doesn't arrive, check your spam folder.
        </p>
      </div>
    );
  }

  const submitting = state.kind === 'submitting';

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-hairline bg-paper-2/70 p-5 sm:p-6"
      aria-label="Waitlist signup"
    >
      <div className="grid gap-3.5">
        <label className="block">
          <span className={labelCls}>Work email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jamie@buildco.com"
            className={inputCls}
            disabled={submitting}
          />
        </label>

        <label className="block">
          <span className={labelCls}>
            Company
            <span className="rounded-sm bg-secondary px-1 py-px text-[0.6rem] normal-case text-ink-soft">
              Optional
            </span>
          </span>
          <input
            type="text"
            autoComplete="organization"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="BuildCo Construction"
            className={inputCls}
            disabled={submitting}
          />
        </label>

        <label className="block">
          <span className={labelCls}>Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputCls}
            disabled={submitting}
          >
            <option>Foreman / Site Supervisor</option>
            <option>Superintendent</option>
            <option>Project Manager</option>
            <option>Owner / Operator</option>
            <option>Other</option>
          </select>
        </label>

        <label className="block">
          <span className={labelCls}>
            What kind of projects do you run?
            <span className="rounded-sm bg-secondary px-1 py-px text-[0.6rem] normal-case text-ink-soft">
              Optional
            </span>
          </span>
          <textarea
            rows={3}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Multifamily wood-frame, light commercial, civil…"
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
            options={{ theme: 'light' }}
          />
        </div>

        {state.kind === 'error' && (
          <p
            role="alert"
            className="text-sm text-red-700 dark:text-red-400"
          >
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground shadow-sm hover:brightness-95 ring-focus disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? 'Submitting…' : 'Request early access →'}
        </button>
        <p className="text-xs text-ink-soft">
          We'll only use your info to coordinate early access. No spam, ever.
        </p>
      </div>
    </form>
  );
}
