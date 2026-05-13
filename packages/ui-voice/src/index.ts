/**
 * @harpa/ui-voice public API.
 *
 * Cross-platform components rendered via React Native primitives.
 * Mobile imports them directly; marketing aliases `react-native`
 * to `react-native-web` so the same JSX renders in the browser.
 */
export { VoiceReportView } from './components/VoiceReportView.js';
export { VoiceReportSkeleton } from './components/VoiceReportSkeleton.js';
export { VoiceReportEmptyState } from './components/VoiceReportEmptyState.js';
export { VoiceReportSection } from './components/VoiceReportSection.js';
export { VoiceTranscriptPanel } from './components/VoiceTranscriptPanel.js';

export type {
  VoiceReportViewProps,
  VoiceTranscriptPanelProps,
  VoiceTranscript,
  ReportBody,
} from './types.js';
