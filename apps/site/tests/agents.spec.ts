import { expect, test } from '@playwright/test';

const CONSIDERATIONS = [
  {
    title: 'Design and specification',
    description:
      'We check the drawings, dimensions, finishes, quantities, and approval requirements before the factory starts production.',
    image: 'Revit A104 coordination sheet with 3D interior views',
  },
  {
    title: 'Factory and product fit',
    description:
      "We compare the factory's capability, product range, production capacity, and records with the project brief.",
    image: 'AIS Smarti headquarters and factory in Foshan, China',
  },
  {
    title: 'Materials and compliance',
    description:
      "We compare material declarations and test reports with the project's performance, emission, fire, and maintenance requirements.",
    image: 'First page of the AIS marine HDF formaldehyde test report',
  },
  {
    title: 'Production quality',
    description:
      'We inspect materials, workmanship, dimensions, finishes, and finished goods at agreed points during production.',
    image: 'AIS Smarti production lines and factory floor',
  },
  {
    title: 'Packing and delivery',
    description:
      'We check packing, labels, collection, freight documents, and delivery records against the order.',
    image: 'AIS Smarti pallet and flat-pack packing examples',
  },
] as const;

const FACTORY_PARTNERS = [
  {
    name: 'AIS Smarti',
    scope:
      'Custom cabinetry, wardrobes, bathroom cabinets, doors, wall panels, and project joinery.',
  },
  {
    name: 'J2S',
    scope: 'Custom furniture for restaurants, cafes, bars, hotel lobbies, and public areas.',
  },
  {
    name: 'Kenuo',
    scope: 'Wood office desks, workstations, meeting tables, storage, and seating.',
  },
  {
    name: 'Masyounger',
    scope: 'Steel filing cabinets, lockers, shelving, workbenches, and school furniture.',
  },
  {
    name: 'Rong Shuo',
    scope: 'Bathroom cabinets, mirrors, shower enclosures, and prefabricated bathroom systems.',
  },
] as const;

const BUYER_INFORMATION = [
  'Product or model reference',
  'Intended use and configuration',
  'Dimensions and permitted variation',
  'Materials and construction',
  'Finish, color, and hardware',
  'Applicable test reports or certificates',
  'Quantity and packing method',
  'Quotation basis, lead time, and items to confirm',
] as const;

const PRODUCT_BRIEFS = [
  'AIS custom kitchen joinery',
  'J2S JSBC hospitality seating',
  'Rong Shuo SW-011 shower enclosure',
] as const;

const CREDENTIALS = [
  'Marine HDF formaldehyde test',
  'HMR particleboard formaldehyde test',
  'OSB formaldehyde test',
  'PUR adhesive VOC test',
  'Hot-melt adhesive RoHS test',
  'E1 board formaldehyde report',
  'Wanhua Ecoboard production-control certificate',
  'Sofa formaldehyde test',
  'Sofa E1 certificate',
  'European representative appointment',
] as const;

