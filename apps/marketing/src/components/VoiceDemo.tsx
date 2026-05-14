/**
 * Marketing M2 voice demo island, mounted via:
 *
 *     <VoiceDemo client:only="react" />
 *
 * Why `client:only`: the shared report components from
 * `@harpa/ui-voice` use react-native-web primitives whose styles are
 * applied at mount time. Server-rendering them would emit unstyled
 * markup that visibly flickers when hydrated. The whole island is
 * gated on `client:only` so it only ever runs in the browser.
 *
 * What this component does:
 *
 *   1. Asks for mic permission and records up to 30s.
 *   2. Discards the recorded blob immediately on stop — nothing is
 *      uploaded, persisted, or even held in component state past
 *      `onstop`. The recording exists only to drive the UX timer.
 *   3. Plays a scripted "transcribing… → generating…" sequence
 *      against the hand-written fixtures in `@harpa/ui-voice`.
 *   4. Renders the result panels using the same `VoiceReportView`
 *      and `VoiceTranscriptPanel` the mobile app will use in P3.
 *
 * What it does NOT do (deferred to plan-m4-voice-demo-live.md):
 *   - Upload audio anywhere.
 *   - Hit the API.
 *   - Persist any state between sessions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VoiceReportView,
  VoiceTranscriptPanel,
} from '@harpa/ui-voice';
import { demoReport, demoTranscript } from '@harpa/ui-voice/fixtures';

type DemoState =
  | { kind: 'idle' }
  | { kind: 'requesting-permission' }
  | { kind: 'permission-denied'; message: string }
  | { kind: 'recording'; elapsedSec: number }
  | { kind: 'processing'; phase: 'transcribing' | 'generating' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

const MAX_RECORD_SEC = 30;
const TRANSCRIBING_MS = 1500;
const GENERATING_MS = 2000;

export function VoiceDemo() {
  const [state, setState] = useState<DemoState>({ kind: 'idle' });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStream = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => cleanupStream, [cleanupStream]);

  const startScriptedReveal = useCallback(() => {
    setState({ kind: 'processing', phase: 'transcribing' });
    const t1 = setTimeout(() => {
      setState({ kind: 'processing', phase: 'generating' });
      const t2 = setTimeout(() => {
        setState({ kind: 'done' });
      }, GENERATING_MS);
      // Store on ref so unmount cancels.
      timerRef.current = t2 as unknown as ReturnType<typeof setInterval>;
    }, TRANSCRIBING_MS);
    timerRef.current = t1 as unknown as ReturnType<typeof setInterval>;
  }, []);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === 'recording') {
      rec.stop();
    }
    cleanupStream();
    startScriptedReveal();
  }, [cleanupStream, startScriptedReveal]);

  const startRecording = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState({
        kind: 'permission-denied',
        message:
          'This browser does not support audio recording. Try the latest Chrome, Safari, or Firefox — or skip the recording below.',
      });
      return;
    }

    setState({ kind: 'requesting-permission' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;

      // We do not collect chunks — the blob is intentionally discarded.
      // The `ondataavailable` handler is a no-op for the same reason.
      rec.addEventListener('dataavailable', () => {
        /* discard */
      });

      let elapsed = 0;
      setState({ kind: 'recording', elapsedSec: 0 });
      timerRef.current = setInterval(() => {
        elapsed += 1;
        if (elapsed >= MAX_RECORD_SEC) {
          stopRecording();
        } else {
          setState({ kind: 'recording', elapsedSec: elapsed });
        }
      }, 1000);

      rec.start();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Microphone access was denied.';
      setState({ kind: 'permission-denied', message });
    }
  }, [stopRecording]);

  const skipRecording = useCallback(() => {
    cleanupStream();
    startScriptedReveal();
  }, [cleanupStream, startScriptedReveal]);

  const reset = useCallback(() => {
    cleanupStream();
    setState({ kind: 'idle' });
  }, [cleanupStream]);

  return (
    <section
      aria-labelledby="voice-demo-heading"
      className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16"
    >
      <header className="mb-8 max-w-2xl">
        <h2
          id="voice-demo-heading"
          className="text-2xl font-bold text-foreground sm:text-3xl"
        >
          Try it now
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          Tap record and talk through your day. We&rsquo;ll show you
          what the daily report looks like &mdash; using a sample
          transcript and a pre-generated example. Your audio never
          leaves your browser.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <DemoControls
          state={state}
          onStart={startRecording}
          onStop={stopRecording}
          onSkip={skipRecording}
          onReset={reset}
        />
      </div>

      {(state.kind === 'processing' || state.kind === 'done') && (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VoiceTranscriptPanel
            transcript={demoTranscript}
            loading={
              state.kind === 'processing' && state.phase === 'transcribing'
            }
            typewriterMsPerChar={
              state.kind === 'processing' && state.phase === 'generating'
                ? 18
                : undefined
            }
          />
          {state.kind === 'done' ? (
            <VoiceReportView report={demoReport} watermark="Demo report" />
          ) : (
            <ReportPlaceholder
              label={
                state.kind === 'processing' && state.phase === 'generating'
                  ? 'Generating report…'
                  : 'Report appears here'
              }
            />
          )}
        </div>
      )}

      {state.kind === 'done' && (
        <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
          This is a demo with a sample report.{' '}
          <a
            href="#waitlist"
            className="font-semibold text-accent underline decoration-accent/50 underline-offset-2 hover:decoration-accent"
          >
            Join the waitlist
          </a>{' '}
          to generate your own from a real site visit.
        </p>
      )}
    </section>
  );
}

interface DemoControlsProps {
  state: DemoState;
  onStart: () => void;
  onStop: () => void;
  onSkip: () => void;
  onReset: () => void;
}

function DemoControls({
  state,
  onStart,
  onStop,
  onSkip,
  onReset,
}: DemoControlsProps) {
  if (state.kind === 'idle') {
    return (
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-foreground">
            Ready when you are
          </p>
          <p className="text-sm text-muted-foreground">
            Up to 30 seconds. Audio is discarded immediately.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onStart}
            className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          >
            Start recording
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Skip — just show me the output
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'requesting-permission') {
    return (
      <p className="text-sm text-muted-foreground">
        Waiting for microphone permission…
      </p>
    );
  }

  if (state.kind === 'permission-denied') {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-base font-semibold text-foreground">
            Microphone unavailable
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.message}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90"
          >
            Skip — just show me the output
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'recording') {
    const remaining = MAX_RECORD_SEC - state.elapsedSec;
    return (
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
          </span>
          <div>
            <p className="text-base font-semibold text-foreground">
              Recording…
            </p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {remaining}s remaining
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Stop
        </button>
      </div>
    );
  }

  if (state.kind === 'processing') {
    return (
      <p className="text-sm text-muted-foreground">
        {state.phase === 'transcribing'
          ? 'Transcribing your recording…'
          : 'Generating the report…'}
      </p>
    );
  }

  if (state.kind === 'done') {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          That&rsquo;s what your foreman would see at the end of the day.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="self-start rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted sm:self-auto"
        >
          Try again
        </button>
      </div>
    );
  }

  // state.kind === 'error'
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-destructive">{state.message}</p>
      <button
        type="button"
        onClick={onReset}
        className="self-start rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
      >
        Try again
      </button>
    </div>
  );
}

function ReportPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-8">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export default VoiceDemo;
