// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportReview } from '../ReportReview';
import { button, change, click, field, render } from './dom';
import { commentFixture } from './fixtures';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

describe('ReportReview', () => {
  it('uses the shared Tailwind card, field, and button language', async () => {
    const rendered = await render(
      <ReportReview comments={[commentFixture]} onAddComment={async () => undefined} />,
    );
    cleanups.push(rendered.cleanup);

    expect(rendered.container.querySelector('section')).toHaveClass(
      'rounded-card-ui',
      'bg-card',
      'shadow-raised-ui',
    );
    expect(field(rendered.container, 'Add a comment')).toHaveClass('min-h-28');
    expect(button(rendered.container, 'Add comment')).toHaveClass('bg-primary');
    expect(
      Array.from(rendered.container.querySelectorAll<HTMLElement>('[class]')).flatMap((element) =>
        element.className.split(/\s+/),
      ),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^reports-/)]));
  });

  it('renders loading, empty, and retryable error states', async () => {
    const retry = vi.fn();
    const loading = await render(
      <ReportReview comments={[]} isLoading onAddComment={async () => undefined} />,
    );
    cleanups.push(loading.cleanup);
    expect(loading.container.textContent).toContain('Loading review comments…');

    const empty = await render(<ReportReview comments={[]} onAddComment={async () => undefined} />);
    cleanups.push(empty.cleanup);
    expect(empty.container.textContent).toContain('No review comments yet');

    const failed = await render(
      <ReportReview
        comments={[]}
        error={new Error('Comments unavailable')}
        onRetry={retry}
        onAddComment={async () => undefined}
      />,
    );
    cleanups.push(failed.cleanup);
    await click(button(failed.container, 'Retry comments'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('retains typed feedback when submission fails and clears it after success', async () => {
    const onAddComment = vi
      .fn()
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(undefined);
    const rendered = await render(
      <ReportReview comments={[commentFixture]} onAddComment={onAddComment} />,
    );
    cleanups.push(rendered.cleanup);
    const composer = field(rendered.container, 'Add a comment');

    await change(composer, '  Check the delivery total.  ');
    await click(button(rendered.container, 'Add comment'));
    expect(rendered.container.textContent).toContain('Connection lost');
    expect(composer.value).toBe('  Check the delivery total.  ');

    await click(button(rendered.container, 'Add comment'));
    expect(onAddComment).toHaveBeenLastCalledWith('Check the delivery total.');
    expect(composer.value).toBe('');
  });
});
