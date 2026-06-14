import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';

export type OnboardingPocVariantId =
  | 'report-first'
  | 'sample-report'
  | 'workspace-first';

export interface OnboardingPocVariant {
  readonly id: OnboardingPocVariantId;
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly primaryCta: string;
  readonly steps: readonly string[];
  readonly signals: readonly string[];
}

export const ONBOARDING_POC_VARIANTS = [
  {
    id: 'report-first',
    label: 'Report first',
    eyebrow: 'Optimization A',
    title: 'Get to a first real report fast',
    summary:
      'Start with a guided site visit so a new user reaches useful output before setup work.',
    primaryCta: 'Create project and report',
    steps: [
      'Name the project',
      'Capture visit details',
      'Review the generated report',
    ],
    signals: [
      'Time to first report',
      'Completion rate through report review',
      'Whether users invite a teammate afterward',
    ],
  },
  {
    id: 'sample-report',
    label: 'Sample report',
    eyebrow: 'Optimization B',
    title: 'Show the finished outcome before asking for work',
    summary:
      'Lead with a polished example report so users understand the payoff before they create anything.',
    primaryCta: 'Use this as a template',
    steps: [
      'Preview a realistic report',
      'Explain what inputs created it',
      'Convert the example into a new project',
    ],
    signals: [
      'Preview engagement',
      'Template-start conversion',
      'Confidence before first project',
    ],
  },
  {
    id: 'workspace-first',
    label: 'Workspace setup',
    eyebrow: 'Optimization C',
    title: 'Make the account feel organized from the first screen',
    summary:
      'Ask for project context first, then show an empty workspace with obvious next actions.',
    primaryCta: 'Set up workspace',
    steps: [
      'Create project shell',
      'Add default report sections',
      'Prompt the next field note',
    ],
    signals: [
      'Project creation completion',
      'First note started',
      'Return intent after setup',
    ],
  },
] as const satisfies ReadonlyArray<OnboardingPocVariant>;

const report = SAMPLE_GENERATED_REPORT.report;

export const SAMPLE_ONBOARDING_REPORT = {
  title: report.meta.title,
  summary: report.meta.summary,
  visitDate: report.meta.visitDate,
  issueTitle: report.issues[0]?.title ?? 'Issue captured',
  issueDetail: report.issues[0]?.details ?? 'Issue details captured.',
  nextStep: report.nextSteps[0] ?? 'Next action captured.',
  workerCount: report.workers.totalWorkers,
  weather: report.weather.conditions,
} as const;
