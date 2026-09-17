import { expect, test } from '@playwright/test';

const PROCESS_STEPS = [
  'Meet Haruna',
  'Match the right factory',
  'Place the order',
  'Track production',
  'Check quality',
  'Prepare shipment',
  'Follow delivery',
  'Complete the handover',
] as const;

const PROCESS_DESCRIPTIONS = [
  'Haruna reviews your brief, drawings, priorities, and finish requirements. She then makes a sourcing plan for the project.',
  'Haruna identifies factories that suit the product, materials, quantity, and finish requirements.',
  'The order moves into production after you confirm the scope, sample, price, and terms.',
  'Haruna follows the factory milestones and tells you when a change or delay needs a decision.',
  'The finished work is checked against the agreed specification before shipment.',
  'Haruna confirms the packing, quantities, documents, and collection details before the goods leave the factory.',
  'Haruna follows the shipment through handover and delivery. She records any issues while the details are clear.',
  'You review what arrived and record any open issues. The order closes after the handover is complete.',
] as const;

test('presents Haruna and an interactive static procurement journey', async ({ page }) => {
  await page.goto('/agents');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Meet Haruna.',
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

  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.locator('main button')).toHaveCount(PROCESS_STEPS.length);
  await expect(
    page.getByText(/schedule (an )?(online )?meeting|available|busy|join now/i),
  ).toHaveCount(0);
  await expect(page.locator('main a[href*="/api/"]')).toHaveCount(0);
});

test('links the agents page from shared navigation without mobile overflow', async ({ page }) => {
  await page.goto('/agents');

  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'Agents',
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
      name: 'Meet Haruna',
      exact: true,
    }),
  ).toHaveAttribute('href', '/agents');
  await expect(
    page.locator('footer').getByRole('link', {
      name: 'Agents',
      exact: true,
    }),
  ).toHaveAttribute('href', '/agents');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('details.site-menu');
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();
  await expect(mobileMenu.getByRole('link', { name: 'Agents', exact: true })).toHaveAttribute(
    'href',
    '/agents',
  );
  await expect(mobileMenu.getByRole('link', { name: 'App', exact: true })).toHaveAttribute(
    'href',
    '/#app',
  );
  await expect(mobileMenu.getByRole('link', { name: 'Meet Haruna', exact: true })).toHaveAttribute(
    'href',
    '/agents',
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
