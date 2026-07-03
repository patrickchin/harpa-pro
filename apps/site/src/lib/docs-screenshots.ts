import type { ImageMetadata } from "astro";

import finalReportIssues from "../assets/docs/05-final-report-issues.png";
import finalReportSections from "../assets/docs/06-final-report-sections.png";
import membersTeam from "../assets/docs/03-members-team.png";
import pdfPreview from "../assets/docs/07-pdf-preview.png";
import projectsList from "../assets/docs/01-projects-list.png";
import reportsList from "../assets/docs/02-reports-list.png";
import usage from "../assets/docs/08-usage.png";
import voiceRecording from "../assets/docs/04-voice-recording.png";
import type { DocsScreenshotId } from "./docs";

export const DOCS_SCREENSHOTS = {
  "projects-list": projectsList,
  "reports-list": reportsList,
  "members-team": membersTeam,
  "voice-recording": voiceRecording,
  "final-report-issues": finalReportIssues,
  "final-report-sections": finalReportSections,
  "pdf-preview": pdfPreview,
  "usage": usage,
} satisfies Record<DocsScreenshotId, ImageMetadata>;

export function docsScreenshot(id: DocsScreenshotId): ImageMetadata {
  return DOCS_SCREENSHOTS[id];
}
