/**
 * Hand-crafted `ReportBody` fixture for fixture-mode and dev-mirror
 * rendering. Mirrors the persisted API contract so the Report tab
 * renders an interesting layout without a real API call.
 *
 * Used by fixture-mode report surfaces and tests that need a realistic
 * persisted body.
 */
import { reports } from '@harpa/api-contract';

export const SAMPLE_GENERATED_REPORT: reports.ReportBody = {
  meta: {
    title: 'Highland Tower — Visit 1',
    summary:
      'Steady progress on east footing despite minor delivery delay. Crew on schedule for column formwork tomorrow.',
    visitDate: '2026-05-12',
  },
  weather: {
    condition: 'Cloudy with afternoon showers',
    temperature: '14°C',
    wind: '12 km/h SW',
    impact: 'Light rain shifted pour window by ~30 min.',
  },
  workers: [
    { role: 'Steel fixer', count: '3', hours: '24', notes: 'East footing rebar' },
    { role: 'Carpenter', count: '2', hours: '16', notes: 'Formwork prep' },
    { role: 'General crew', count: null, hours: null, notes: 'All crew on site by 7:45 AM.' },
  ],
  materials: [
    {
      name: 'Concrete C30',
      quantity: '12',
      unit: 'm³',
      status: 'Delivered',
      condition: 'OK',
      notes: 'Delivery 30 min late.',
    },
    {
      name: 'Rebar #5',
      quantity: '40',
      unit: 'bars',
      status: 'On site',
      condition: 'OK',
      notes: null,
    },
  ],
  issues: [
    {
      title: 'Concrete delivery delay',
      severity: 'medium',
      description: 'Delivery 30 min late; pour pushed back. Supplier confirmed next window.',
      action: 'Confirm tomorrow’s delivery slot with supplier.',
    },
  ],
  nextSteps: [
    'Close east footing pour.',
    'Begin column formwork on grid B/C.',
    'Reorder additional 20m³ of concrete.',
  ],
  summarySections: [
    {
      title: 'Site Conditions',
      body: 'Access road wet but passable. Mud control mats deployed at gate.',
    },
  ],
};
