import { expect, test } from '@playwright/test';

const CONSIDERATIONS = [
  {
    title: 'Design and Specification',
    description:
      'We check the drawings, dimensions, finishes, quantities, and approval requirements before the factory starts production.',
    image: 'Revit A104 coordination sheet with 3D interior views',
    fit: 'contain',
  },
  {
    title: 'Factory and Product Fit',
    description:
      "We compare the factory's capability, product range, production capacity, and records with the project brief.",
    image: 'AIS Smarti headquarters and factory in Foshan, China',
    fit: 'cover',
  },
  {
    title: 'Materials and Compliance',
    description:
      "We compare material declarations and test reports with the project's performance, emission, fire, and maintenance requirements.",
    image: 'First page of the AIS marine HDF formaldehyde test report',
    fit: 'contain',
  },
  {
    title: 'Production Quality',
    description:
      'We inspect materials, workmanship, dimensions, finishes, and finished goods at agreed points during production.',
    image: 'AIS Smarti production lines and factory floor',
    fit: 'cover',
  },
  {
    title: 'Packing and Delivery',
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
  { title: 'AIS Custom Kitchen Joinery', imageMode: 'cover' },
  { title: 'J2S JSBC Hospitality Seating', imageMode: 'cover' },
  { title: 'Rong Shuo SW-011 Shower Enclosure', imageMode: 'source-content' },
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

test('presents the procurement team and considerations with matching evidence', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Luxury Interior Procurement in China',
    }),
  ).toBeVisible();

  const considerations = page.getByRole('tablist', {
    name: 'Procurement considerations',
  });
  const tabs = considerations.getByRole('tab');
  await expect(tabs).toHaveCount(CONSIDERATIONS.length);
  await expect(considerations.locator('[data-consideration-icon]')).toHaveCount(
    CONSIDERATIONS.length,
  );
  await expect(
    page.getByText(
      'We review design, factory capability, materials, quality, packing, and records as one order package.',
      { exact: true },
    ),
  ).toHaveCount(0);

  const tabHeights = await tabs.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(tabHeights.every((height) => height >= 160)).toBe(true);

  const [selectedStyle, idleStyle] = await Promise.all([
    tabs.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderColor };
    }),
    tabs.nth(1).evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderColor };
    }),
  ]);
  expect(selectedStyle.background).not.toBe(idleStyle.background);
  expect(selectedStyle.border).not.toBe(idleStyle.border);
  await expect(tabs.first().getByText('Details shown', { exact: true })).toBeVisible();
  await expect(tabs.nth(1).getByText('View details', { exact: true })).toBeVisible();

  for (const [index, consideration] of CONSIDERATIONS.entries()) {
    const tab = tabs.nth(index);
    await expect(tab.locator('[data-consideration-title]')).toHaveText(consideration.title);
    await tab.click();
    await expect(tab.getByText('Details shown', { exact: true })).toBeVisible();

    const panel = page.getByRole('tabpanel', { name: consideration.title });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 3, name: consideration.title })).toBeVisible();
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

  const profiles = page.locator('[data-procurement-profile]');
  const harunaProfile = page.locator('[data-procurement-profile="haruna"]');
  const hashyProfile = page.locator('[data-procurement-profile="hashy"]');
  await expect(profiles).toHaveCount(2);
  await expect(
    harunaProfile.getByRole('heading', { level: 2, name: 'Procurement Lead' }),
  ).toBeVisible();
  await expect(harunaProfile).toContainText('Haruna Bayoh');
  await expect(harunaProfile).toContainText(
    "Haruna Bayoh is Harpa Pro's procurement lead in China. He receives the project brief, coordinates technical approvals, records quality standards and inspections, controls the order, and keeps the project files complete.",
  );
  await expect(harunaProfile).toContainText("Master's degree");
  await expect(harunaProfile).toContainText('6 years');
  await expect(harunaProfile).toContainText('Technical Coordination');
  await expect(harunaProfile).toContainText('Order Control');
  await expect(harunaProfile).toContainText('Document Record');
  await expect(harunaProfile).not.toContainText('Factory Coordination');
  await expect(harunaProfile).not.toContainText('Shipping Logistics');
  await expect(harunaProfile.getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute(
    'href',
    'https://www.linkedin.com/in/harunabayoh/',
  );
  await expect(harunaProfile.getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(
    hashyProfile.getByRole('heading', { level: 2, name: 'Procurement Specialist' }),
  ).toBeVisible();
  await expect(hashyProfile).toContainText('Hashy');
  await expect(hashyProfile).toContainText(
    "Hashy is Harpa Pro's procurement specialist for factory coordination and shipping logistics.",
  );
  await expect(hashyProfile).toContainText('Procurement & Logistics');
  await expect(hashyProfile).toContainText("Bachelor's degree");
  await expect(hashyProfile).toContainText('4 years');
  await expect(hashyProfile).toContainText('Factory Coordination');
  await expect(hashyProfile).toContainText('Shipping Logistics');
  await expect(hashyProfile.getByRole('img', { name: 'Hashy' })).toBeVisible();
  await expect(hashyProfile.getByRole('link')).toHaveCount(0);
  await expect(page.locator('[data-agent-card]')).toHaveCount(0);

  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Project evidence' })).toHaveCount(0);
  for (const heading of [
    'Selected Factory Partners',
    'What Each Quote Includes',
    'Product Examples',
    'Factory Documents',
    'Technical Reviews',
  ]) {
    await expect(main.getByRole('heading', { level: 2, name: heading })).toBeVisible();
  }
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

test('keeps consideration choices and selected details stable at common widths', async ({
  page,
}) => {
  for (const width of [390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#considerations');

    const tabs = page.getByRole('tablist', { name: 'Procurement considerations' }).getByRole('tab');
    const tabHeights = await tabs.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(Math.max(...tabHeights) - Math.min(...tabHeights)).toBeLessThanOrEqual(1);

    const panelHeights: number[] = [];
    const nextSectionOffsets: number[] = [];
    for (let index = 0; index < CONSIDERATIONS.length; index += 1) {
      await tabs.nth(index).click();
      const panel = page.getByRole('tabpanel', {
        name: CONSIDERATIONS[index]!.title,
      });
      await expect(panel).toBeVisible();
      panelHeights.push(await panel.evaluate((element) => element.getBoundingClientRect().height));
      nextSectionOffsets.push(
        await page.locator('#evidence').evaluate((element) => (element as HTMLElement).offsetTop),
      );
    }

    expect(
      Math.max(...panelHeights) - Math.min(...panelHeights),
      `${width}px panel heights: ${panelHeights.join(', ')}`,
    ).toBeLessThanOrEqual(1);
    expect(Math.max(...nextSectionOffsets) - Math.min(...nextSectionOffsets)).toBeLessThanOrEqual(
      1,
    );
  }
});

test('crops embedded source captions and fills photographic frames', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#considerations');

  const mobileConsiderationTabs = page
    .getByRole('tablist', {
      name: 'Procurement considerations',
    })
    .getByRole('tab');
  const mobileTabBoxes = await mobileConsiderationTabs.evaluateAll((elements) =>
    elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }),
  );
  expect(mobileTabBoxes.every(({ width, height }) => width >= 320 && height >= 80)).toBe(true);

  await page.getByRole('tab', { name: 'Factory and Product Fit' }).click();
  const considerationPanel = page.getByRole('tabpanel', {
    name: 'Factory and Product Fit',
  });
  const considerationFrame = considerationPanel.locator('[data-consideration-image-frame]');
  const considerationImage = considerationFrame.getByRole('img', {
    name: 'AIS Smarti headquarters and factory in Foshan, China',
  });

  await expect(considerationFrame).toHaveAttribute('data-image-crop', 'embedded-caption');
  await expect(considerationImage).toBeVisible();

  const factories = page.locator('[data-factory-partner]');
  await expect(factories.locator('[data-factory-image-frame]')).toHaveCount(
    FACTORY_PARTNERS.length,
  );

  const aisFactory = factories.filter({ hasText: 'AIS Smarti' });
  const aisFactoryFrame = aisFactory.locator('[data-factory-image-frame]');
  const aisFactoryImage = aisFactoryFrame.getByRole('img');
  await expect(aisFactoryFrame).toHaveAttribute('data-image-crop', 'embedded-caption');
  await expect(aisFactoryImage).toBeVisible();

  for (const [frame, image] of [
    [considerationFrame, considerationImage],
    [aisFactoryFrame, aisFactoryImage],
  ] as const) {
    const [frameBox, imageBox] = await Promise.all([frame.boundingBox(), image.boundingBox()]);
    expect(frameBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.width).toBeGreaterThan(frameBox!.width * 1.15);
    expect(imageBox!.height).toBeGreaterThan(frameBox!.height * 1.15);
  }

  for (const frame of await factories.locator('[data-factory-image-frame]').all()) {
    const image = frame.getByRole('img');
    const [frameBox, imageBox] = await Promise.all([frame.boundingBox(), image.boundingBox()]);
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
  expect(featuredFrameBox!.height).toBeGreaterThanOrEqual(featuredCardBox!.height - 2);

  const featuredImageBox = await aisFactoryImage.boundingBox();
  expect(featuredImageBox).not.toBeNull();
  expect(featuredImageBox!.height).toBeGreaterThan(featuredFrameBox!.height * 1.15);
});

test('opens evidence images in an accessible dialog without leaving the page', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#evidence');

  const pageUrl = page.url();
  const drawingTrigger = page.getByRole('button', {
    name: 'Open full view of Revit A104 Coordination Review',
  });
  await drawingTrigger.click();

  await expect(page).toHaveURL(pageUrl);
  const drawingDialog = page.getByRole('dialog', {
    name: 'Full view: Revit A104 Coordination Review',
  });
  await expect(drawingDialog).toBeVisible();
  await expect(
    drawingDialog.getByRole('img', {
      name: 'Revit A104 3D coordination review sheet',
    }),
  ).toBeVisible();
  const drawingCaption = drawingDialog.getByText(
    'We check the layout, finishes, and sizes before we approve the factory information.',
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

test('shows a cached preview while the full evidence image loads', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#evidence');

  const trigger = page.getByRole('button', {
    name: 'Open full view of Revit A104 Coordination Review',
  });
  const thumbnail = trigger.getByRole('img');
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.evaluate((image) => (image as HTMLImageElement).decode());

  const previewSource = await thumbnail.evaluate((image) => (image as HTMLImageElement).currentSrc);
  const source = await trigger.getAttribute('data-evidence-image-src');
  expect(source).not.toBeNull();
  const fullSource = new URL(source!, page.url()).href;
  expect(previewSource).not.toBe(fullSource);

  let releaseFullImage!: () => void;
  const fullImageGate = new Promise<void>((resolve) => {
    releaseFullImage = resolve;
  });
  await page.route(fullSource, async (route) => {
    await fullImageGate;
    await route.continue();
  });

  await trigger.click();
  const dialog = page.getByRole('dialog', {
    name: 'Full view: Revit A104 Coordination Review',
  });
  const dialogImage = dialog.getByRole('img');
  const imageRegion = dialog.locator('[data-evidence-image-dialog-region]');

  try {
    await expect(dialogImage).toHaveJSProperty('currentSrc', previewSource);
    await expect(dialogImage).toHaveAttribute('data-evidence-image-state', 'preview');
    await expect(imageRegion).toHaveAttribute('aria-busy', 'true');
  } finally {
    releaseFullImage();
  }

  await expect(dialogImage).toHaveJSProperty('currentSrc', fullSource);
  await expect(dialogImage).toHaveAttribute('data-evidence-image-state', 'full');
  await expect(imageRegion).toHaveAttribute('aria-busy', 'false');
});

test('shows compact factory examples and progressively discloses document previews', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#evidence');

  await expect(page.getByRole('heading', { name: 'Technical Reviews' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Revit A104 3D coordination review sheet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Revit A103 chair shop drawing review sheet' }),
  ).toBeVisible();
  const technicalReviews = page.locator('[data-technical-review]');
  await expect(technicalReviews).toHaveCount(2);
  await expect(technicalReviews.nth(0)).toContainText(
    'We check the layout, finishes, and sizes before we approve the factory information.',
  );
  await expect(technicalReviews.nth(1)).toContainText('We review the drawings before production.');
  await expect(page.getByText(/These sheets record design coordination/)).toHaveCount(0);

  const factories = page.locator('[data-factory-partner]');
  await expect(factories).toHaveCount(FACTORY_PARTNERS.length);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Selected Factory Partners' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'We match each order with the factory that meets the design specifications and the delivery timeline.',
      {
        exact: false,
      },
    ),
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
  const [partnerSectionBox, featuredFactoryBox] = await Promise.all([
    page.locator('#factory-partners').boundingBox(),
    factories.first().boundingBox(),
  ]);
  expect(partnerSectionBox).not.toBeNull();
  expect(featuredFactoryBox).not.toBeNull();
  expect(featuredFactoryBox!.width).toBeLessThanOrEqual(partnerSectionBox!.width * 0.67);
  await expect(page.getByText('Ningbo Langyao Lighting', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Haining Mingyuan', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Foshan Zhenglian / JLA', { exact: true })).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Product Examples' })).toBeVisible();
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
  const briefBoxes = await briefs.evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.getBoundingClientRect();
      return { width: box.width, y: box.y };
    }),
  );
  expect(briefBoxes).toHaveLength(PRODUCT_BRIEFS.length);
  expect(
    Math.max(...briefBoxes.map(({ y }) => y)) - Math.min(...briefBoxes.map(({ y }) => y)),
  ).toBeLessThanOrEqual(1);

  const [productSectionBox, factoryDocumentsBox, technicalReviewsBox] = await Promise.all([
    page.locator('#product-examples').boundingBox(),
    page.locator('#factory-documents').boundingBox(),
    page.locator('#technical-reviews').boundingBox(),
  ]);
  expect(productSectionBox).not.toBeNull();
  expect(factoryDocumentsBox).not.toBeNull();
  expect(technicalReviewsBox).not.toBeNull();
  expect(productSectionBox!.height).toBeLessThanOrEqual(
    Math.max(factoryDocumentsBox!.height, technicalReviewsBox!.height) * 1.4,
  );

  await expect(page.getByRole('heading', { name: 'Factory Documents' })).toBeVisible();
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
  ).toHaveCount(0);

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
  await expect(contact.getByRole('heading', { level: 2, name: 'Contact Us' })).toBeVisible();
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

  await expect(desktopNav.locator('[data-nav-icon]')).toHaveCount(3);
  const desktopItemIcons = desktopNav.locator('[data-nav-item-icon]');
  await expect(desktopItemIcons).toHaveCount(10);
  await expect(desktopItemIcons.locator('svg[aria-hidden="true"]')).toHaveCount(10);
  expect(
    await desktopItemIcons.evaluateAll(
      (icons) => new Set(icons.map((icon) => icon.innerHTML)).size,
    ),
  ).toBe(10);
  expect(
    await page
      .locator('[data-site-header]')
      .evaluate((header) => getComputedStyle(header).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');

  await procurementSummary.hover();
  await expect(procurementMenu).toHaveAttribute('open', '');
  await expect(
    procurementMenu.getByRole('link', { name: 'Procurement Overview', exact: true }),
  ).toHaveAttribute('href', '/');
  await expect(
    procurementMenu.getByRole('link', { name: 'Selected Factory Partners', exact: true }),
  ).toHaveAttribute('href', '/#factory-partners');

  await siteReportingSummary.hover();
  await expect(siteReportingMenu).toHaveAttribute('open', '');
  await expect(procurementMenu).not.toHaveAttribute('open', '');
  await expect(
    siteReportingMenu.getByRole('link', { name: 'Harpa Pro App', exact: true }),
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
      name: 'Contact Us',
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
  await expect(page.locator('footer').getByText('Site Reporting', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('details.site-menu');
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();
  await expect(mobileMenu.locator('[data-nav-icon]')).toHaveCount(3);
  const mobileItemIcons = mobileMenu.locator('[data-nav-item-icon]');
  await expect(mobileItemIcons).toHaveCount(8);
  await expect(mobileItemIcons.locator('svg[aria-hidden="true"]')).toHaveCount(8);
  expect(
    await mobileItemIcons.evaluateAll((icons) => new Set(icons.map((icon) => icon.innerHTML)).size),
  ).toBe(8);
  await expect(
    mobileMenu.getByRole('link', { name: 'Procurement Overview', exact: true }),
  ).toHaveAttribute('href', '/');
  await expect(mobileMenu.getByRole('link', { name: 'Contact Us', exact: true })).toHaveAttribute(
    'href',
    '/#contact',
  );
  const mobileSiteReporting = mobileMenu.locator('[data-mobile-site-reporting]');
  await expect(mobileSiteReporting.getByText('Site Reporting', { exact: true })).toBeVisible();
  await expect(
    mobileSiteReporting.getByRole('link', { name: 'Harpa Pro App', exact: true }),
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
    mobileMenu.getByRole('link', { name: 'Factory Documents', exact: true }),
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
    expect(await tabs.nth(index).evaluate((tab) => tab.parentElement?.getAttribute('role'))).toBe(
      'tablist',
    );
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
