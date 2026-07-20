import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';

import { ScreenHeader } from './ScreenHeader';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('ScreenHeader', () => {
  it('renders a bare title-only header', () => {
    const tree = render(<ScreenHeader title="Reports" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders eyebrow + subtitle when supplied', () => {
    const tree = render(
      <ScreenHeader title="Projects" eyebrow="ALL" subtitle="3 active, 12 archived" />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders a back button when onBack is supplied', () => {
    const onBack = () => {};
    const tree = render(<ScreenHeader title="Detail" onBack={onBack} backLabel="Projects" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('places the full-width wrapping title below the controls by default', () => {
    const tree = render(
      <ScreenHeader
        title="A long page title that should wrap on a phone"
        onBack={() => {}}
        actions={<View testID="profile-action" />}
      />,
    );
    const controls = tree.root.findByProps({ testID: 'screen-header-controls' });
    const titleRow = tree.root.findByProps({ testID: 'screen-header-title-row' });
    const title = titleRow.findByProps({ testID: 'screen-header-title' });

    expect(controls.findByProps({ testID: 'btn-back' })).toBeTruthy();
    expect(controls.findByProps({ testID: 'profile-action' })).toBeTruthy();
    expect(controls.findAllByProps({ testID: 'screen-header-title' })).toHaveLength(0);
    expect(title.props.className).toContain('w-full');
    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.ellipsizeMode).toBeUndefined();
  });

  it('hides the actions slot when no actions prop is supplied', () => {
    const tree = render(<ScreenHeader title="Locked" />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('btn-open-profile');
  });

  it('preserves the min-h-touch top padding (Pitfall v3 db0b97c)', () => {
    const tree = render(<ScreenHeader title="Spacing" />);
    const flat = JSON.stringify(tree.toJSON());
    expect(flat).toContain('min-h-touch');
  });
});
