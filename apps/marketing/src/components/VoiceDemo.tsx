/**
 * Hero voice-demo island.
 *
 * Renders a fixed-height card containing two screens:
 *
 *   1. "Reports" list — one in-progress voice note with an animated
 *      waveform, a live-ticking duration, and a "Generate report"
 *      CTA. A bottom composer (text + camera + mic buttons) sits at
 *      the foot of the screen.
 *
 *   2. "Site report" — scrolls the shared `VoiceReportView` from
 *      `@harpa/ui-voice` *inside* the card, so the hero section
 *      keeps its footprint regardless of report length.
 *
 * No audio capture, no API calls, no persistence — everything is
 * fixture-driven. Plan-m4 will replace the mocked recording with a
 * live API hookup.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { VoiceReportView } from '@harpa/ui-voice';
import { demoReport } from '@harpa/ui-voice/fixtures';

type Screen = 'list' | 'generating' | 'report';

const GENERATING_MS = 500;

export function VoiceDemo() {
  const [screen, setScreen] = useState<Screen>('list');

  // Live duration ticker for the "currently recording" voice note.
  const [elapsedSec, setElapsedSec] = useState(38);
  useEffect(() => {
    if (screen === 'report') return;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [screen]);

  // Auto-advance from generating → report.
  useEffect(() => {
    if (screen !== 'generating') return;
    const t = setTimeout(() => setScreen('report'), GENERATING_MS);
    return () => clearTimeout(t);
  }, [screen]);

  return (
    <DemoCard>
      {screen === 'report' ? (
        <ReportScreen onBack={() => setScreen('list')} />
      ) : (
        <ListScreen
          elapsedSec={elapsedSec}
          generating={screen === 'generating'}
          onGenerate={() => setScreen('generating')}
        />
      )}
    </DemoCard>
  );
}

function DemoCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[480px]">
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-xl"
        style={{ height: 640 }}
      >
        {children}
      </div>
    </div>
  );
}

interface ListScreenProps {
  elapsedSec: number;
  generating: boolean;
  onGenerate: () => void;
}

function ListScreen({ elapsedSec, generating, onGenerate }: ListScreenProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 px-4 pb-3 pt-4">
        <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
          New Report
        </h3>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-label="Settings"
        >
          <DotsIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-3 pt-3">
        <PreviousNoteCard
          title="Walk through — North Entrance"
          author="Haruna Bayoh"
          recordedAt="Today · 9:42 AM"
          summary="Rebar laid out for Block B footing. Crew noted standing water near gridline 4; pump scheduled for tomorrow."
          duration="2:14"
        />
        <div className="mt-3">
          <VoiceNoteCard elapsedSec={elapsedSec} />
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-default disabled:opacity-80"
        >
          {generating ? (
            <>
              <Spinner className="h-4 w-4" />
              Generating report…
            </>
          ) : (
            <>
              Generate report
              <ArrowRightIcon className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      <Composer />
    </>
  );
}

interface VoiceNoteCardProps {
  elapsedSec: number;
}

function VoiceNoteCard({ elapsedSec }: VoiceNoteCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
          <MicIcon className="relative h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-muted-foreground">
            Patrick Chin · Today · 11:08 AM
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-8 flex-1 items-center justify-between gap-[2px]">
              <InlineWaveform />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {formatDuration(elapsedSec)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviousNoteCard({
  title,
  author,
  recordedAt,
  summary,
  duration,
}: {
  title: string;
  author: string;
  recordedAt: string;
  summary: string;
  duration: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Play voice note"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <PlayIcon className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {title}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {author} · {recordedAt}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-0 rounded-full bg-primary" />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {duration}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        <span className="font-bold">Summary: </span>
        {summary}
      </p>
    </div>
  );
}

function InlineWaveform() {
  const bars = Array.from({ length: 36 }, (_, i) => {
    const h = 30 + ((i * 37) % 60);
    const delay = (i * 73) % 900;
    return { i, h, delay };
  });
  return (
    <>
      {bars.map(({ i, h, delay }) => (
        <span
          key={i}
          aria-hidden
          className="wave-bar w-[2px] rounded-full bg-primary/70"
          style={{ height: `${h}%`, animationDelay: `${delay}ms` }}
        />
      ))}
    </>
  );
}

function Composer() {
  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm">
      <div className="border-b border-border/60 bg-muted/60 px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
        Real live demo coming soon!
      </div>
      <div className="px-3 pb-5 pt-4">
        <div className="flex items-stretch gap-2" aria-disabled="true">
          <div className="flex flex-1 cursor-not-allowed items-center truncate rounded-xl border border-border bg-background px-4 text-sm text-muted-foreground opacity-60">
            Add a note…
          </div>
          <button
            type="button"
            disabled
            aria-label="Take a photo"
            className="flex h-14 w-14 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-border bg-background text-foreground opacity-60"
          >
            <CameraIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            disabled
            aria-label="Record voice note"
            className="flex h-14 w-14 shrink-0 cursor-not-allowed items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm opacity-60"
          >
            <MicIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportScreen({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Reports
        </button>
        <span className="text-[11px] text-muted-foreground">Just now</span>
        <span className="w-8" aria-hidden />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <VoiceReportView report={demoReport} />
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// ────────────────────────────────────────────────────────────────────
// Inline icons (lucide paths). Inlined rather than imported so the
// island stays a single small bundle and matches the existing
// `apps/marketing/src/components/Icon.astro` style.
// ────────────────────────────────────────────────────────────────────

interface IconProps {
  className?: string;
}

function MicIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function CameraIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function PlayIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.55.83l10.4-6.86a1 1 0 0 0 0-1.66L9.55 4.31A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function DotsIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function Spinner({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={`animate-spin ${className ?? ''}`}
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export default VoiceDemo;
