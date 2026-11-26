import { expect, test } from '@playwright/test';

const WIDTHS = [390, 768, 1280] as const;

test('places each consideration panel directly under its tab below lg', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Load without the hash so the smooth fragment scroll cannot race the
  // centred tab positions below.
  await page.goto('/');

  const tabs = page.getByRole('tablist', { name: 'Procurement considerations' }).getByRole('tab');
  const count = await tabs.count();
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    await tab.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const topBefore = (await tab.boundingBox())!.y;
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');

    const tabBox = (await tab.boundingBox())!;
    // The tapped tab stays put even when an earlier panel collapses.
    expect(Math.abs(tabBox.y - topBefore), `tab ${index}`).toBeLessThanOrEqual(2);

    const panelBox = (await page.getByRole('tabpanel').boundingBox())!;
    const gap = panelBox.y - (tabBox.y + tabBox.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(16);
    expect(panelBox.y).toBeLessThan(844);
  }

  await tabs.nth(count - 1).focus();
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await expect(tabs.first()).toBeInViewport();
});

test('keeps consideration tabs in one row above the panel on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#considerations');

  const tabs = page.getByRole('tablist', { name: 'Procurement considerations' }).getByRole('tab');
  const tops = await tabs.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);

  await tabs.last().click();
  const bottoms = await tabs.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().bottom),
  );
  const panelBox = (await page.getByRole('tabpanel').boundingBox())!;
  expect(panelBox.y).toBeGreaterThan(Math.max(...bottoms));
  const tablistBox = await tabs.evaluateAll((elements) => {
    const first = elements[0]!.getBoundingClientRect();
    const last = elements[elements.length - 1]!.getBoundingClientRect();
    return { left: first.left, right: last.right };
  });
  expect(Math.abs(panelBox.x - tablistBox.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(panelBox.x + panelBox.width - tablistBox.right)).toBeLessThanOrEqual(1);
});

test('keeps evidence metadata readable and document grids free of orphans', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#evidence');

    const smallestMono = await page
      .locator('#evidence')
      .evaluateAll((sections) =>
        Math.min(
          ...sections.flatMap((section) =>
            Array.from(section.querySelectorAll<HTMLElement>('.font-mono'))
              .filter((element) => element.getClientRects().length > 0)
              .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
          ),
        ),
      );
    expect(smallestMono, `${width}px mono font size`).toBeGreaterThanOrEqual(12);

    for (const label of await page.locator('[data-product-brief]').getByText(/^Example \d+$/).all()) {
      const { height, lineHeight } = await label.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      }));
      expect(height, `${width}px example label wraps`).toBeLessThanOrEqual(lineHeight + 1);
    }

    await page.goto('/procurement/factory-documents');
    const rows = await page.locator('#factory-document-grid').evaluate((grid) => {
      const tops = Array.from(grid.children)
        .filter((card) => card.getClientRects().length > 0)
        .map((card) => Math.round(card.getBoundingClientRect().top));
      const perRow = new Map<number, number>();
      for (const top of tops) perRow.set(top, (perRow.get(top) ?? 0) + 1);
      return Array.from(perRow.values());
    });
    expect(new Set(rows).size, `${width}px document rows: ${rows.join(', ')}`).toBe(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${width}px factory documents overflow`,
    ).toBe(true);
  }

  await page.goto('/#evidence');
  await page.setViewportSize({ width: 1280, height: 900 });
  const [section, featured] = await Promise.all([
    page.locator('#factory-partners').boundingBox(),
    page.locator('[data-factory-featured="true"]').boundingBox(),
  ]);
  expect(featured!.width).toBeGreaterThanOrEqual(section!.width - 1);
});

for (const path of ['/nope', '/reports/account-deletion']) {
  test(`pins the footer to the viewport bottom on short page ${path}`, async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1400 });
      await page.goto(path);
      const { footerBottom, viewport, scrollHeight } = await page.evaluate(() => ({
        footerBottom: document.querySelector('footer')!.getBoundingClientRect().bottom,
        viewport: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      if (scrollHeight <= viewport) {
        expect(Math.abs(footerBottom - viewport), `${width}px footer`).toBeLessThanOrEqual(1);
      } else {
        expect(footerBottom, `${width}px footer`).toBeGreaterThan(viewport);
      }
    }
  });
}

test('aligns account deletion content with the header', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/reports/account-deletion');
    const headerContentLeft = await page.locator('header > div').first().evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left + Number.parseFloat(getComputedStyle(element).paddingLeft);
    });
    const headingBox = await page.getByRole('heading', { level: 1, name: 'Account deletion' }).boundingBox();
    expect(Math.abs(headingBox!.x - headerContentLeft), `${width}px`).toBeLessThanOrEqual(1);
    const prose = await page.locator('main section').first().boundingBox();
    expect(prose!.width).toBeLessThanOrEqual(48 * 16 + 1);
  }
});
