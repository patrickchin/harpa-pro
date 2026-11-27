import type { ImageMetadata } from 'astro';

import finalReportIssues from '../../assets/reports/docs/05-final-report-issues.png';
import finalReportSections from '../../assets/reports/docs/06-final-report-sections.png';
import membersTeam from '../../assets/reports/docs/03-members-team.png';
import pdfPreview from '../../assets/reports/docs/07-pdf-preview.png';
import projectsList from '../../assets/reports/docs/01-projects-list.png';
import reportReview from '../../assets/reports/docs/09-report-review.png';
import reportsList from '../../assets/reports/docs/02-reports-list.png';
import usage from '../../assets/reports/docs/08-usage.png';
import voiceRecording from '../../assets/reports/docs/04-voice-recording.png';
import type { DocsScreenshotId } from './docs';

interface DocsScreenshot {
  image: ImageMetadata;
  focus: `${number}% ${number}%`;
}

export const DOCS_SCREENSHOTS = {
  'projects-list': { image: projectsList, focus: '50% 11%' },
  'reports-list': { image: reportsList, focus: '50% 11%' },
  'members-team': { image: membersTeam, focus: '50% 20%' },
  'voice-recording': { image: voiceRecording, focus: '50% 97%' },
  'final-report-issues': { image: finalReportIssues, focus: '50% 25%' },
  'final-report-sections': { image: finalReportSections, focus: '50% 54%' },
  'pdf-preview': { image: pdfPreview, focus: '50% 20%' },
  'report-review': { image: reportReview, focus: '50% 39%' },
  usage: { image: usage, focus: '50% 25%' },
} satisfies Record<DocsScreenshotId, DocsScreenshot>;

export function docsScreenshot(id: DocsScreenshotId): DocsScreenshot {
  return DOCS_SCREENSHOTS[id];
}
