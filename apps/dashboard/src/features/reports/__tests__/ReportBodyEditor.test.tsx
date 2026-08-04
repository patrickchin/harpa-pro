// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { reports } from '@harpa/api-contract';

import { ReportBodyEditor } from '../ReportBodyEditor';
import { button, change, click, field, render } from './dom';
import { reportBodyFixture } from './fixtures';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

describe('ReportBodyEditor', () => {
  it('uses the shared Tailwind editing surfaces without legacy report CSS hooks', async () => {
    const rendered = await render(
      <ReportBodyEditor body={reportBodyFixture} onChange={() => undefined} />,
    );
    cleanups.push(rendered.cleanup);

    const editor = rendered.container.querySelector('[aria-label="Structured report editor"]');
    const sectionNavigation = rendered.container.querySelector(
      'nav[aria-label="Report sections"]',
    );

    expect(editor).toHaveClass('grid', 'gap-4');
    expect(sectionNavigation).toHaveClass('overflow-x-auto', 'bg-surface-muted');
    expect(field(rendered.container, 'Report title')).toHaveClass('min-h-11');
    expect(button(rendered.container, 'Add worker')).toHaveClass('bg-card');
    expect(
      Array.from(rendered.container.querySelectorAll<HTMLElement>('[class]')).flatMap((element) =>
        element.className.split(/\s+/),
      ),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^reports-/)]));
  });

  it('edits the canonical body and supports repeatable keyboard-friendly rows', async () => {
    let current = structuredClone(reportBodyFixture);

    function Harness() {
      const [body, setBody] = useState<reports.ReportBody>(current);
      return (
        <ReportBodyEditor
          body={body}
          onChange={(next) => {
            current = next;
            setBody(next);
          }}
        />
      );
    }

    const rendered = await render(<Harness />);
    cleanups.push(rendered.cleanup);

    const summary = field(rendered.container, 'Summary');
    expect(summary).toBeInstanceOf(HTMLTextAreaElement);
    await change(summary, 'Rewritten with a physical keyboard.');
    expect(current.meta.summary).toBe('Rewritten with a physical keyboard.');

    await click(button(rendered.container, 'Add worker'));
    await change(field(rendered.container, 'Worker role 2'), 'Electrician');
    await change(field(rendered.container, 'Worker count 2'), 'a few');

    expect(current.workers[1]).toMatchObject({
      role: 'Electrician',
      count: 'a few',
      hours: null,
      notes: null,
    });
    expect(Object.keys(current)).toEqual(
      expect.arrayContaining([
        'meta',
        'weather',
        'workers',
        'materials',
        'issues',
        'nextSteps',
        'summarySections',
      ]),
    );

    await click(button(rendered.container, 'Remove worker 2'));
    expect(current.workers).toHaveLength(1);
  });

  it('lets a report with no weather add and remove the canonical weather object', async () => {
    let current: reports.ReportBody = {
      ...structuredClone(reportBodyFixture),
      weather: null,
    };

    function Harness() {
      const [body, setBody] = useState(current);
      return (
        <ReportBodyEditor
          body={body}
          onChange={(next) => {
            current = next;
            setBody(next);
          }}
        />
      );
    }

    const rendered = await render(<Harness />);
    cleanups.push(rendered.cleanup);
    await click(button(rendered.container, 'Add weather'));

    expect(current.weather).toEqual({
      condition: null,
      temperature: null,
      wind: null,
      impact: null,
    });

    await click(button(rendered.container, 'Remove weather'));
    expect(current.weather).toBeNull();
  });

  it('edits every repeatable canonical section without losing existing rows', async () => {
    let current = structuredClone(reportBodyFixture);
    function Harness() {
      const [body, setBody] = useState(current);
      return (
        <ReportBodyEditor
          body={body}
          onChange={(next) => {
            current = next;
            setBody(next);
          }}
        />
      );
    }
    const rendered = await render(<Harness />);
    cleanups.push(rendered.cleanup);

    await change(field(rendered.container, 'Condition'), 'Clear');
    await change(field(rendered.container, 'Temperature'), '72°F');
    await change(field(rendered.container, 'Wind'), 'Still');
    await change(field(rendered.container, 'Impact'), 'None');
    expect(current.weather).toEqual({
      condition: 'Clear',
      temperature: '72°F',
      wind: 'Still',
      impact: 'None',
    });

    await click(button(rendered.container, 'Add material'));
    await change(field(rendered.container, 'Material name 2'), 'Timber');
    await change(field(rendered.container, 'Material quantity 2'), 'a pallet');
    await change(field(rendered.container, 'Material unit 2'), 'bundle');
    await change(field(rendered.container, 'Material status 2'), 'On site');
    await change(field(rendered.container, 'Material condition 2'), 'Dry');
    await change(field(rendered.container, 'Material notes 2'), 'Covered');
    expect(current.materials[1]).toMatchObject({
      name: 'Timber',
      quantity: 'a pallet',
      unit: 'bundle',
      status: 'On site',
      condition: 'Dry',
      notes: 'Covered',
    });
    await click(button(rendered.container, 'Remove material 2'));

    await click(button(rendered.container, 'Add issue'));
    await change(field(rendered.container, 'Issue title 2'), 'Access');
    await change(field(rendered.container, 'Issue severity 2'), 'High');
    await change(field(rendered.container, 'Issue description 2'), 'Gate blocked.');
    await change(field(rendered.container, 'Issue required action 2'), 'Clear gate.');
    expect(current.issues[1]).toMatchObject({
      title: 'Access',
      severity: 'High',
      description: 'Gate blocked.',
      action: 'Clear gate.',
    });
    await click(button(rendered.container, 'Remove issue 2'));

    await click(button(rendered.container, 'Add next step'));
    await change(field(rendered.container, 'Next step 2'), 'Confirm tomorrow’s delivery.');
    expect(current.nextSteps[1]).toBe('Confirm tomorrow’s delivery.');
    await click(button(rendered.container, 'Remove next step 2'));

    await click(button(rendered.container, 'Add other section'));
    await change(field(rendered.container, 'Other section title 2'), 'Safety');
    await change(field(rendered.container, 'Other section body 2'), 'No incidents.');
    expect(current.summarySections[1]).toMatchObject({
      title: 'Safety',
      body: 'No incidents.',
    });
    await click(button(rendered.container, 'Remove other section 2'));

    expect(current.materials).toHaveLength(1);
    expect(current.issues).toHaveLength(1);
    expect(current.nextSteps).toHaveLength(1);
    expect(current.summarySections).toHaveLength(1);
  });
});
