import { expect, test } from '@playwright/test';

const CONSIDERATIONS = [
  {
    title: 'Design and specification',
    description:
      'Drawings, dimensions, finishes, quantities, and approval requirements are checked together before production information is issued.',
    image: 'Revit A104 coordination sheet with 3D interior views',
  },
  {
    title: 'Factory and product fit',
    description:
      'Factory capability, product range, production capacity, and the supplied records are reviewed against the project brief.',
    image: 'AIS joinery factory building in Foshan, China',
  },
  {
    title: 'Materials and compliance',
    description:
      'Material declarations and test reports are checked against the specified performance, emissions, fire, and maintenance requirements.',
    image: 'SGS test report supplied for an AIS joinery material package',
  },
  {
    title: 'Production quality',
    description:
      'Inspection points cover materials, workmanship, dimensions, finishes, and the condition of finished goods.',
    image: 'AIS factory worker reviewing finished white cabinet panels',
  },
  {
    title: 'Packing and delivery',
    description:
      'Packing, labels, collection, freight documents, and delivery records are checked against the order.',
    image: 'Crated AIS joinery being loaded into a delivery truck',
  },
] as const;

const FACTORY_PARTNERS = [
  {
    name: 'AIS Joinery',
    scope: 'Custom kitchens, wardrobes, bathroom vanities, interior doors, and project joinery.',
    source: 'https://www.aiskitchen.com/',
  },
  {
    name: 'Ningbo Langyao Lighting',
    scope: 'LED panel, ceiling, bulkhead, and solar lights.',
    source: 'https://langyaolighting.en.made-in-china.com/',
  },
  {
    name: 'Haining Mingyuan',
    scope: 'SPC and PVC flooring, matching profiles, and floor accessories.',
    source: 'https://mayerfloor.en.made-in-china.com/',
  },
  {
    name: 'Foshan Zhenglian / JLA',
    scope: 'Patterned and project ceramic tiles for interior wall and floor applications.',
    source: 'https://jlaceramic.en.made-in-china.com/',
  },
] as const;

test('presents Haruna and procurement considerations with matching evidence', async ({ page }) => {
  await page.goto('/procurement');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Interior procurement in China.',
    }),
  ).toBeVisible();

  const considerations = page.getByRole('tablist', {
    name: 'Procurement considerations',
  });
  const tabs = considerations.getByRole('tab');
  await expect(tabs).toHaveCount(CONSIDERATIONS.length);

  for (const [index, consideration] of CONSIDERATIONS.entries()) {
    const tab = tabs.nth(index);
    await expect(tab).toHaveText(consideration.title);
    await tab.click();

    const panel = page.getByRole('tabpanel', { name: consideration.title });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(consideration.description);
    await expect(panel.getByRole('img', { name: consideration.image })).toBeVisible();
  }

  await tabs.first().focus();
  await tabs.first().press('ArrowDown');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('tabpanel', { name: CONSIDERATIONS[1].title }),
  ).toBeVisible();

  const considerationSection = page.locator('#considerations');
  await expect(considerationSection).not.toContainText(/\bstage\b|\bstep\b/i);
  await expect(considerationSection.locator('ol')).toHaveCount(0);

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

  await expect(page.locator('main form')).toHaveCount(0);
  await expect(
    page.getByRole('link', {
      name: /schedule (an )?(online )?meeting|join now/i,
    }),
  ).toHaveCount(0);
  await expect(page.locator('main a[href*="/api/"]')).toHaveCount(0);
});

