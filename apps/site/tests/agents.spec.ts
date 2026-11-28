import { expect, test } from '@playwright/test';

const CONSIDERATIONS = [
  {
    title: 'Design and specification',
    description:
      'We check the drawings, dimensions, finishes, quantities, and approval requirements before the factory starts production.',
    image: 'Revit A104 3D coordination review sheet',
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
] as const;

const FIRST_CREDENTIAL_DESCRIPTION =
  'The report names AIS JOINERY PTY LTD as the applicant. It records a GB 18580-2025 E0 pass result for marine HDF.';

test('presents the procurement team and considerations with matching evidence', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Interior procurement',
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
    harunaProfile.getByRole('heading', { level: 2, name: 'Procurement lead' }),
  ).toBeVisible();
  await expect(harunaProfile).toContainText('Haruna Bayoh');
  await expect(harunaProfile).toContainText(
    "Haruna Bayoh is Harpa Pro's procurement lead in China. He receives the project brief, coordinates technical approvals, records quality standards and inspections, controls the order, and keeps the project files complete.",
  );
  await expect(harunaProfile).toContainText("Master's degree");
  await expect(harunaProfile).toContainText('6 years');
  await expect(harunaProfile).toContainText('Technical coordination');
  await expect(harunaProfile).toContainText('Order control');
  await expect(harunaProfile).toContainText('Document record');
  await expect(harunaProfile).not.toContainText('Factory coordination');
  await expect(harunaProfile).not.toContainText('Shipping logistics');
  await expect(harunaProfile.getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute(
    'href',
    'https://www.linkedin.com/in/harunabayoh/',
  );
  await expect(harunaProfile.getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(
    hashyProfile.getByRole('heading', { level: 2, name: 'Procurement specialist' }),
  ).toBeVisible();
  await expect(hashyProfile).toContainText('Hashy');
  await expect(hashyProfile).toContainText(
    "Hashy is Harpa Pro's procurement specialist for factory coordination and shipping logistics.",
  );
  await expect(hashyProfile).toContainText('Procurement & logistics');
  await expect(hashyProfile).toContainText("Bachelor's degree");
  await expect(hashyProfile).toContainText('4 years');
  await expect(hashyProfile).toContainText('Factory coordination');
  await expect(hashyProfile).toContainText('Shipping logistics');
  await expect(hashyProfile.getByRole('img', { name: 'Hashy' })).toBeVisible();
  await expect(hashyProfile.getByRole('link')).toHaveCount(0);
  await expect(page.locator('[data-agent-card]')).toHaveCount(0);

  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Project evidence' })).toHaveCount(0);
  for (const heading of [
    'Selected factory partners',
    'What each quote includes',
    'Factory documents',
  ]) {
    await expect(main.getByRole('heading', { level: 2, name: heading })).toBeVisible();
  }
  for (const removed of ['Product examples', 'Technical reviews']) {
    await expect(main.getByRole('heading', { level: 2, name: removed })).toHaveCount(0);
  }
  await expect(page.locator('main > section')).toHaveCount(6);
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

test('uses a pre-cropped AIS photo and fills photographic frames without transforms', async ({
  page,
}) => {
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

  await page.getByRole('tab', { name: 'Factory and product fit' }).click();
  const considerationPanel = page.getByRole('tabpanel', {
    name: 'Factory and product fit',
  });
  const considerationFrame = considerationPanel.locator('[data-consideration-image-frame]');
  const considerationImage = considerationFrame.getByRole('img', {
    name: 'AIS Smarti headquarters and factory in Foshan, China',
  });
  await expect(considerationFrame).toHaveAttribute('data-image-crop', 'cover');
  await expect(considerationImage).toBeVisible();

  const factories = page.locator('[data-factory-partner]');
  await expect(factories.locator('[data-factory-image-frame]')).toHaveCount(
    FACTORY_PARTNERS.length,
  );
  const aisFactory = factories.filter({ hasText: 'AIS Smarti' });
  const aisFactoryFrame = aisFactory.locator('[data-factory-image-frame]');
  const aisFactoryImage = aisFactoryFrame.getByRole('img');
  await expect(aisFactoryFrame).toHaveAttribute('data-image-crop', 'cover');
  await expect(aisFactoryImage).toBeVisible();

  for (const image of [considerationImage, aisFactoryImage]) {
    await expect(image).toHaveAttribute('src', /ais-factory-exterior-photo\./);
    expect(await image.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  }

  for (const frame of [
    considerationFrame,
    ...(await factories.locator('[data-factory-image-frame]').all()),
  ]) {
    const image = frame.getByRole('img');
    await image.scrollIntoViewIfNeeded();
    const [frameBox, imageBox] = await Promise.all([frame.boundingBox(), image.boundingBox()]);
    expect(frameBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    expect(imageBox!.width).toBeGreaterThanOrEqual(frameBox!.width - 1);
    expect(imageBox!.height).toBeGreaterThanOrEqual(frameBox!.height - 1);
    expect(imageBox!.width).toBeLessThanOrEqual(frameBox!.width + 1);
    expect(imageBox!.height).toBeLessThanOrEqual(frameBox!.height + 1);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  const featuredCardBox = await aisFactory.boundingBox();
  const featuredFrameBox = await aisFactoryFrame.boundingBox();
  expect(featuredCardBox).not.toBeNull();
  expect(featuredFrameBox).not.toBeNull();
  expect(featuredFrameBox!.height).toBeGreaterThanOrEqual(featuredCardBox!.height - 2);
});

test('opens evidence images in an accessible dialog without leaving the page', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#considerations');

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

  await page.goto('/procurement/factory-documents');
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

  await recordTrigger.click();
  await recordDialog.evaluate((dialog) => {
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(recordDialog).not.toBeVisible();
  await expect(recordTrigger).toBeFocused();

  await page.goto('/#considerations');
  await expect(page.locator('[data-technical-review] a')).toHaveCount(0);
  await expect(page.locator('[data-document-scan] > a')).toHaveCount(0);
});

test('shows a cached preview while the full evidence image loads', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#considerations');

  const trigger = page.getByRole('button', {
    name: 'Open full view of Revit A104 coordination review',
  });
  const thumbnail = trigger.getByRole('img');
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.evaluate((image) => (image as HTMLImageElement).decode());

  const previewSource = await thumbnail.evaluate((image) => (image as HTMLImageElement).currentSrc);
  const source = await trigger.getAttribute('data-evidence-image-src');
  expect(source).not.toBeNull();
  expect(source).toMatch(/^\/_astro\/revit-a104-coordination\.[^/]+_[^/]+\.webp$/);
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
    name: 'Full view: Revit A104 coordination review',
  });
  const dialogImage = dialog.getByRole('img');
  const imageRegion = dialog.locator('[data-evidence-image-dialog-region]');

  let previewBox: { width: number; height: number } | null;
  try {
    await expect(dialogImage).toHaveJSProperty('currentSrc', previewSource);
    await expect(dialogImage).toHaveAttribute('data-evidence-image-state', 'preview');
    await expect(imageRegion).toHaveAttribute('aria-busy', 'true');
    previewBox = await dialogImage.boundingBox();
  } finally {
    releaseFullImage();
  }

  await expect(dialogImage).toHaveJSProperty('currentSrc', fullSource);
  await expect(dialogImage).toHaveAttribute('data-evidence-image-state', 'full');
  await expect(imageRegion).toHaveAttribute('aria-busy', 'false');

  // The preview reserves the full image's box, so the swap does not resize it.
  const fullBox = await dialogImage.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(fullBox).not.toBeNull();
  expect(Math.abs(fullBox!.width - previewBox!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(fullBox!.height - previewBox!.height)).toBeLessThanOrEqual(1);
});

test('merges reviews into the process and summarizes factory evidence on the homepage', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#technical-reviews');

  const designPanel = page.getByRole('tabpanel', { name: 'Design and specification' });
  await expect(designPanel).toBeVisible();
  const technicalReviews = designPanel.locator('[data-technical-review]');
  await expect(technicalReviews).toHaveCount(2);
  await expect(page.locator('#technical-reviews')).toBeVisible();
  for (const name of [
    'Revit A104 3D coordination review sheet',
    'Revit A103 chair shop drawing review sheet',
  ]) {
    await expect(designPanel.getByRole('img', { name })).toBeVisible();
  }
  await expect(technicalReviews.nth(0)).toHaveAttribute(
    'data-evidence-image-caption',
    'We check the layout, finishes, and sizes before we approve the factory information.',
  );
  await expect(technicalReviews.nth(1)).toHaveAttribute(
    'data-evidence-image-caption',
    'We review the drawings before production.',
  );

  await page.goto('/#evidence');
  const factories = page.locator('[data-factory-partner]');
  await expect(factories).toHaveCount(FACTORY_PARTNERS.length);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Selected factory partners' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'We match each order with the factory that meets the design specifications and the delivery timeline.',
      { exact: false },
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
  expect(featuredFactoryBox!.width).toBeGreaterThanOrEqual(partnerSectionBox!.width - 1);
  await expect(page.getByText('Ningbo Langyao Lighting', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Haining Mingyuan', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Foshan Zhenglian / JLA', { exact: true })).toHaveCount(0);

  const quote = page.locator('#quote-contents');
  await expect(quote.getByRole('heading', { level: 2, name: 'What each quote includes' }))
    .toBeVisible();
  for (const label of BUYER_INFORMATION) {
    await expect(quote.getByText(label, { exact: true })).toBeVisible();
  }
  const briefs = quote.locator('#product-examples [data-product-brief]');
  await expect(briefs).toHaveCount(PRODUCT_BRIEFS.length);
  for (const [index, brief] of PRODUCT_BRIEFS.entries()) {
    const card = briefs.nth(index);
    await expect(card).toContainText(brief.title);
    const frame = card.locator('[data-product-image-frame]');
    const image = frame.getByRole('img');
    await expect(frame).toHaveAttribute('data-product-image-mode', brief.imageMode);
    await expect(image).toBeVisible();
    const [frameBox, imageBox] = await Promise.all([frame.boundingBox(), image.boundingBox()]);
    expect(imageBox!.width).toBeGreaterThanOrEqual(frameBox!.width - 1);
    expect(imageBox!.height).toBeGreaterThanOrEqual(frameBox!.height - 1);
  }
  const briefTops = await briefs.evaluateAll((cards) =>
    cards.map((card) => card.getBoundingClientRect().y),
  );
  expect(Math.max(...briefTops) - Math.min(...briefTops)).toBeLessThanOrEqual(1);

  const summary = page.locator('#factory-documents');
  await expect(summary.getByRole('heading', { level: 2, name: 'Factory documents' }))
    .toBeVisible();
  await expect(summary).toContainText(`${CREDENTIALS.length} test reports and certificates`);
  await expect(summary).not.toContainText(/expired/i);
  await expect(page.locator('main [data-credential-record]')).toHaveCount(0);
  await expect(page.locator('[data-document-disclosure]')).toHaveCount(0);
  await expect(page.locator('a[href^="/documents/factories/"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /download procurement pdf/i })).toHaveCount(0);
  await expect(page.locator('a[href*="/catalogues/"]')).toHaveCount(0);

  await summary.getByRole('link', { name: 'View all factory documents' }).click();
  await expect(page).toHaveURL(/\/procurement\/factory-documents$/);
});

test('lists every factory document with a preview on its own page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/procurement/factory-documents');

  await expect(page.getByRole('heading', { level: 1, name: 'Factory documents' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Procurement' }))
    .toHaveAttribute('href', '/');
  await expect(page.locator('body')).toHaveAttribute('data-site-section', 'procurement');
  await expect(page.locator('footer').getByRole('link', { name: 'Factory documents', exact: true }))
    .toHaveAttribute('href', '/procurement/factory-documents');
  const records = page.locator('[data-credential-record]');
  await expect(records).toHaveCount(CREDENTIALS.length);
  for (const title of CREDENTIALS) {
    const record = records.filter({ hasText: title });
    await expect(record).toBeVisible();
    await expect(record.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await expect(record.getByRole('button', { name: `Open full view of ${title}` })).toBeVisible();
  }
  await expect(records.first()).toContainText(FIRST_CREDENTIAL_DESCRIPTION);

  for (const record of (await records.all()).slice(0, 3)) {
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

  await expect(records.filter({ hasText: 'European representative appointment' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/expired/i);
  await expect(page.locator('[data-evidence-document-href]')).toHaveCount(0);
  await expect(page.locator('a[href^="/documents/factories/"]')).toHaveCount(0);
  await expect(
    page.getByText(
      'Factory-supplied document. Harpa Pro has not independently verified its current status or scope.',
      { exact: true },
    ),
  ).toHaveCount(0);

  const oldDocument = await page.request.get(
    '/documents/factories/ais/ais-hdf-formaldehyde-e0-2026.pdf',
  );
  expect(oldDocument.status()).not.toBe(200);
  expect(oldDocument.headers()['content-type'] ?? '').not.toMatch(/application\/pdf/);
  const pdfResponse = await page.request.get('/downloads/harpa-pro-interior-procurement.pdf');
  expect(pdfResponse.status()).toBe(404);

  await expect(page.getByRole('link', { name: 'Send your project brief' })).toHaveAttribute(
    'href',
    '/#contact',
  );
});

test('makes opening the email app the primary contact action without a form', async ({ page }) => {
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
  await expect(contact.getByRole('heading', { level: 2, name: 'Contact us' })).toBeVisible();
  await expect(contact.getByText('haruna@harpapro.com', { exact: true })).toBeVisible();
  await expect(contact.getByText('+86 193 7283 7269', { exact: true })).toBeVisible();

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const gaps = await contact.locator('dl > *').evaluateAll((cards) =>
      cards.map((card) => {
        const cardBox = card.getBoundingClientRect();
        const contentBottom = Math.max(
          ...Array.from(card.querySelectorAll('a, button, p'))
            .filter((element) => element.getClientRects().length > 0 && element.closest('dialog') === null)
            .map((element) => element.getBoundingClientRect().bottom),
        );
        return cardBox.bottom - contentBottom;
      }),
    );
    for (const gap of gaps) expect(gap, `${width}px contact card bottom space`).toBeLessThanOrEqual(36);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  const emailActions = contact.locator('[data-contact-email-actions]');
  const openEmail = emailActions.locator('button, a').first();
  await expect(openEmail).toHaveAccessibleName('Open email app');
  await expect(openEmail).toHaveClass(/\bbg-accent-ink\b/);
  const copyEmail = emailActions.getByRole('button', { name: 'Copy email' });
  await expect(copyEmail).not.toHaveClass(/\bbg-accent-ink\b/);
  await expect(contact.getByRole('status')).toHaveText('');
  await copyEmail.click();
  await expect(contact.getByRole('status')).toHaveText('Email copied');
  expect(await page.evaluate(() => window.localStorage.getItem('copied-email'))).toBe(
    'haruna@harpapro.com',
  );

  await expect(emailActions.getByRole('link', { name: 'Open email app' })).toHaveAttribute(
    'href',
    'mailto:haruna@harpapro.com',
  );
  const whatsappNumber = await contact.getByText('+86 193 7283 7269', { exact: true }).innerText();
  await expect(contact.getByRole('link', { name: 'Message on WhatsApp' })).toHaveAttribute(
    'href',
    `https://wa.me/${whatsappNumber.replace(/\D/g, '')}`,
  );
  await expect(contact.locator('form')).toHaveCount(0);
});

test('uses accessible procurement navigation and closes it after outside interaction', async ({
  page,
}) => {
  await page.goto('/');

  const desktopNav = page.locator('header nav[aria-label="Primary"]');
  const procurementMenu = desktopNav.locator('[data-mega-menu="procurement"]');
  const procurementSummary = procurementMenu.locator('summary');

  // Procurement pages show only their own menu, plus one quiet cross-link.
  await expect(desktopNav.locator('[data-mega-menu]')).toHaveCount(1);
  await expect(desktopNav.locator('[data-mega-menu="site-reporting"]')).toHaveCount(0);
  await expect(desktopNav.locator('[data-nav-icon]')).toHaveCount(2);
  const desktopItemIcons = desktopNav.locator('[data-nav-item-icon]');
  await expect(desktopItemIcons).toHaveCount(4);
  await expect(desktopItemIcons.locator('svg[aria-hidden="true"]')).toHaveCount(4);
  expect(
    await desktopItemIcons.evaluateAll(
      (icons) => new Set(icons.map((icon) => icon.innerHTML)).size,
    ),
  ).toBe(4);
  expect(
    await page
      .locator('[data-site-header]')
      .evaluate((header) => getComputedStyle(header).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');

  await procurementSummary.hover();
  await expect(procurementMenu).toHaveAttribute('open', '');
  await expect(procurementMenu.getByRole('link')).toHaveCount(5);
  await expect(procurementMenu.getByRole('link', { name: 'Procurement guides', exact: true }))
    .toHaveAttribute('href', '/procurement/guides');
  await expect(
    procurementMenu.getByRole('link', { name: /^Procurement overview/ }),
  ).toHaveAttribute('href', '/');
  await expect(
    procurementMenu.getByRole('link', { name: /^How to buy from China/ }),
  ).toHaveAttribute('href', '/procurement/how-to-buy-from-china');
  await page.mouse.click(20, 700);
  await expect(procurementMenu).not.toHaveAttribute('open', '');

  await procurementSummary.focus();
  await page.keyboard.press('Enter');
  await expect(procurementMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(procurementMenu).not.toHaveAttribute('open', '');
  await expect(procurementSummary).toBeFocused();

  await expect(
    desktopNav.getByRole('link', { name: 'Site reporting app', exact: true }),
  ).toHaveAttribute('href', '/reports');
  await expect(
    desktopNav.getByRole('link', {
      name: 'Contact us',
      exact: true,
    }),
  ).toHaveAttribute('href', '/#contact');
  await expect(desktopNav.getByRole('link', { name: /Get the app/ })).toHaveCount(0);

  const footer = page.locator('footer');
  await expect(
    footer.getByRole('link', {
      name: 'Procurement overview',
      exact: true,
    }),
  ).toHaveAttribute('href', '/');
  await expect(footer.locator('nav[aria-label="Site reporting"]')).toHaveCount(0);
  await expect(footer.locator('a[href="/reports/roadmap"]')).toHaveCount(0);
  await expect(footer.locator('nav[aria-label="Also from Harpa Pro"]').getByRole('link'))
    .toHaveText(['Site reporting app']);
  await expect(footer.getByRole('link', { name: /^Contact/ })).toHaveCount(1);
  await expect(page.locator('footer nav').getByText(/©/)).toHaveCount(0);
  await expect(page.locator('footer [data-footer-copyright]')).toContainText('Harpa Pro');
  await expect(footer.getByRole('link', { name: 'Privacy', exact: true }))
    .toHaveAttribute('href', '/privacy');
  await expect(
    footer.getByRole('link', { name: 'How to buy from China', exact: true }),
  ).toHaveAttribute('href', '/procurement/how-to-buy-from-china');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('details.site-menu');
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();
  await expect(mobileMenu.locator('[data-nav-icon]')).toHaveCount(1);
  const mobileItemIcons = mobileMenu.locator('[data-nav-item-icon]');
  await expect(mobileItemIcons).toHaveCount(4);
  await expect(mobileItemIcons.locator('svg[aria-hidden="true"]')).toHaveCount(4);
  expect(
    await mobileItemIcons.evaluateAll((icons) => new Set(icons.map((icon) => icon.innerHTML)).size),
  ).toBe(4);
  await expect(mobileMenu.locator('[data-mobile-procurement]').getByRole('link'))
    .toHaveText(['Procurement overview', 'Products and factories', 'Our process', 'How to buy from China', 'Procurement guides']);
  await expect(mobileMenu.locator('[data-mobile-site-reporting]')).toHaveCount(0);
  await expect(mobileMenu.locator('[data-mobile-also]').getByRole('link'))
    .toHaveText(['Site reporting app']);
  await expect(
    mobileMenu.getByRole('link', { name: 'Procurement overview', exact: true }),
  ).toHaveAttribute('href', '/');
  await mobileMenu.getByRole('link', { name: 'How to buy from China', exact: true }).click();
  await expect(page).toHaveURL(/\/how-to-buy-from-china$/);
  await expect(page.getByRole('heading', { level: 1, name: 'How to buy from China' })).toBeVisible();
  await expect(mobileMenu.getByRole('link', { name: 'App', exact: true })).toHaveCount(0);
  await expect(mobileMenu.getByRole('link', { name: 'View evidence', exact: true })).toHaveCount(0);

  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link'))
    .toHaveCount(6);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('uses accessible site-reporting navigation without procurement chrome', async ({ page }) => {
  await page.goto('/reports');

  const desktopNav = page.locator('header nav[aria-label="Primary"]');
  const siteReportingMenu = desktopNav.locator('[data-mega-menu="site-reporting"]');
  const siteReportingSummary = siteReportingMenu.locator('summary');

  await expect(desktopNav.locator('[data-mega-menu]')).toHaveCount(1);
  await expect(desktopNav.locator('[data-mega-menu="procurement"]')).toHaveCount(0);
  await expect(desktopNav.locator('[data-nav-icon]')).toHaveCount(2);
  const desktopItemIcons = desktopNav.locator('[data-nav-item-icon]');
  await expect(desktopItemIcons).toHaveCount(4);
  expect(
    await desktopItemIcons.evaluateAll(
      (icons) => new Set(icons.map((icon) => icon.innerHTML)).size,
    ),
  ).toBe(4);
  await expect(page.locator('[data-site-header] [data-wordmark]')).toHaveAttribute('href', '/reports');

  await siteReportingSummary.hover();
  await expect(siteReportingMenu).toHaveAttribute('open', '');
  await expect(siteReportingMenu.getByRole('link')).toHaveCount(4);
  await expect(
    siteReportingMenu.getByRole('link', { name: /^Harpa Pro app/ }),
  ).toHaveAttribute('href', '/reports');
  await expect(
    siteReportingMenu.getByRole('link', { name: /^Guides/ }),
  ).toHaveAttribute('href', '/reports/docs');
  await expect(
    siteReportingMenu.getByRole('link', { name: /^Roadmap/ }),
  ).toHaveAttribute('href', '/reports/roadmap');
  await expect(siteReportingMenu.getByRole('link', { name: /^Get the app/ }))
    .toHaveAttribute('href', '/reports/download');
  await page.mouse.click(20, 700);
  await expect(siteReportingMenu).not.toHaveAttribute('open', '');

  await siteReportingSummary.focus();
  await page.keyboard.press('Enter');
  await expect(siteReportingMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(siteReportingMenu).not.toHaveAttribute('open', '');
  await expect(siteReportingSummary).toBeFocused();

  await expect(desktopNav.getByRole('link', { name: 'Interior procurement', exact: true }))
    .toHaveAttribute('href', '/');
  await expect(desktopNav.getByRole('link', { name: 'Contact us', exact: true })).toHaveCount(0);
  const headerAppLink = desktopNav.locator(':scope > a', { hasText: 'Get the app' });
  await expect(headerAppLink).toHaveAttribute('href', '/reports/download');

  const footer = page.locator('footer');
  await expect(footer.locator('nav[aria-label="Site reporting"]').getByRole('link'))
    .toHaveText(['Harpa Pro app', 'Guides', 'Roadmap', 'Get the app', 'Account deletion']);
  const footerAppLink = footer.getByRole('link', { name: 'Get the app', exact: true });
  await expect(footerAppLink).toHaveAttribute('href', '/reports/download');
  await expect(footer.locator('nav[aria-label="Procurement"]')).toHaveCount(0);
  await expect(footer.locator('a[href="/#contact"]')).toHaveCount(0);
  await expect(footer.locator('nav[aria-label="Also from Harpa Pro"]').getByRole('link'))
    .toHaveText(['Interior procurement']);
  await expect(footer.getByRole('link', { name: 'Privacy', exact: true }))
    .toHaveAttribute('href', '/privacy');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator('details.site-menu');
  await mobileMenu.locator('summary[aria-label="Toggle menu"]').click();
  const mobileSiteReporting = mobileMenu.locator('[data-mobile-site-reporting]');
  await expect(mobileSiteReporting.getByRole('link')).toHaveText(['Harpa Pro app', 'Guides', 'Roadmap']);
  await expect(mobileSiteReporting.getByText('Site reporting', { exact: true })).toBeVisible();
  await expect(
    mobileSiteReporting.getByRole('link', { name: 'Harpa Pro app', exact: true }),
  ).toHaveAttribute('href', '/reports');
  await expect(
    mobileSiteReporting.getByRole('link', { name: 'Guides', exact: true }),
  ).toHaveAttribute('href', '/reports/docs');
  await expect(
    mobileSiteReporting.getByRole('link', { name: 'Roadmap', exact: true }),
  ).toHaveAttribute('href', '/reports/roadmap');
  await expect(mobileMenu.locator('[data-mobile-procurement]')).toHaveCount(0);
  await expect(mobileMenu.locator('[data-mobile-also]').getByRole('link'))
    .toHaveText(['Interior procurement']);

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
    'nav[aria-label="Primary"] > a[href="/#contact"], a[data-contact-event="contact_email_opened"]',
  );
  await expect(procurementActions).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expect(procurementActions.nth(index)).toHaveClass(/\bbg-accent-ink\b/);
    await expect(procurementActions.nth(index)).toHaveClass(/\btext-accent-foreground\b/);
  }
});
