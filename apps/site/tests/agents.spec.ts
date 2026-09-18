import { expect, test } from '@playwright/test';

const CONSIDERATIONS = [
  {
    title: 'Design and specification',
    description:
      'We check the drawings, dimensions, finishes, quantities, and approval requirements before the factory starts production.',
    image: 'Revit A104 coordination sheet with 3D interior views',
    fit: 'contain',
  },
  {
    title: 'Factory and product fit',
    description:
      "We compare the factory's capability, product range, production capacity, and records with the project brief.",
    image: 'AIS Smarti headquarters and factory in Foshan, China',
    fit: 'cover',
  },
  {
    title: 'Materials and compliance',
    description:
      "We compare material declarations and test reports with the project's performance, emission, fire, and maintenance requirements.",
    image: 'First page of the AIS marine HDF formaldehyde test report',
    fit: 'contain',
  },
  {
    title: 'Production quality',
    description:
      'We inspect materials, workmanship, dimensions, finishes, and finished goods at agreed points during production.',
    image: 'AIS Smarti production lines and factory floor',
    fit: 'cover',
  },
  {
    title: 'Packing and delivery',
    description:
      'We check packing, labels, collection, freight documents, and delivery records against the order.',
    image: 'AIS Smarti pallet and flat-pack packing examples',
    fit: 'cover',
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
  { title: 'AIS custom kitchen joinery', imageMode: 'cover' },
  { title: 'J2S JSBC hospitality seating', imageMode: 'cover' },
  { title: 'Rong Shuo SW-011 shower enclosure', imageMode: 'source-content' },
] as const;

const CREDENTIALS = [
  'Marine HDF formaldehyde test',
  'Hot-melt adhesive RoHS test',
  'Sofa E1 certificate',
  'HMR particleboard formaldehyde test',
  'OSB formaldehyde test',
  'PUR adhesive VOC test',
  'E1 board formaldehyde report',
  'Wanhua Ecoboard production-control certificate',
  'Sofa formaldehyde test',
  'European representative appointment',
] as const;

const INITIAL_CREDENTIALS = CREDENTIALS.slice(0, 3);

const FIRST_CREDENTIAL_DESCRIPTION =
  'The report names AIS JOINERY PTY LTD as the applicant. It records a GB 18580-2025 E0 pass result for marine HDF.';

test('presents Haruna and procurement considerations with matching evidence', async ({ page }) => {
  await page.goto('/');

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
    const image = panel.getByRole('img', { name: consideration.image });
    await expect(image).toBeVisible();
    expect(await image.evaluate((element) => getComputedStyle(element).objectFit)).toBe(
      consideration.fit,
    );
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

  const headingLevels = await main
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((headings) =>
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

test('crops embedded source captions and fills photographic frames', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#considerations');

  await page.getByRole('tab', { name: 'Factory and product fit' }).click();
  const considerationPanel = page.getByRole('tabpanel', {
    name: 'Factory and product fit',
  });
  const considerationFrame = considerationPanel.locator(
    '[data-consideration-image-frame]',
  );
  const considerationImage = considerationFrame.getByRole('img', {
    name: 'AIS Smarti headquarters and factory in Foshan, China',
  });

  await expect(considerationFrame).toHaveAttribute(
    'data-image-crop',
    'embedded-caption',
  );
  await expect(considerationImage).toBeVisible();

  const factories = page.locator('[data-factory-partner]');
  await expect(factories.locator('[data-factory-image-frame]')).toHaveCount(
    FACTORY_PARTNERS.length,
  );

  const aisFactory = factories.filter({ hasText: 'AIS Smarti' });
  const aisFactoryFrame = aisFactory.locator('[data-factory-image-frame]');
  const aisFactoryImage = aisFactoryFrame.getByRole('img');
  await expect(aisFactoryFrame).toHaveAttribute(
    'data-image-crop',
    'embedded-caption',
  );
  await expect(aisFactoryImage).toBeVisible();

  for (const [frame, image] of [
    [considerationFrame, considerationImage],
    [aisFactoryFrame, aisFactoryImage],
  ] as const) {
    const [frameBox, imageBox] = await Promise.all([
      frame.boundingBox(),
      image.boundingBox(),
    ]);
    expect(frameBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.width).toBeGreaterThan(frameBox!.width + 10);
    expect(imageBox!.height).toBeGreaterThan(frameBox!.height + 10);
  }

  for (const frame of await factories.locator('[data-factory-image-frame]').all()) {
    const image = frame.getByRole('img');
    const [frameBox, imageBox] = await Promise.all([
      frame.boundingBox(),
      image.boundingBox(),
    ]);
    expect(frameBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.width).toBeGreaterThanOrEqual(frameBox!.width - 1);
    expect(imageBox!.height).toBeGreaterThanOrEqual(frameBox!.height - 1);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  const featuredCardBox = await aisFactory.boundingBox();
  const featuredFrameBox = await aisFactoryFrame.boundingBox();
  expect(featuredCardBox).not.toBeNull();
  expect(featuredFrameBox).not.toBeNull();
  expect(featuredFrameBox!.height).toBeGreaterThanOrEqual(
    featuredCardBox!.height - 2,
  );
});

test('opens evidence images in an accessible dialog without leaving the page', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#evidence');

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
  await expect(recordDialog.getByRole('link')).toHaveCount(0);

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

test('shows compact factory examples and progressively discloses document previews', async ({
  page,
}) => {
  await page.goto('/#evidence');

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
  await expect(
    page.getByRole('heading', { level: 3, name: 'Selected factory partners' }),
  ).toBeVisible();
  await expect(
    page.getByText('These are selected examples, not a complete factory directory.', {
      exact: false,
    }),
  ).toBeVisible();
  for (const [index, factory] of FACTORY_PARTNERS.entries()) {
    const card = factories.nth(index);
    await expect(card).toContainText(factory.name);
    await expect(card).toContainText(factory.scope);
    await expect(card.getByRole('img')).toBeVisible();
    await expect(card).not.toContainText('Source files');
    await expect(card).not.toContainText('How we use them');
  }
  await expect(factories.first()).toHaveAttribute('data-factory-featured', 'true');
  await expect(page.getByText('Ningbo Langyao Lighting', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Haining Mingyuan', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Foshan Zhenglian / JLA', { exact: true })).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Product examples' })).toBeVisible();
  for (const label of BUYER_INFORMATION) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  const briefs = page.locator('[data-product-brief]');
  await expect(briefs).toHaveCount(PRODUCT_BRIEFS.length);
  for (const [index, brief] of PRODUCT_BRIEFS.entries()) {
    const card = briefs.nth(index);
    await expect(card).toContainText(brief.title);
    const frame = card.locator('[data-product-image-frame]');
    const image = frame.getByRole('img');
    await expect(frame).toHaveAttribute('data-product-image-mode', brief.imageMode);
    await expect(image).toBeVisible();

    const [frameBox, imageBox] = await Promise.all([frame.boundingBox(), image.boundingBox()]);
    expect(frameBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.width).toBeGreaterThanOrEqual(frameBox!.width - 1);
    expect(imageBox!.height).toBeGreaterThanOrEqual(frameBox!.height - 1);
  }

  await expect(page.getByRole('heading', { name: 'Factory documents' })).toBeVisible();
  const suppliedRecords = page.locator('[data-credential-record]');
  await expect(suppliedRecords).toHaveCount(CREDENTIALS.length);
  for (const title of INITIAL_CREDENTIALS) {
    const record = suppliedRecords.filter({ hasText: title });
    await expect(record).toContainText(title);
    await expect(record.getByRole('img')).toBeVisible();
    await expect(record.getByRole('button', { name: `Open full view of ${title}` })).toBeVisible();

    const preview = record.locator('[data-document-preview-crop]');
    await expect(preview).toBeVisible();
    const previewStyle = await preview.evaluate((region) => {
      const image = region.querySelector('img');
      if (!image) throw new Error('Document preview image is missing');
      const style = window.getComputedStyle(image);
      return {
        aspectRatio: region.clientWidth / region.clientHeight,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
      };
    });
    expect(previewStyle.aspectRatio).toBeGreaterThan(2);
    expect(previewStyle.objectFit).toBe('cover');
    expect(previewStyle.objectPosition).toMatch(/50% 0%/);
  }

  await expect(suppliedRecords.first()).not.toContainText(FIRST_CREDENTIAL_DESCRIPTION);

  for (const title of CREDENTIALS.slice(3)) {
    await expect(suppliedRecords.filter({ hasText: title })).not.toBeVisible();
  }

  const moreDocuments = page.locator('[data-document-disclosure]');
  await expect(moreDocuments).toHaveAttribute('aria-expanded', 'false');
  await moreDocuments.click();
  await expect(moreDocuments).toHaveAttribute('aria-expanded', 'true');
  await expect(moreDocuments).toHaveText('Show fewer documents');

  for (const title of CREDENTIALS) {
    const record = suppliedRecords.filter({ hasText: title });
    await expect(record).toBeVisible();
    await expect(record.getByRole('button', { name: `Open full view of ${title}` })).toBeVisible();
  }

  await expect(page.locator('[data-evidence-document-href]')).toHaveCount(0);
  await expect(page.locator('a[href^="/documents/factories/"]')).toHaveCount(0);

  const oldDocument = await page.request.get(
    '/documents/factories/ais/ais-hdf-formaldehyde-e0-2026.pdf',
  );
  expect(oldDocument.status()).not.toBe(200);
  expect(oldDocument.headers()['content-type'] ?? '').not.toMatch(/application\/pdf/);

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

test('offers copy-first email and WhatsApp contact actions without a form', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          window.localStorage.setItem('copied-email', value);
        },
      },
    });
  });
  await page.goto('/#contact');

  const contact = page.locator('#contact');
  await expect(contact.getByRole('heading', { level: 2, name: 'Contact Haruna' })).toBeVisible();
  await expect(contact.getByText('haruna@harpapro.com', { exact: true })).toBeVisible();
  await expect(contact.getByText('+86 193 7283 7269', { exact: true })).toBeVisible();

  const emailActions = contact.locator('[data-contact-email-actions]');
  const copyEmail = emailActions.getByRole('button', { name: 'Copy email' });
  await expect(emailActions.locator('button, a').first()).toHaveAttribute('data-copy-email', '');
  await copyEmail.click();
  await expect(contact.getByRole('status')).toHaveText('Email copied');
  expect(await page.evaluate(() => window.localStorage.getItem('copied-email'))).toBe(
    'haruna@harpapro.com',
  );

  await expect(emailActions.getByRole('link', { name: 'Open email app' })).toHaveAttribute(
    'href',
    'mailto:haruna@harpapro.com',
  );
  await expect(contact.getByRole('link', { name: 'Message on WhatsApp' })).toHaveAttribute(
    'href',
    'https://wa.me/861937283726',
  );
  await expect(contact.locator('form')).toHaveCount(0);
});

