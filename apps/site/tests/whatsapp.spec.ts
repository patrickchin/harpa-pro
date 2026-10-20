import { expect, test } from '@playwright/test';

test('keeps contact compact and opens one editable message on demand', async ({ page }) => {
  await page.goto('/#contact');
  const dialog = page.getByRole('dialog', { name: 'Start a conversation' });
  await expect(dialog).toBeHidden();
  expect(await page.locator('#whatsapp-message').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(260);
  await page.getByRole('link', { name: 'Message on WhatsApp', exact: true }).click();
  await expect(dialog).toBeVisible();
  const topic = dialog.getByLabel('I need help with');
  const draft = dialog.getByLabel('Your message');
  const link = dialog.getByRole('link', { name: 'Continue in WhatsApp' });
  await expect(topic).toBeFocused();
  const opening = await draft.inputValue();
  const details = '20 oak desks & chairs for São Paulo\nReference: <table> 家具 + 50%';
  await draft.fill(`${opening}\n${details}`);
  for (const value of ['source', 'quality', 'brief', 'understand']) {
    await topic.selectOption(value);
    expect(await draft.inputValue()).toContain(details);
    const url = new URL((await link.getAttribute('href'))!);
    expect(url.origin).toBe('https://wa.me');
    const number = await page.getByText('+86 193 7283 7269', { exact: true }).innerText();
    expect(url.pathname).toBe(`/${number.replace(/\D/g, '')}`);
    expect(url.searchParams.get('text')).toBe(await draft.inputValue());
  }
  await draft.fill('Hello, can you help with my hotel project?');
  await topic.selectOption('source');
  await expect(draft).toHaveValue('Hello, can you help with my hotel project?');
  expect(new URL((await link.getAttribute('href'))!).searchParams.get('text')).toBe(await draft.inputValue());
  await draft.fill('   ');
  expect(new URL((await link.getAttribute('href'))!).searchParams.get('text')).toContain('sourcing');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('link', { name: 'Message on WhatsApp', exact: true })).toBeFocused();
});

test('FAQ opens the matching topic and returns focus when closed', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Start a conversation' });
  for (const value of ['source', 'quality', 'brief', 'understand']) {
    const trigger = page.locator(`[data-whatsapp-topic="${value}"]`);
    await trigger.click();
    await expect(dialog.getByLabel('I need help with')).toHaveValue(value);
    await expect(dialog.getByLabel('I need help with')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Your message')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('link', { name: 'Continue in WhatsApp' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Close message helper' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test('message helper fits a narrow mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/#contact');
  await page.getByRole('link', { name: 'Message on WhatsApp', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a conversation' });
  await dialog.getByLabel('I need help with').selectOption('quality');
  await dialog.getByLabel('Your message').fill('Product-reference-'.repeat(80));
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(667);
  await expect(dialog.getByRole('link', { name: 'Continue in WhatsApp' })).toBeInViewport();
});

test('keeps direct contact available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/#contact`);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Message on WhatsApp', exact: true }))
    .toHaveAttribute('href', 'https://wa.me/8619372837269');
  await expect(page.getByRole('link', { name: 'Open email app', exact: true }))
    .toHaveAttribute('href', 'mailto:haruna@harpapro.com');
  await context.close();
});
