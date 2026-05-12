import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { Input } from './Input';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('Input', () => {
  it('renders a bare input', () => {
    const tree = render(<Input placeholder="Search" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders label + hint', () => {
    const tree = render(<Input label="Email" hint="We never spam" placeholder="you@example.com" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders the error tone', () => {
    const tree = render(<Input label="Phone" error="Invalid phone number" value="+1" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders the read-only state', () => {
    const tree = render(<Input label="Account ID" editable={false} value="acct_123" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('preserves the centred caret style block (Pitfall v3 1ec0fc8)', () => {
    const tree = render(<Input placeholder="Centred" />);
    const json = tree.toJSON();
    // Find the TextInput host element.
    const findHost = (node: TestRenderer.ReactTestRendererJSON | null): TestRenderer.ReactTestRendererJSON | null => {
      if (!node) return null;
      if (node.type === 'rn-TextInput') return node;
      for (const child of node.children ?? []) {
        if (typeof child === 'string') continue;
        const hit = findHost(child);
        if (hit) return hit;
      }
      return null;
    };
    const host = findHost(json as TestRenderer.ReactTestRendererJSON);
    expect(host).not.toBeNull();
    const style = (host!.props.style ?? []) as unknown as Array<Record<string, unknown>>;
    const flat = style.flat(Infinity).filter(Boolean) as Array<Record<string, unknown>>;
    const centred = flat.find((s) => s && s.textAlignVertical === 'center');
    expect(centred).toBeTruthy();
    expect(centred).toMatchObject({
      textAlignVertical: 'center',
      paddingTop: 0,
      paddingBottom: 0,
    });
  });
});