test('uses accessible mega navigation and closes it after outside interaction', async ({
  page,
}) => {
  await page.goto('/');

  const desktopNav = page.locator('header nav[aria-label="Primary"]');
  const procurementMenu = desktopNav.locator('[data-mega-menu="procurement"]');
  const procurementSummary = procurementMenu.locator('summary');
  const siteReportingMenu = desktopNav.locator('[data-mega-menu="site-reporting"]');
  const siteReportingSummary = siteReportingMenu.locator('summary');

  await procurementSummary.hover();
  await expect(procurementMenu).toHaveAttribute('open', '');
  await expect(
    procurementMenu.getByRole('link', { name: 'Procurement overview', exact: true }),
  ).toHaveAttribute('href', '/');
  await expect(
    procurementMenu.getByRole('link', { name: 'Selected factory partners', exact: true }),
  ).toHaveAttribute('href', '/#factory-partners');

  await siteReportingSummary.hover();
  await expect(siteReportingMenu).toHaveAttribute('open', '');
  await expect(procurementMenu).not.toHaveAttribute('open', '');
  await expect(
    siteReportingMenu.getByRole('link', { name: 'Harpa Pro app', exact: true }),
  ).toHaveAttribute('href', '/app');
  await expect(
    siteReportingMenu.getByRole('link', { name: 'Guides', exact: true }),
  ).toHaveAttribute('href', '/docs');
  await expect(
    siteReportingMenu.getByRole('link', { name: 'Roadmap', exact: true }),
  ).toHaveAttribute('href', '/roadmap');
  await page.mouse.click(20, 700);
  await expect(siteReportingMenu).not.toHaveAttribute('open', '');

  await siteReportingSummary.focus();
  await page.keyboard.press('Enter');
  await expect(siteReportingMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(siteReportingMenu).not.toHaveAttribute('open', '');
  await expect(siteReportingSummary).toBeFocused();

  await expect(
    desktopNav.getByRole('link', {
      name: 'Contact Haruna',
      exact: true,
    }),
  ).toHaveAttribute('href', '/#contact');
  await expect(
    page
      .locator('footer')
      .getByRole('link', {
        name: 'Overview',
        exact: true,
      })
      .first(),
  ).toHaveAttribute('href', '/');
  await expect(page.locator('footer').getByText('Site reporting', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('details.site-menu');
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();
  await expect(
    mobileMenu.getByRole('link', { name: 'Procurement overview', exact: true }),
  ).toHaveAttribute('href', '/');
  await expect(
    mobileMenu.getByRole('link', { name: 'Contact Haruna', exact: true }),
  ).toHaveAttribute('href', '/#contact');
  const mobileSiteReporting = mobileMenu.locator('[data-mobile-site-reporting]');
  await expect(mobileSiteReporting.getByText('Site reporting', { exact: true })).toBeVisible();
  await expect(
    mobileSiteReporting.getByRole('link', { name: 'Harpa Pro app', exact: true }),
  ).toHaveAttribute('href', '/app');
  await expect(
    mobileSiteReporting.getByRole('link', { name: 'Guides', exact: true }),
  ).toHaveAttribute('href', '/docs');
  await expect(
    mobileSiteReporting.getByRole('link', { name: 'Roadmap', exact: true }),
  ).toHaveAttribute('href', '/roadmap');
  await expect(mobileMenu.getByRole('link', { name: 'App', exact: true })).toHaveCount(0);
  await expect(mobileMenu.getByRole('link', { name: 'View evidence', exact: true })).toHaveCount(0);

  await expect(
    mobileMenu.getByRole('link', { name: 'Factory documents', exact: true }),
  ).toHaveAttribute('href', '/#factory-documents');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('uses valid tab semantics and accessible contrast for procurement actions', async ({
  page,
}) => {
  await page.goto('/');

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    expect(
      await tabs.nth(index).evaluate((tab) => tab.parentElement?.getAttribute('role')),
    ).toBe('tablist');
  }

  const panel = page.getByRole('tabpanel').first();
  await expect(panel).toHaveJSProperty('tagName', 'DIV');

  const procurementActions = page.locator(
    'nav[aria-label="Primary"] > a[href="/#contact"], button[data-copy-email]',
  );
  await expect(procurementActions).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expect(procurementActions.nth(index)).toHaveClass(/\bbg-accent-ink\b/);
    await expect(procurementActions.nth(index)).toHaveClass(/\btext-accent-foreground\b/);
  }
});
