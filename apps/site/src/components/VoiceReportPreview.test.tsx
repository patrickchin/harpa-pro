import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { demoReport } from '../fixtures/demoReport';
import { VoiceReportPreview } from './VoiceReportPreview';

describe('VoiceReportPreview', () => {
  it('renders the demo report headline sections and fixture content', () => {
    const html = renderToStaticMarkup(<VoiceReportPreview report={demoReport} />);

    expect(html).toContain('Site report');
    expect(html).toContain('Weather');
    expect(html).toContain('Issues');
    expect(html).toContain('Workers');
    expect(html).toContain('Materials');
    expect(html).toContain('Next steps');
    expect(html).toContain('Water ingress on southern wall');
    expect(html).toContain('Steel erectors (Murphy&#x27;s)');
    expect(html).toContain('M16 anchor bolts');
  });
});
