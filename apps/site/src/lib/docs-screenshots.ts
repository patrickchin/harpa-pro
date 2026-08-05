import type { ImageMetadata } from 'astro';

import finalReportIssues from '../assets/docs/05-final-report-issues.png';
import finalReportSections from '../assets/docs/06-final-report-sections.png';
import membersTeam from '../assets/docs/03-members-team.png';
import pdfPreview from '../assets/docs/07-pdf-preview.png';
import projectsList from '../assets/docs/01-projects-list.png';
import reportReview from '../assets/docs/09-report-review.png';
import reportsList from '../assets/docs/02-reports-list.png';
import usage from '../assets/docs/08-usage.png';
import voiceRecording from '../assets/docs/04-voice-recording.png';
import type { DocsScreenshotId } from './docs';

interface DocsScreenshot {
  image: ImageMetadata;
  focus: `${number}% ${number}%`;
}

export const DOCS_SCREENSHOTS = {
  'projects-list': { image: projectsList, focus: '50% 20%' },
  'reports-list': { image: reportsList, focus: '50% 22%' },
  'members-team': { image: membersTeam, focus: '50% 27%' },
  'voice-recording': { image: voiceRecording, focus: '50% 45%' },
  'final-report-issues': { image: finalReportIssues, focus: '50% 30%' },
  'final-report-sections': { image: finalReportSections, focus: '50% 38%' },
  'pdf-preview': { image: pdfPreview, focus: '50% 28%' },
  'report-review': { image: reportReview, focus: '50% 35%' },
  usage: { image: usage, focus: '50% 30%' },
} satisfies Record<DocsScreenshotId, DocsScreenshot>;

export function docsScreenshot(id: DocsScreenshotId): DocsScreenshot {
  return DOCS_SCREENSHOTS[id];
}
