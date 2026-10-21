import { expect, test } from '@playwright/test';

test('offers independent direct WhatsApp and guided actions', async ({ page, context }) => {
  await context.route('https://wa.me/**', (route) => route.fulfill({ body: 'WhatsApp test destination' }));
  await page.goto('/#contact');
  const dialog = page.getByRole('dialog', { name: 'Tell us what you need' });
  const direct = page.getByRole('link', { name: 'Message on WhatsApp', exact: true });
  await expect(dialog).toBeHidden();
  expect(await page.locator('#whatsapp-message').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(300);
  const popupPromise = page.waitForEvent('popup');
  await direct.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://wa.me/8619372837269');
  await popup.close();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Help me write a message' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('I need help with')).toBeFocused();
  await expect(dialog.locator('textarea')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Help me write a message' })).toBeFocused();
});

test('builds a brief from optional answers and multiple materials', async ({ page }) => {
  await page.goto('/#contact');
  await page.getByRole('button', { name: 'Help me write a message' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tell us what you need' });
  const topic = dialog.getByLabel('I need help with');
  const products = dialog.getByLabel('What are you looking for?');
  const destination = dialog.getByLabel('Where should it be delivered?');
  const link = dialog.getByRole('link', { name: 'Continue in WhatsApp' });
  const message = async () => new URL((await link.getAttribute('href'))!).searchParams.get('text')!;
  expect(await message()).toBe('Hi Harpa Pro, how can you help with interior procurement in China?');
  const productText = '20 desks & chairs <table> 家具 + 50%';
  await products.fill(productText);
  await destination.fill('São Paulo, Brazil');
  await dialog.getByRole('checkbox', { name: 'Wood', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Metal', exact: true }).check();
  for (const value of ['source', 'quality', 'brief', 'understand']) {
    await topic.selectOption(value);
    await expect(products).toHaveValue(productText);
    await expect(destination).toHaveValue('São Paulo, Brazil');
    expect(await message()).toContain(`Products: ${productText}`);
    expect(await message()).toContain('Preferred materials: Wood, Metal');
    expect(await message()).toContain('Delivery: São Paulo, Brazil');
  }
  expect((await message()).startsWith('Hi Harpa Pro, how can you help')).toBe(true);
  await dialog.getByRole('button', { name: 'Close message helper' }).click();
  await page.getByRole('button', { name: 'Help me write a message' }).click();
  await expect(products).toHaveValue(productText);
  await expect(dialog.getByRole('checkbox', { name: 'Wood', exact: true })).toBeChecked();
  await products.fill('   ');
  await destination.fill('');
  await dialog.getByRole('checkbox', { name: 'Wood', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Metal', exact: true }).uncheck();
  expect(await message()).not.toMatch(/Products:|materials:|Delivery:|undefined|false|0/);
  const url = new URL((await link.getAttribute('href'))!);
  const number = await page.getByText('+86 193 7283 7269', { exact: true }).innerText();
  expect(url.origin).toBe('https://wa.me');
  expect(url.pathname).toBe(`/${number.replace(/\D/g, '')}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('FAQ opens the matching topic and returns focus when closed', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Tell us what you need' });
  for (const value of ['source', 'quality', 'brief', 'understand']) {
    const trigger = page.locator(`[data-whatsapp-topic="${value}"]`);
    await trigger.click();
    await expect(dialog.getByLabel('I need help with')).toHaveValue(value);
    await expect(dialog.getByLabel('I need help with')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('What are you looking for?')).toBeFocused();
    await dialog.getByRole('button', { name: 'Close message helper' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test('guided brief stays bounded on a narrow mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/#contact');
  await page.getByRole('button', { name: 'Help me write a message' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tell us what you need' });
  await dialog.getByRole('checkbox', { name: 'Stone / marble', exact: true }).check();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(667);
  await dialog.getByRole('link', { name: 'Continue in WhatsApp' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('link', { name: 'Continue in WhatsApp' })).toBeInViewport();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('keeps direct contact available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/#contact`);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Help me write a message' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Message on WhatsApp', exact: true }))
    .toHaveAttribute('href', 'https://wa.me/8619372837269');
  await expect(page.getByRole('link', { name: 'Open email app', exact: true }))
    .toHaveAttribute('href', 'mailto:haruna@harpapro.com');
  await context.close();
});
