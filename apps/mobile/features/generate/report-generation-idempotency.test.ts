import { describe, expect, it } from 'vitest';

interface ReportGenerationIdempotency {
  key(): string;
  succeeded(key: string): void;
}

type CreateTracker = (
  mint?: () => string,
) => ReportGenerationIdempotency;

async function loadTracker(): Promise<CreateTracker> {
  const modulePath = './report-generation-idempotency';
  const module = (await import(/* @vite-ignore */ modulePath)) as {
    createReportGenerationIdempotency: CreateTracker;
  };
  return module.createReportGenerationIdempotency;
}

describe('report generation idempotency key', () => {
  it('reuses one key after an ambiguous failure and rotates after confirmed success', async () => {
    const createTracker = await loadTracker();
    const minted = ['attempt-one', 'attempt-two'];
    const tracker = createTracker(() => minted.shift()!);

    const firstAttempt = tracker.key();
    const transportRetry = tracker.key();

    expect(firstAttempt).toBe('report-generation:attempt-one');
    expect(transportRetry).toBe(firstAttempt);

    tracker.succeeded(firstAttempt);
    expect(tracker.key()).toBe('report-generation:attempt-two');
  });

  it('does not let a stale completion clear a newer attempt', async () => {
    const createTracker = await loadTracker();
    const minted = ['attempt-one', 'attempt-two', 'attempt-three'];
    const tracker = createTracker(() => minted.shift()!);

    const first = tracker.key();
    tracker.succeeded(first);
    const second = tracker.key();
    tracker.succeeded(first);

    expect(tracker.key()).toBe(second);
  });
});
