import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('allows long project and report titles to wrap inside narrow viewports', () => {
    render(
      <PageHeader
        description="A long project description that must stay inside the content column."
        title="HarborHouseExtensionWithAnUnbrokenReferenceNumber123456789"
      />,
    );

    expect(screen.getByRole('heading')).toHaveClass('break-words', '[overflow-wrap:anywhere]');
    expect(screen.getByText(/long project description/)).toHaveClass('break-words');
  });
});
