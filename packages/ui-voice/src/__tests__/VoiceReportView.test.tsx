import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceReportView } from '../components/VoiceReportView.js';
import { demoReport } from '../fixtures/index.js';

describe('VoiceReportView', () => {
  it('renders all major sections from the demo fixture', () => {
    render(<VoiceReportView report={demoReport} />);

    // Header
    expect(screen.getByText('Site report')).toBeTruthy();

    // Section eyebrows (also appear as stat tile labels for Issues /
    // Workers / Materials / Next steps — `getAllByText` handles both).
    expect(screen.getByText('Weather')).toBeTruthy();
    expect(screen.getAllByText('Issues').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Workers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Materials').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Next steps').length).toBeGreaterThan(0);

    // Content from fixture
    expect(
      screen.getByText('Water ingress on southern wall'),
    ).toBeTruthy();
    expect(screen.getByText("Steel erectors (Murphy's)")).toBeTruthy();
    expect(screen.getByText('M16 anchor bolts')).toBeTruthy();
  });

  it('shows the watermark when supplied', () => {
    render(<VoiceReportView report={demoReport} watermark="Demo report" />);
    expect(screen.getByText('Demo report')).toBeTruthy();
  });

  it('does not show a watermark when omitted', () => {
    render(<VoiceReportView report={demoReport} />);
    expect(screen.queryByText('Demo report')).toBeNull();
  });

  it('renders the user-supplied summary sections', () => {
    render(<VoiceReportView report={demoReport} />);
    expect(screen.getByText('Programme')).toBeTruthy();
    expect(screen.getByText('Quality')).toBeTruthy();
    expect(screen.getByText('Safety')).toBeTruthy();
  });

  it('handles a minimal report payload without crashing', () => {
    render(
      <VoiceReportView
        report={{
          visitDate: null,
          weather: null,
          workers: [],
          materials: [],
          issues: [],
          nextSteps: [],
          summarySections: [],
        }}
      />,
    );
    expect(screen.getByText('Site report')).toBeTruthy();
    // Section eyebrows hide when the corresponding array is empty
    // (the stat-tile labels with the same names still render with 0).
    expect(screen.queryByText('Weather')).toBeNull();
    // Stat tiles still render — Issues / Workers / Materials / Next
    // steps appear exactly once each (as the tile label).
    expect(screen.getAllByText('Issues')).toHaveLength(1);
    expect(screen.getAllByText('Workers')).toHaveLength(1);
  });
});
