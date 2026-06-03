import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { WeatherStrip } from '@/components/reports/WeatherStrip';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function collectText(n: any): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(collectText).join(' ');
  if (n.children) return collectText(n.children);
  return '';
}

const EMPTY_WEATHER_REPORT = {
  ...SAMPLE_GENERATED_REPORT,
  report: {
    ...SAMPLE_GENERATED_REPORT.report,
    weather: {
      conditions: null,
      temperature: null,
      wind: null,
      impact: null,
    },
  },
};

describe('WeatherStrip', () => {
  it('hides empty weather in read-only mode', () => {
    const tree = render(<WeatherStrip report={EMPTY_WEATHER_REPORT} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders an editable empty weather card for drafts', () => {
    const tree = render(<WeatherStrip report={EMPTY_WEATHER_REPORT} onEdit={vi.fn()} />);

    expect(tree.root.findAllByProps({ testID: 'btn-edit-weather' }).length).toBeGreaterThan(0);
    expect(collectText(tree.toJSON())).toContain('No weather recorded yet.');
  });
});
