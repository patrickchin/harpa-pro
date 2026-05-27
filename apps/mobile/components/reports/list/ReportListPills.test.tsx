import { describe, it, expect } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import {
  ReportTypePill,
  RiskLevelBadge,
} from '@/components/reports/list/ReportListPills';

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

describe('ReportTypePill', () => {
  it('renders null when value is null', () => {
    const tree = render(<ReportTypePill value={null} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders null when value is undefined', () => {
    const tree = render(<ReportTypePill value={undefined} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders "Site visit" for site_visit', () => {
    const tree = render(<ReportTypePill value="site_visit" />);
    expect(collectText(tree.toJSON())).toContain('Site visit');
  });

  it('renders "Incident" for incident', () => {
    const tree = render(<ReportTypePill value="incident" />);
    expect(collectText(tree.toJSON())).toContain('Incident');
  });

  it('renders "Daily" for daily', () => {
    const tree = render(<ReportTypePill value="daily" />);
    expect(collectText(tree.toJSON())).toContain('Daily');
  });

  it('renders "Inspection" for inspection', () => {
    const tree = render(<ReportTypePill value="inspection" />);
    expect(collectText(tree.toJSON())).toContain('Inspection');
  });

  it('renders "Safety" for safety', () => {
    const tree = render(<ReportTypePill value="safety" />);
    expect(collectText(tree.toJSON())).toContain('Safety');
  });

  it('renders "Progress" for progress', () => {
    const tree = render(<ReportTypePill value="progress" />);
    expect(collectText(tree.toJSON())).toContain('Progress');
  });
});

describe('RiskLevelBadge', () => {
  it('renders null when value is null', () => {
    const tree = render(<RiskLevelBadge value={null} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders null when value is undefined', () => {
    const tree = render(<RiskLevelBadge value={undefined} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders "High" for high', () => {
    const tree = render(<RiskLevelBadge value="high" />);
    expect(collectText(tree.toJSON())).toContain('High');
  });

  it('renders "Medium" for medium', () => {
    const tree = render(<RiskLevelBadge value="medium" />);
    expect(collectText(tree.toJSON())).toContain('Medium');
  });

  it('renders "Low" for low', () => {
    const tree = render(<RiskLevelBadge value="low" />);
    expect(collectText(tree.toJSON())).toContain('Low');
  });
});
