import type { reports } from '@harpa/api-contract';

export type ReportBody = reports.ReportBody;

/**
 * Hand-written transcript shape used by the marketing voice demo and
 * the mobile dev gallery. The live API will return a richer payload
 * (segments, speaker labels, timing) once M4 lands — this is the
 * subset every UI needs today.
 */
export interface VoiceTranscript {
  text: string;
  language: 'en' | string;
  durationSec: number;
}

export interface VoiceReportViewProps {
  /**
   * The report body to render. Matches `ReportBody` from
   * `@harpa/api-contract` exactly; pass the fixture or a live response.
   */
  report: ReportBody;
  /**
   * Optional watermark text overlaid in the top-right of the report
   * card. Set to `"Demo report"` on the marketing demo. Omit in
   * production app surfaces.
   */
  watermark?: string;
  /**
   * Optional className appended to the outer container. Mobile and
   * marketing pass their own padding / max-width here.
   */
  className?: string;
}

export interface VoiceTranscriptPanelProps {
  transcript: VoiceTranscript;
  /**
   * If `true`, renders a "transcribing…" pulse instead of the text.
   */
  loading?: boolean;
  /**
   * If set, types the transcript out one character at a time at this
   * speed (in ms per char). Useful for the demo reveal. Defaults to
   * showing the full transcript immediately.
   */
  typewriterMsPerChar?: number;
  className?: string;
}
