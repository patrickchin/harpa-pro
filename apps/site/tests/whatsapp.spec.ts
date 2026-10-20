import { expect, test } from '@playwright/test';

test('builds a first message from the topic and optional details', async ({ page }) => {
  await page.goto('/#contact');
  const topic = page.getByLabel('What would you like to do?');
  const details = page.getByLabel('Your project details');
  const preview = page.locator('[data-whatsapp-preview]');
  const link = page.getByRole('link', { name: 'Message on WhatsApp', exact: true });
  await expect(preview).toContainText('walk me through the process');

  const project = '20 oak desks & chairs for São Paulo\nTarget: March. Reference: <table> 家具 + 50%';
  await details.fill(project);
  for (const value of ['source', 'quality', 'brief', 'understand']) {
    await topic.selectOption(value);
    await expect(details).toHaveValue(project);
    await expect(preview).toContainText(project);
    const url = new URL((await link.getAttribute('href'))!);
    expect(url.origin).toBe('https://wa.me');
    const number = await page.getByText('+86 193 7283 7269', { exact: true }).innerText();
    expect(url.pathname).toBe(`/${number.replace(/\D/g, '')}`);
    expect(url.searchParams.get('text')).toBe(await preview.textContent());
    await expect(preview.locator('table')).toHaveCount(0);
  }

  await details.fill('   ');
  await expect(preview).not.toContainText(project);
  expect(new URL((await link.getAttribute('href'))!).searchParams.get('text'))
    .toBe(await preview.textContent());
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByText('Press Send there', { exact: false })).toBeVisible();
});

test('FAQ links select the matching topic and preserve details', async ({ page }) => {
  await page.goto('/');
  const details = page.getByLabel('Your project details');
  await details.fill('Hotel furniture, 60 rooms');
  for (const value of ['source', 'quality', 'brief', 'understand']) {
    await page.locator(`[data-whatsapp-topic="${value}"]`).click();
    await expect(page).toHaveURL(/#whatsapp-message$/);
    await expect(page.getByLabel('What would you like to do?')).toHaveValue(value);
    await expect(details).toBeFocused();
    await expect(details).toHaveValue('Hotel furniture, 60 rooms');
  }
  await page.getByLabel('What would you like to do?').focus();
  await page.keyboard.press('Tab');
  await expect(details).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Message on WhatsApp', exact: true })).toBeFocused();
});

test('message composer fits a narrow mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#contact');
  await page.getByLabel('What would you like to do?').selectOption('quality');
  await page.getByLabel('Your project details').fill('Product-reference-'.repeat(80));
  await expect(page.locator('[data-whatsapp-preview]')).toContainText('Product-reference-');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.getByRole('link', { name: 'Message on WhatsApp', exact: true })).toBeVisible();
});

test('keeps direct contact available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/#contact`);
  await expect(page.getByLabel('What would you like to do?')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Message on WhatsApp', exact: true }))
    .toHaveAttribute('href', 'https://wa.me/8619372837269');
  await expect(page.getByRole('link', { name: 'Open email app', exact: true }))
    .toHaveAttribute('href', 'mailto:haruna@harpapro.com');
  await context.close();
});
