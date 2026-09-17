import { expect, test } from '@playwright/test';

const PROCESS_STEPS = [
  'Design brief',
  'Factory vetting',
  'Specification control',
  'Compliance review',
  'Production inspection',
  'Documentation',
  'Logistics and shipping',
  'Client approval',
] as const;

const PROCESS_DESCRIPTIONS = [
  'Haruna records the design intent, drawings, finishes, quantities, and approval requirements.',
  'Haruna reviews factory capability, product fit, production capacity, and the available compliance documents.',
  'Production drawings and specifications define dimensions, materials, finishes, fire performance, and maintenance requirements.',
  'Haruna checks health, safety, emissions, and product test documents against the project requirements.',
  'Inspection points cover pre-production, active production, and the finished goods before shipment.',
  'Drawings, approvals, inspection records, packing lists, and shipping documents stay with the order.',
  'Haruna checks packing, collection, freight, and delivery milestones against the shipping plan.',
  'The final record captures the delivery review, open items, decision, and sign-off.',
] as const;

const FACTORY_RECORDS = [
  ['AIS Factory Furniture', ['CE', 'E1', 'REACH', 'VOC']],
  ['Langyao Factory LED Lighting', ['CE', 'LVD', 'RoHS']],
  ['Mingyuan Factory Floor Panels', ['CE', 'E1', 'Fire test', 'VOC']],
  ['JLA Factory Ceramic Tiles', ['CE', 'Performance report', 'Test report']],
] as const;

test('presents Haruna and an interactive static procurement journey', async ({ page }) => {
  await page.goto('/agents');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Interior procurement in China.',
    }),
  ).toBeVisible();

  const process = page.getByRole('tablist', { name: 'Procurement journey' });
  const steps = process.getByRole('tab');
  await expect(steps).toHaveCount(PROCESS_STEPS.length);
  for (const [index, step] of PROCESS_STEPS.entries()) {
    const tab = steps.nth(index);
    await expect(tab).toContainText(step);
    await tab.click();
    const panel = page.getByRole('tabpanel', { name: step });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(PROCESS_DESCRIPTIONS[index]!);
    await expect(panel.locator('img')).toHaveCount(1);
  }

  await steps.first().focus();
  await steps.first().press('ArrowDown');
  await expect(steps.nth(1)).toBeFocused();
  await expect(steps.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: PROCESS_STEPS[1] })).toBeVisible();

  const profiles = page.locator('[data-agent-profile]');
  await expect(profiles).toHaveCount(1);
  await expect(profiles).toContainText('Haruna Bayoh');
  await expect(profiles).toContainText('Architecture and material procurement');
  await expect(profiles).toContainText("Master's degree");
  await expect(profiles).toContainText('6 years');

  await expect(page.getByText('Hashy', { exact: true })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/choose (an|your) agent|select your agent/i);
  await expect(page.getByText('Meet Haruna.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('This is your agent.', { exact: true })).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Technical package' })).toBeVisible();
  await expect(page.getByText('Project-specific Revit files', { exact: true })).toBeVisible();
  await expect(page.locator('a[href*="/downloads/revit/"]')).toHaveCount(0);

  const factories = page.locator('[data-factory-record]');
  await expect(factories).toHaveCount(FACTORY_RECORDS.length);
  for (const [index, [factory, documents]] of FACTORY_RECORDS.entries()) {
    await expect(factories.nth(index)).toContainText(factory);
    for (const document of documents) {
      await expect(factories.nth(index)).toContainText(document);
    }
  }

  const download = page.getByRole('link', { name: 'Download procurement PDF', exact: true });
  await expect(download).toHaveAttribute(
    'href',
    '/downloads/harpa-pro-interior-procurement.pdf',
  );
  await expect(download).toHaveAttribute('download', '');

  const pdfResponse = await page.request.get('/downloads/harpa-pro-interior-procurement.pdf');
  expect(pdfResponse.ok()).toBe(true);
  expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
  expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe('%PDF');

  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.locator('main button')).toHaveCount(PROCESS_STEPS.length);
  await expect(
    page.getByRole('link', {
      name: /schedule (an )?(online )?meeting|join now/i,
    }),
  ).toHaveCount(0);
  await expect(page.locator('main a[href*="/api/"]')).toHaveCount(0);
});

test('links the agents page from shared navigation without mobile overflow', async ({ page }) => {
  await page.goto('/agents');

  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'Procurement',
      exact: true,
    }),
  ).toHaveAttribute('href', '/agents');
  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'App',
      exact: true,
    }),
  ).toHaveAttribute('href', '/#app');
  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'View documents',
      exact: true,
    }),
  ).toHaveAttribute('href', '/agents#documents');
  await expect(
    page.locator('footer').getByRole('link', {
      name: 'Procurement',
      exact: true,
    }),
  ).toHaveAttribute('href', '/agents');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('details.site-menu');
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();
  await expect(mobileMenu.getByRole('link', { name: 'Procurement', exact: true })).toHaveAttribute(
    'href',
    '/agents',
  );
  await expect(mobileMenu.getByRole('link', { name: 'App', exact: true })).toHaveAttribute(
    'href',
    '/#app',
  );
  await expect(
    mobileMenu.getByRole('link', { name: 'View documents', exact: true }),
  ).toHaveAttribute('href', '/agents#documents');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