test('presents Haruna and procurement considerations with matching evidence', async ({ page }) => {
  await page.goto('/procurement');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Interior procurement in China',
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
  await expect(page.getByRole('tabpanel', { name: CONSIDERATIONS[1].title })).toBeVisible();

  const considerationSection = page.locator('#considerations');
  await expect(considerationSection).not.toContainText(/\bstage\b|\bstep\b/i);
  await expect(considerationSection.locator('ol')).toHaveCount(0);

  const profiles = page.locator('[data-single-agent-profile]');
  await expect(profiles).toHaveCount(1);
  await expect(profiles).toContainText('Haruna Bayoh');
  await expect(profiles).toContainText("Haruna is Harpa Pro's procurement lead in China.");
  await expect(profiles).toContainText("Master's degree");
  await expect(profiles).toContainText('6 years');
  await expect(profiles).toContainText('Technical coordination');
  await expect(profiles).toContainText('Factory coordination');
  await expect(profiles).toContainText('Order control');
  await expect(profiles).toContainText('Document record');
  await expect(profiles.getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute(
    'href',
    'https://www.linkedin.com/in/harunabayoh/',
  );
  await expect(profiles.getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(page.locator('[data-agent-card]')).toHaveCount(0);

  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 2, name: 'Project evidence' })).toBeVisible();
  await expect(main.getByText('Harpa Pro procurement', { exact: true })).toHaveCount(0);
  await expect(main.getByText('Service scope', { exact: true })).toHaveCount(0);
  await expect(main.getByText('Procurement review', { exact: true })).toHaveCount(0);
  await expect(main.getByText('Factory source library', { exact: true })).toHaveCount(0);
  await expect(main.getByText('Review area', { exact: true })).toHaveCount(0);

  const headingLevels = await main.locator('h1, h2, h3, h4, h5, h6').evaluateAll((headings) =>
    headings
      .filter((heading) => heading.getClientRects().length > 0)
      .map((heading) => Number(heading.tagName.slice(1))),
  );
  expect(headingLevels.filter((level) => level === 1)).toHaveLength(1);
  for (const [index, level] of headingLevels.entries()) {
    if (index === 0) continue;
    expect(level - headingLevels[index - 1]!).toBeLessThanOrEqual(1);
  }

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

test('opens evidence images in an accessible dialog without leaving the page', async ({ page }) => {
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
    'We use three-dimensional room views to check the layout, finishes, and interfaces before we approve the factory information.',
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

  await drawingDialog.getByRole('button', { name: 'Close evidence image' }).click();
  await expect(drawingDialog).not.toBeVisible();
  await expect(drawingTrigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const recordTrigger = page.getByRole('button', {
    name: 'Open full view of Marine HDF formaldehyde test',
  });
  await recordTrigger.click();
  const recordDialog = page.getByRole('dialog', {
    name: 'Full view: Marine HDF formaldehyde test',
  });
  await expect(recordDialog).toBeVisible();
  await expect(
    recordDialog.getByRole('img', {
      name: 'First page of the AIS marine HDF formaldehyde test report',
    }),
  ).toBeVisible();
  await expect(recordDialog.getByRole('link', { name: 'Open original PDF' })).toHaveAttribute(
    'href',
    '/documents/factories/ais/ais-hdf-formaldehyde-e0-2026.pdf',
  );

  const mobileOverflow = await recordDialog.evaluate((dialog) => {
    const imageRegion = dialog.querySelector<HTMLElement>('[data-evidence-image-dialog-region]');
    if (!imageRegion) throw new Error('Evidence image region is missing');
    return {
      dialogOverflow: dialog.scrollWidth - dialog.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
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

test('shows source factories, representative briefs, and original records', async ({ page }) => {
  await page.goto('/procurement#evidence');

  await expect(page.getByRole('heading', { name: 'Technical reviews' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Revit A104 3D coordination review sheet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Revit A103 chair shop drawing review sheet' }),
  ).toBeVisible();
  await expect(page.locator('[data-technical-review]')).toHaveCount(2);

  const factories = page.locator('[data-factory-partner]');
  await expect(factories).toHaveCount(FACTORY_PARTNERS.length);
  for (const [index, factory] of FACTORY_PARTNERS.entries()) {
    const card = factories.nth(index);
    await expect(card).toContainText(factory.name);
    await expect(card).toContainText(factory.scope);
    await expect(card.getByRole('img')).toBeVisible();
    await expect(card).toContainText('Source files');
  }
  await expect(page.getByText('Ningbo Langyao Lighting', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Haining Mingyuan', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Foshan Zhenglian / JLA', { exact: true })).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Product examples' })).toBeVisible();
  for (const label of BUYER_INFORMATION) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  const briefs = page.locator('[data-product-brief]');
  await expect(briefs).toHaveCount(PRODUCT_BRIEFS.length);
  for (const [index, title] of PRODUCT_BRIEFS.entries()) {
    await expect(briefs.nth(index)).toContainText(title);
    await expect(briefs.nth(index).getByRole('img')).toBeVisible();
  }

  await expect(page.getByRole('heading', { name: 'Factory documents' })).toBeVisible();
  const suppliedRecords = page.locator('[data-credential-record]');
  await expect(suppliedRecords).toHaveCount(CREDENTIALS.length);
  for (const [index, title] of CREDENTIALS.entries()) {
    const record = suppliedRecords.nth(index);
    await expect(record).toContainText(title);
    await expect(record.getByRole('img')).toBeVisible();
    await expect(record.getByRole('button', { name: `Open full view of ${title}` })).toBeVisible();
  }

  const originalDocuments = await suppliedRecords
    .locator('[data-evidence-document-href]')
    .evaluateAll((triggers) =>
      triggers.map((trigger) => (trigger as HTMLElement).dataset.evidenceDocumentHref),
    );
  expect(new Set(originalDocuments).size).toBe(CREDENTIALS.length);
  for (const href of originalDocuments) {
    expect(href).toBeTruthy();
    const response = await page.request.get(href!);
    expect(response.status(), href).toBe(200);
    expect(response.headers()['content-type'], href).toMatch(/application\/pdf|image\/jpeg/);
  }

  await expect(
    page.getByText(
      'Factory-supplied document. Harpa Pro has not independently verified its current status or scope.',
      { exact: true },
    ),
  ).toBeVisible();

  const expiredRecord = page.locator('[data-credential-status="expired"]');
  await expect(expiredRecord).toHaveCount(1);
  await expect(expiredRecord).toContainText('Expired 15 July 2026');

  await expect(page.getByRole('link', { name: /download procurement pdf/i })).toHaveCount(0);
  await expect(page.locator('a[href*="/catalogues/"]')).toHaveCount(0);

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
    page
      .locator('footer')
      .getByRole('link', {
        name: 'Overview',
        exact: true,
      })
      .first(),
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
