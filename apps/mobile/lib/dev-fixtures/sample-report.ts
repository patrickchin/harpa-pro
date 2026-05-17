/**
 * Hand-crafted `GeneratedSiteReport` for fixture-mode and dev-mirror
 * rendering. Mirrors the shape of a real LLM-produced report once it
 * has been through `normalizeGeneratedReportPayload`, so the Report
 * tab renders an interesting layout without a real API call.
 *
 * Used by:
 *   - `app/(app)/projects/[projectSlug]/reports/[number]/generate.tsx`
 *     when `EXPO_PUBLIC_USE_FIXTURES === 'true'` (real API generation
 *     hook lands in a later P3 commit alongside the API endpoint).
 *   - `app/(dev)/generate-report.tsx` to drive the live-report state.
 *   - `screens/generate-report-tab.test.tsx` populated-state assertions.
 */
import type { GeneratedSiteReport } from '@harpa/report-core';

export const SAMPLE_GENERATED_REPORT: GeneratedSiteReport = {
  report: {
    meta: {
      title: 'Highland Tower — Visit 1',
      reportType: 'site_visit',
      summary:
        'Steady progress on east footing despite minor delivery delay. Crew on schedule for column formwork tomorrow.',
      visitDate: '2026-05-12',
    },
    weather: {
      conditions: 'Cloudy with afternoon showers',
      temperature: '14°C',
      wind: '12 km/h SW',
      impact: 'Light rain shifted pour window by ~30 min.',
    },
    workers: {
      totalWorkers: 5,
      workerHours: '40h total',
      notes: 'All crew on site by 7:45 AM.',
      roles: [
        { role: 'Steel fixer', count: 3, notes: 'East footing rebar' },
        { role: 'Carpenter', count: 2, notes: 'Formwork prep' },
      ],
    },
    materials: [
      {
        name: 'Concrete C30',
        quantity: '12',
        quantityUnit: 'm³',
        status: 'Delivered',
        condition: 'OK',
        notes: 'Delivery 30 min late.',
      },
      {
        name: 'Rebar #5',
        quantity: '40',
        quantityUnit: 'bars',
        status: 'On site',
        condition: 'OK',
        notes: null,
      },
    ],
    issues: [
      {
        title: 'Concrete delivery delay',
        category: 'logistics',
        severity: 'medium',
        status: 'open',
        details:
          'Delivery 30 min late; pour pushed back. Supplier confirmed next window.',
        actionRequired: 'Confirm tomorrow’s delivery slot with supplier.',
      },
    ],
    nextSteps: [
      'Close east footing pour.',
      'Begin column formwork on grid B/C.',
      'Reorder additional 20m³ of concrete.',
    ],
    sections: [
      {
        title: 'Site Conditions',
        content:
          'Access road wet but passable. Mud control mats deployed at gate.',
      },
    ],
  },
};