test('opens evidence images in an accessible dialog without leaving the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/procurement#evidence');

  const pageUrl = page.url();
  const drawingTrigger = page.getByRole('button', {
    name: 'Open full view of Revit A104 coordination review',
  });
  await drawingTrigger.click();

  await expect(page).toHaveURL(pageUrl);
  const drawingDialog = page.getByRole('dialog', {
    name: 'Full view: Revit A104 coordination review',
  });
  await expect(drawingDialog).toBeVisible();
  await expect(
    drawingDialog.getByRole('img', {
      name: 'Revit A104 3D coordination review sheet',
    }),
  ).toBeVisible();
  const drawingCaption = drawingDialog.getByText(
    'Three-dimensional room views used to coordinate layout, finishes, and interfaces.',
    { exact: true },
  );
  await expect(drawingCaption).toBeVisible();

  const desktopFit = await drawingDialog.evaluate((dialog) => {
    const bounds = dialog.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      clientHeight: document.documentElement.clientHeight,
      clientWidth: document.documentElement.clientWidth,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
    };
  });
  expect(desktopFit.left).toBeGreaterThanOrEqual(0);
  expect(desktopFit.top).toBeGreaterThanOrEqual(0);
  expect(desktopFit.right).toBeLessThanOrEqual(desktopFit.clientWidth);
  expect(desktopFit.bottom).toBeLessThanOrEqual(desktopFit.clientHeight);
  const captionBounds = await drawingCaption.boundingBox();
  expect(captionBounds).not.toBeNull();
  expect(
    (captionBounds?.y ?? Number.POSITIVE_INFINITY) + (captionBounds?.height ?? 0),
  ).toBeLessThanOrEqual(desktopFit.bottom);

  await drawingDialog
    .getByRole('button', { name: 'Close evidence image' })
    .click();
  await expect(drawingDialog).not.toBeVisible();
  await expect(drawingTrigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const recordTrigger = page.getByRole('button', {
    name: 'Open full view of Factory production control certificate',
  });
  await recordTrigger.click();
  const recordDialog = page.getByRole('dialog', {
    name: 'Full view: Factory production control certificate',
  });
  await expect(recordDialog).toBeVisible();
  await expect(
    recordDialog.getByRole('img', {
      name: 'Factory production control certificate supplied in the AIS material package',
    }),
  ).toBeVisible();

  const mobileOverflow = await recordDialog.evaluate((dialog) => {
    const imageRegion = dialog.querySelector<HTMLElement>(
      '[data-evidence-image-dialog-region]',
    );
    if (!imageRegion) throw new Error('Evidence image region is missing');
    return {
      dialogOverflow: dialog.scrollWidth - dialog.clientWidth,
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      regionOverflow: imageRegion.scrollWidth - imageRegion.clientWidth,
    };
  });
  expect(mobileOverflow.dialogOverflow).toBeLessThanOrEqual(1);
  expect(mobileOverflow.pageOverflow).toBeLessThanOrEqual(1);
  expect(mobileOverflow.regionOverflow).toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(recordDialog).not.toBeVisible();
  await expect(recordTrigger).toBeFocused();

  await drawingTrigger.click();
  await drawingDialog.evaluate((dialog) => {
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(drawingDialog).not.toBeVisible();
  await expect(drawingTrigger).toBeFocused();

  await expect(page.locator('[data-technical-review] > a')).toHaveCount(0);
  await expect(page.locator('[data-document-scan] > a')).toHaveCount(0);
});

test('shows technical reviews, factory scope, and supplied records directly', async ({ page }) => {
  await page.goto('/procurement#evidence');

  await expect(page.getByRole('heading', { name: 'Technical reviews' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Revit A104 3D coordination review sheet' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Revit A103 chair shop drawing review sheet' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Langyao ZYLO LED panel light specification sheet' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Langyao STAPE LED bulkhead specification sheet' })).toBeVisible();
  await expect(page.locator('[data-technical-review]')).toHaveCount(4);

  const factories = page.locator('[data-factory-partner]');
  await expect(factories).toHaveCount(FACTORY_PARTNERS.length);
  for (const [index, factory] of FACTORY_PARTNERS.entries()) {
    const card = factories.nth(index);
    await expect(card).toContainText(factory.name);
    await expect(card).toContainText(factory.scope);
    await expect(card.getByRole('img')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Manufacturer source' })).toHaveAttribute(
      'href',
      factory.source,
    );
  }

  await expect(page.getByRole('heading', { name: 'Documents supplied for review' })).toBeVisible();
  const suppliedRecords = page.locator('[data-document-scan]');
  await expect(suppliedRecords).toHaveCount(13);
  for (let index = 0; index < 13; index += 1) {
    await expect(suppliedRecords.nth(index).getByRole('img')).toBeVisible();
    await expect(suppliedRecords.nth(index).locator('figcaption')).not.toBeEmpty();
  }

  await expect(page.getByText('Factory production control certificate', { exact: true })).toBeVisible();
  await expect(page.getByText('RoHS test report', { exact: true })).toBeVisible();
  await expect(page.getByText('SPC flooring test report', { exact: true })).toBeVisible();
  await expect(page.getByText('Glazed tile performance report', { exact: true })).toBeVisible();

  await expect(page.getByRole('link', { name: /download procurement pdf/i })).toHaveCount(0);
  await expect(page.locator('a[href$=".pdf"]')).toHaveCount(0);

  const pdfResponse = await page.request.get('/downloads/harpa-pro-interior-procurement.pdf');
  expect(pdfResponse.status()).toBe(404);
});

test('links the evidence page from shared navigation without mobile overflow', async ({ page }) => {
  await page.goto('/procurement');

  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'Procurement',
      exact: true,
    }),
  ).toHaveAttribute('href', '/procurement');
  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'App',
      exact: true,
    }),
  ).toHaveAttribute('href', '/app');
  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'App guides',
      exact: true,
    }),
  ).toHaveAttribute('href', '/docs');
  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'App roadmap',
      exact: true,
    }),
  ).toHaveAttribute('href', '/roadmap');
  await expect(
    page.locator('header nav').getByRole('link', {
      name: 'View evidence',
      exact: true,
    }),
  ).toHaveAttribute('href', '/procurement#evidence');
  await expect(
    page.locator('footer').getByRole('link', {
      name: 'Overview',
      exact: true,
    }).first(),
  ).toHaveAttribute('href', '/procurement');
  await expect(page.locator('footer').getByText('Harpa Pro app', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('details.site-menu');
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();
  await expect(mobileMenu.getByRole('link', { name: 'Procurement', exact: true })).toHaveAttribute(
    'href',
    '/procurement',
  );
  await expect(mobileMenu.getByRole('link', { name: 'App', exact: true })).toHaveAttribute(
    'href',
    '/app',
  );
  await expect(
    mobileMenu.getByRole('link', { name: 'View evidence', exact: true }),
  ).toHaveAttribute('href', '/procurement#evidence');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
