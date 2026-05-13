/**
 * Hand-written fixtures used by:
 *   - apps/marketing — the M2 voice demo result reveal
 *   - apps/mobile — the dev gallery preview for `VoiceReportView`
 *
 * Content is deliberately plausible-but-fictional UK construction
 * site copy. If you regenerate these, hand-write the new content —
 * do not autogenerate at build time (we want the marketing demo to
 * read as a genuine site update, not template prose).
 */
import type { ReportBody, VoiceTranscript } from '../types.js';

import demoReportJson from './demo-report.json' with { type: 'json' };
import demoTranscriptJson from './demo-transcript.json' with { type: 'json' };

export const demoReport: ReportBody = demoReportJson as ReportBody;
export const demoTranscript: VoiceTranscript = demoTranscriptJson as VoiceTranscript;
