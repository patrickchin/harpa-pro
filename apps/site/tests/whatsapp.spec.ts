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
  await expect(dialog.getByLabel('What would you like to know?')).toBeVisible();
  await expect(dialog.getByLabel('What are you looking for?')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Help me write a message' })).toBeFocused();
});

test('tailors every topic and previews the exact message with custom materials and notes', async ({ page }) => {
  await page.goto('/#contact');
  await page.getByRole('button', { name: 'Help me write a message' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tell us what you need' });
  const topic = dialog.getByLabel('I need help with');
  const products = dialog.locator('#whatsapp-products');
  const destination = dialog.getByLabel('Where should it be delivered?');
  const otherMaterials = dialog.getByLabel('Other materials');
  const notes = dialog.locator('#whatsapp-notes');
  const link = dialog.getByRole('link', { name: 'Continue in WhatsApp' });
  const message = async () => new URL((await link.getAttribute('href'))!).searchParams.get('text')!;
  expect(await message()).toBe('Hi Harpa Pro, how can you help with interior procurement in China?');
  await topic.selectOption('source');
  const productText = '20 desks & chairs <table> 家具 + 50%';
  await products.fill(productText);
  await destination.fill('São Paulo, Brazil');
  await dialog.locator('[data-whatsapp-materials] summary').click();
  await dialog.getByRole('checkbox', { name: 'Wood', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Metal', exact: true }).check();
  await otherMaterials.fill('Bamboo & rattan');
  await notes.fill('Can you check the finish? <script>test</script>');
  await dialog.getByText('Preview WhatsApp message', { exact: true }).click();
  const preview = dialog.locator('[data-whatsapp-message]');
  const topics = [
    { value: 'source', prompt: 'What are you looking for?', subject: 'Products', note: 'Notes', intro: 'sourcing furniture' },
    { value: 'quality', prompt: 'What needs checking?', subject: 'Goods to check', note: 'Checks requested', intro: 'checking materials or production quality' },
    { value: 'brief', prompt: 'What is the project?', subject: 'Project', note: 'Notes', intro: 'start an interior procurement project' },
    { value: 'understand', prompt: '', subject: '', note: 'Question', intro: 'how can you help with interior procurement' },
  ];
  for (const entry of topics) {
    await topic.selectOption(entry.value);
    const text = await message();
    expect(text).toContain(entry.intro);
    expect(await preview.textContent()).toBe(text);
    if (entry.value !== 'source') {
      await expect(notes).toHaveValue('');
      await notes.fill(`Details for ${entry.value} <script>test</script>`);
    }
    expect(await message()).toContain(`${entry.note}: ${await notes.inputValue()}`);
    expect(await preview.textContent()).toBe(await message());
    await expect(preview.locator('script, table')).toHaveCount(0);
    if (entry.value === 'understand') {
      await expect(products).toBeHidden();
      await expect(dialog.locator('[data-whatsapp-materials]')).toBeHidden();
      expect(text).not.toMatch(/Products:|materials:|Delivery:/);
    } else {
      await expect(dialog.getByLabel(entry.prompt)).toHaveValue(productText);
      expect(text).toContain(`${entry.subject}: ${productText}`);
      expect(text).toContain('Wood, Metal, Bamboo & rattan');
    }
    if (entry.value === 'source' || entry.value === 'brief') {
      await expect(destination).toBeVisible();
      expect(text).toContain('Delivery: São Paulo, Brazil');
    } else {
      await expect(destination).toBeHidden();
      expect(text).not.toContain('Delivery:');
    }
  }
  await topic.selectOption('source');
  await expect(notes).toHaveValue('Can you check the finish? <script>test</script>');
  await dialog.getByRole('button', { name: 'Close message helper' }).click();
  await page.getByRole('button', { name: 'Help me write a message' }).click();
  await expect(products).toHaveValue(productText);
  await expect(otherMaterials).toHaveValue('Bamboo & rattan');
  await expect(dialog.getByRole('checkbox', { name: 'Wood', exact: true })).toBeChecked();
  await products.fill('   ');
  await destination.fill('');
  await otherMaterials.fill('');
  await notes.fill('');
  await dialog.getByRole('checkbox', { name: 'Wood', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Metal', exact: true }).uncheck();
  expect(await message()).not.toMatch(/Products:|materials:|Delivery:|Notes:|undefined|false|0/);
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
    await expect(value === 'understand' ? dialog.getByLabel('What would you like to know?') : dialog.locator('#whatsapp-products')).toBeFocused();
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
  await dialog.getByLabel('I need help with').selectOption('quality');
  await dialog.locator('[data-whatsapp-materials] summary').click();
  await dialog.getByRole('checkbox', { name: 'Stone / marble', exact: true }).check();
  await dialog.getByLabel('Other materials').fill('Ceramic');
  await dialog.getByLabel('What should we check?').fill('Please check for cracks.');
  await dialog.getByText('Preview WhatsApp message', { exact: true }).click();
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
