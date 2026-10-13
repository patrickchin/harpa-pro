import { expect, test } from '@playwright/test';

const APP_STORE_URL = 'https://apps.apple.com/us/app/harpa-pro/id6776759817';

test('uses the complete procurement page as home without a reporting promotion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const hero = page.locator('main > section').first();
  const heroHeading = hero.locator('h1');
  await page.evaluate(() => document.fonts.ready);
  await expect(heroHeading).toHaveText('Luxury Interior Procurement in China');
  await expect(
    hero.getByText(
      'We manage design specifications, factory coordination, quality checks, shipment, and complete procurement documentation (approved health, safety, and quality standards).',
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.locator('#agent')).toBeVisible();
  await expect(page.locator('#considerations')).toBeVisible();
  await expect(page.locator('#evidence')).toBeVisible();
  await expect(page.locator('#contact')).toBeVisible();
  await expect(
    page.locator('[data-procurement-profile="haruna"]').getByRole('heading', {
      level: 2,
      name: 'Procurement Lead',
    }),
  ).toBeVisible();
  await expect(page.locator('[data-procurement-profile="haruna"]')).toContainText(
    "Haruna Bayoh is Harpa Pro's procurement lead in China. He receives the project brief, coordinates technical approvals, records quality standards and inspections, controls the order, and keeps the project files complete.",
  );
  const hashyProfile = page.locator('[data-procurement-profile="hashy"]');
  await expect(
    hashyProfile.getByRole('heading', { level: 2, name: 'Procurement Specialist' }),
  ).toBeVisible();
  await expect(hashyProfile).toContainText('Procurement & Logistics');
  await expect(hashyProfile).toContainText("Bachelor's degree");
  await expect(hashyProfile).toContainText('4 years');
  await expect(hashyProfile).toContainText('Factory Coordination');
  await expect(hashyProfile).toContainText('Shipping Logistics');
  await expect(page.getByText('Construction site reporting', { exact: true })).toHaveCount(0);
  await expect(page.locator('#app')).toHaveCount(0);
  await expect(page.locator(`main a[href="${APP_STORE_URL}"]`)).toHaveCount(0);

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Harpa Pro coordinates interior procurement in China: design specifications, factory coordination, quality checks, shipping, and procurement documentation.',
  );
  await expect(page.getByText(/now available for iPhone/i)).toHaveCount(0);

  const heroVisual = hero.locator('[data-hero-visual]');
  const heroImage = hero.getByRole('img', {
    name: 'Generated interior concept with warm wood finishes in a contemporary living room',
  });
  const [heroBox, heroVisualBox, heroImageBox, heroHeadingBox] = await Promise.all([
    hero.boundingBox(),
    heroVisual.boundingBox(),
    heroImage.boundingBox(),
    heroHeading.boundingBox(),
  ]);
  expect(heroBox).not.toBeNull();
  expect(heroVisualBox).not.toBeNull();
  expect(heroImageBox).not.toBeNull();
  expect(heroHeadingBox).not.toBeNull();
  expect(Math.abs(heroVisualBox!.width - heroBox!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(heroImageBox!.width - heroVisualBox!.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(heroImageBox!.height - heroVisualBox!.height)).toBeLessThanOrEqual(2);
  expect(heroHeadingBox!.x).toBeGreaterThanOrEqual(heroImageBox!.x);
  expect(heroHeadingBox!.y).toBeGreaterThanOrEqual(heroImageBox!.y);
  expect(heroHeadingBox!.x + heroHeadingBox!.width).toBeLessThanOrEqual(
    heroImageBox!.x + heroImageBox!.width,
  );
  expect(heroHeadingBox!.y + heroHeadingBox!.height).toBeLessThanOrEqual(
    heroImageBox!.y + heroImageBox!.height,
  );

  const heroTreatment = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>('#top h1');
    const scrim = document.querySelector<HTMLElement>('[data-hero-scrim]');
    if (!heading || !scrim) throw new Error('Hero treatment is missing');
    const headingStyle = getComputedStyle(heading);
    return {
      backgroundImage: getComputedStyle(scrim).backgroundImage,
      fontFamily: headingStyle.fontFamily,
      lineHeight: Number.parseFloat(headingStyle.lineHeight),
      whiteSpace: headingStyle.whiteSpace,
    };
  });
  expect(heroTreatment.backgroundImage).not.toBe('none');
  expect(heroTreatment.fontFamily).toContain('Cormorant Garamond');
  expect(heroTreatment.whiteSpace).toBe('normal');
  expect(heroHeadingBox!.height).toBeGreaterThan(heroTreatment.lineHeight * 1.5);
  await expect(hero.getByRole('link', { name: 'Discuss your project' })).toHaveAttribute(
    'href',
    '#contact',
  );
  await expect(hero.getByRole('link', { name: 'Explore our approach' })).toHaveAttribute(
    'href',
    '#considerations',
  );

  const divider = await page.evaluate(() => {
    const heroSection = document.querySelector<HTMLElement>('#top');
    const considerationSection = document.querySelector<HTMLElement>('#considerations');
    if (!heroSection || !considerationSection) {
      throw new Error('Homepage sections are missing');
    }
    return {
      heroBottom: Number.parseFloat(getComputedStyle(heroSection).borderBottomWidth),
      nextSectionTop: Number.parseFloat(getComputedStyle(considerationSection).borderTopWidth),
    };
  });
  expect(divider.heroBottom + divider.nextSectionTop).toBeLessThanOrEqual(1);

  const { sectionIds, sectionBackgrounds } = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('main > section'));
    return {
      sectionIds: sections.map((section) => section.id),
      sectionBackgrounds: sections.map((section) => getComputedStyle(section).backgroundColor),
    };
  });
  expect(sectionIds).toEqual([
    'top',
    'considerations',
    'evidence',
    'quote-contents',
    'product-examples',
    'factory-documents',
    'technical-reviews',
    'agent',
    'procurement-questions',
    'contact',
  ]);
  for (let index = 1; index < sectionBackgrounds.length; index += 1) {
    expect(sectionBackgrounds[index]).not.toBe(sectionBackgrounds[index - 1]);
  }

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const [visualBox, headingBox, actionsBox, overflow] = await Promise.all([
      heroVisual.boundingBox(),
      heroHeading.boundingBox(),
      hero.locator('.luxury-hero-actions').boundingBox(),
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ]);
    expect(visualBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(Math.abs(visualBox!.width - width)).toBeLessThanOrEqual(1);
    expect(headingBox!.x).toBeGreaterThanOrEqual(visualBox!.x);
    expect(headingBox!.y).toBeGreaterThanOrEqual(visualBox!.y);
    expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(visualBox!.x + visualBox!.width);
    expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(visualBox!.y + visualBox!.height);
    expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(
      visualBox!.y + visualBox!.height,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('swaps complete material concepts with pointer and keyboard controls', async ({ page }) => {
  await page.goto('/');

  const hero = page.locator('[data-hero-visual]');
  const image = hero.locator('[data-material-image]');
  const choices = hero.locator('[data-material-choice]');
  const caption = hero.locator('[data-material-caption]');
  await expect(hero.getByRole('group', { name: 'Interior material concepts' })).toBeVisible();
  await expect(choices).toHaveCount(3);
  await expect(caption).toHaveText('Material concept · Wood');
  const initialBox = await image.boundingBox();
  const imageSources = new Set<string>();

  for (const [view, label] of [
    ['stone', 'Stone & Marble'],
    ['modern', 'Glass & Modern'],
    ['wood', 'Wood'],
  ] as const) {
    const choice = hero.getByRole('button', { name: label, exact: true });
    if (view === 'modern') {
      await choice.focus();
      await choice.press('Enter');
    } else {
      await choice.click();
    }
    await expect(choice).toBeFocused();
    await expect(hero).toHaveAttribute('data-material-view', view);
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(hero.locator('[data-material-choice][aria-pressed="true"]')).toHaveCount(1);
    await expect(hero.locator('[data-material-choice][aria-pressed="false"]')).toHaveCount(2);
    await expect(caption).toHaveText(`Material concept · ${label}`);
    await expect(image).toHaveAttribute('aria-busy', 'false');
    await expect(image).toHaveAttribute('src', (await choice.getAttribute('data-material-src'))!);
    await expect(image).toHaveAttribute('srcset', (await choice.getAttribute('data-material-srcset'))!);
    await expect(image).toHaveAttribute('alt', (await choice.getAttribute('data-material-alt'))!);
    imageSources.add(await image.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      if (!element.naturalWidth) throw new Error('Material concept did not decode');
      return element.currentSrc;
    }));
    expect(await image.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    expect(await image.boundingBox()).toEqual(initialBox);
  }
  expect(imageSources.size).toBe(3);
});

test('crossfades complete material images and queues the latest choice during a fade', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('[data-hero-visual]');
  const image = hero.locator('[data-material-image]');
  const outgoing = hero.locator('[data-material-outgoing]');
  const initialSource = await image.evaluate((element: HTMLImageElement) => element.currentSrc);

  await hero.getByRole('button', { name: 'Stone & Marble', exact: true }).click();
  await expect(hero).toHaveAttribute('data-material-view', 'stone');
  const midpoint = await outgoing.evaluate((element: HTMLImageElement) => {
    const fade = element.getAnimations()[0]!;
    fade.pause();
    fade.currentTime = 450;
    return { opacity: Number(getComputedStyle(element).opacity), source: element.currentSrc };
  });
  expect(midpoint.source).toBe(initialSource);
  expect(midpoint.opacity).toBeGreaterThan(0);
  expect(midpoint.opacity).toBeLessThan(1);
  expect(await image.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  await expect(outgoing).toHaveAttribute('aria-hidden', 'true');

  await hero.getByRole('button', { name: 'Glass & Modern', exact: true }).click();
  await expect(hero.locator('[data-material-caption]')).toHaveText('Loading Glass & Modern concept…');
  await expect(hero).toHaveAttribute('data-material-view', 'stone');
  await hero.getByRole('button', { name: 'Wood', exact: true }).click();
  await expect(hero.locator('[data-material-caption]')).toHaveText('Loading Wood concept…');
  await outgoing.evaluate((element) => element.getAnimations()[0]!.finish());
  await expect(hero).toHaveAttribute('data-material-view', 'wood');
  await expect(hero.locator('[data-material-caption]')).toHaveText('Material concept · Wood');
  await expect(hero.getByRole('button', { name: 'Glass & Modern', exact: true }))
    .toHaveAttribute('aria-pressed', 'false');
  await expect(outgoing).toHaveCount(0);
  await expect(image).toHaveJSProperty('currentSrc', initialSource);
});

test('retains the loaded image while fetching and keeps the latest material choice', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('[data-hero-visual]');
  const image = hero.locator('[data-material-image]');
  const caption = hero.locator('[data-material-caption]');
  const stone = hero.getByRole('button', { name: 'Stone & Marble', exact: true });
  const stoneSources = await stone.evaluate((button: HTMLButtonElement) =>
    `${button.dataset.materialSrc},${button.dataset.materialSrcset}`.split(',').map((source) =>
      new URL(source.trim().split(/\s+/)[0]!, window.location.href).href,
    ),
  );
  const initialSource = await image.evaluate((element: HTMLImageElement) => element.currentSrc);
  const initialBox = await image.boundingBox();
  let releaseImage!: () => void;
  const imageGate = new Promise<void>((resolve) => { releaseImage = resolve; });
  await page.route((url) => stoneSources.includes(url.href), async (route) => {
    await imageGate;
    await route.continue();
  });

  try {
    await stone.click();
    await expect(image).toHaveAttribute('aria-busy', 'true');
    await expect(caption).toHaveText('Loading Stone & Marble concept…');
    await expect(hero).toHaveAttribute('data-material-view', 'wood');
    await expect(hero.getByRole('button', { name: 'Wood', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(image).toHaveJSProperty('currentSrc', initialSource);
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    expect(await image.boundingBox()).toEqual(initialBox);

    await hero.getByRole('button', { name: 'Glass & Modern', exact: true }).click();
    await expect(hero).toHaveAttribute('data-material-view', 'modern');
    const modernSource = await image.evaluate((element: HTMLImageElement) => element.currentSrc);
    expect(modernSource).not.toBe(initialSource);
    const stoneResponse = page.waitForResponse((response) => stoneSources.includes(response.url()));
    releaseImage();
    await (await stoneResponse).finished();
    // Wait for a real decode of the released resource before checking stale completion.
    await page.evaluate(async (source) => {
      const pendingImage = new Image();
      pendingImage.src = source;
      await pendingImage.decode();
    }, (await stoneResponse).url());
    await expect(hero).toHaveAttribute('data-material-view', 'modern');
    await expect(caption).toHaveText('Material concept · Glass & Modern');
    await expect(image).toHaveJSProperty('currentSrc', modernSource);
    await expect(image).toHaveAttribute('aria-busy', 'false');
  } finally {
    releaseImage();
  }
});

test('preserves a material concept after loading fails and allows a retry', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('[data-hero-visual]');
  const image = hero.locator('[data-material-image]');
  const modern = hero.getByRole('button', { name: 'Glass & Modern', exact: true });
  const modernSources = await modern.evaluate((button: HTMLButtonElement) =>
    `${button.dataset.materialSrc},${button.dataset.materialSrcset}`.split(',').map((source) =>
      new URL(source.trim().split(/\s+/)[0]!, window.location.href).href,
    ),
  );
  const initialSource = await image.evaluate((element: HTMLImageElement) => element.currentSrc);
  const initialAlt = await image.getAttribute('alt');
  const matchesModern = (url: URL) => modernSources.includes(url.href);
  await page.route(matchesModern, (route) => route.abort());
  await modern.click();
  await expect(hero.locator('[data-material-caption]'))
    .toHaveText('Glass & Modern concept could not load. Try again.');
  await expect(image).toHaveAttribute('aria-busy', 'false');
  await expect(image).toHaveJSProperty('currentSrc', initialSource);
  await expect(image).toHaveAttribute('alt', initialAlt!);
  await expect(hero).toHaveAttribute('data-material-view', 'wood');
  await expect(hero.getByRole('button', { name: 'Wood', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await page.unroute(matchesModern);
  await modern.click();
  await expect(hero).toHaveAttribute('data-material-view', 'modern');
  await expect(modern).toHaveAttribute('aria-pressed', 'true');
  await expect(hero.locator('[data-material-caption]')).toHaveText('Material concept · Glass & Modern');
  expect(await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    return element.currentSrc;
  })).not.toBe(initialSource);
});

test('uses the local readable text color on dark procurement sections', async ({ page }) => {
  await page.goto('/');
  const textColors = await page.evaluate(() => [
    '#considerations h2',
    '#considerations [data-consideration-tab]',
    '#contact h2',
    '#contact dt',
    '#contact dd > p.text-ink',
  ].flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector), (element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--foreground)';
    element.append(probe);
    const expectedColor = getComputedStyle(probe).color;
    probe.remove();
    return { selector, actualColor: getComputedStyle(element).color, expectedColor };
  })));
  expect(textColors).toHaveLength(11);
  for (const { selector, actualColor, expectedColor } of textColors) {
    expect(actualColor, selector).toBe(expectedColor);
  }
});

test('honors reduced motion at load and when the preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const image = page.locator('[data-material-image]');
  const outgoing = page.locator('[data-material-outgoing]');
  await expect(page.locator('.luxury-reading-progress')).not.toBeVisible();
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).scrollBehavior))
    .toBe('auto');
  expect(await image.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  const initialSource = await image.evaluate((element: HTMLImageElement) => element.currentSrc);
  await page.getByRole('button', { name: 'Stone & Marble', exact: true }).click();
  await expect(page.locator('[data-hero-visual]')).toHaveAttribute('data-material-view', 'stone');
  expect(await image.evaluate((element: HTMLImageElement) => element.currentSrc)).not.toBe(initialSource);
  expect(await image.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  expect(await image.evaluate((element) => element.getAnimations().length)).toBe(0);

  const heading = page.locator('#considerations h2');
  await heading.evaluate((element) => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
  expect(await heading.evaluate((element) => element.getAnimations().length)).toBe(0);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Glass & Modern', exact: true }).click();
  await expect(page.locator('[data-hero-visual]')).toHaveAttribute('data-material-view', 'modern');
  expect(await outgoing.evaluate((element) =>
    element.getAnimations().some((animation) => animation.playState === 'running'),
  )).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(outgoing).toHaveCount(0);
  expect(await image.evaluate((element) => element.getAnimations().length)).toBe(0);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await heading.evaluate((element) => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await expect.poll(
    () => heading.evaluate((element) => element.getAnimations().some((animation) => animation.playState === 'running')),
    { intervals: [10, 20, 50] },
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.locator('.luxury-site').evaluate((element) =>
    element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length,
  )).toBe(0);
  const nextHeading = page.locator('#factory-partners h2');
  await nextHeading.evaluate((element) => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
  expect(await nextHeading.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(nextHeading).toBeVisible();
});

test('keeps the hero and contact routes useful without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/');
    const hero = page.locator('#top');
    await expect(hero.getByRole('heading', {
      level: 1,
      name: 'Luxury Interior Procurement in China',
    })).toBeVisible();
    const image = hero.getByRole('img', {
      name: 'Generated interior concept with warm wood finishes in a contemporary living room',
    });
    await expect(image).toBeVisible();
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    await expect(hero.locator('[data-material-caption]')).toBeVisible();
    await expect(hero.locator('[data-material-caption]')).toHaveText('Material concept · Wood');
    await expect(hero.getByText(/We manage design specifications/)).toBeVisible();
    await expect(hero.locator('[data-material-controls]')).toBeHidden();
    await expect(hero.getByRole('button')).toHaveCount(0);
    await hero.getByRole('link', { name: 'Explore our approach' }).click();
    await expect(page).toHaveURL(/\/#considerations$/);
    await expect(page.locator('#considerations').getByRole('heading', {
      level: 2,
      name: 'What We Consider',
    })).toBeVisible();
    await page.goto('/');
    await hero.getByRole('link', { name: 'Discuss your project' }).click();
    await expect(page).toHaveURL(/\/#contact$/);
    await expect(page.locator('#contact').getByRole('link', { name: 'Open email app' }))
      .toHaveAttribute('href', 'mailto:haruna@harpapro.com');
    await expect(page.locator('#contact').getByRole('link', { name: 'Message on WhatsApp' }))
      .toHaveAttribute('href', 'https://wa.me/861937283726');
  } finally {
    await context.close();
  }
});

test('keeps the procurement profiles compact and responsive', async ({ page }) => {
  for (const width of [390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const profileGroup = page.locator('[data-procurement-profiles]');
    const harunaProfile = page.locator('[data-procurement-profile="haruna"]');
    const hashyProfile = page.locator('[data-procurement-profile="hashy"]');
    const [heroBox, groupBox, harunaBox, hashyBox, overflow] = await Promise.all([
      page.locator('[data-hero-visual]').boundingBox(),
      profileGroup.boundingBox(),
      harunaProfile.boundingBox(),
      hashyProfile.boundingBox(),
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ]);
    expect(heroBox).not.toBeNull();
    expect(groupBox).not.toBeNull();
    expect(harunaBox).not.toBeNull();
    expect(hashyBox).not.toBeNull();
    expect(overflow).toBeLessThanOrEqual(1);

    for (const profileName of ['haruna', 'hashy']) {
      const profile = page.locator(`[data-procurement-profile="${profileName}"]`);
      const [portraitBox, bioBox] = await Promise.all([
        profile.locator('[data-profile-portrait]').boundingBox(),
        profile.locator('[data-profile-bio]').boundingBox(),
      ]);
      expect(portraitBox).not.toBeNull();
      expect(bioBox).not.toBeNull();
      expect(heroBox!.width * heroBox!.height).toBeGreaterThan(
        portraitBox!.width * portraitBox!.height,
      );
      const expectedPortraitSize = width >= 640 ? 208 : 160;
      expect(Math.abs(portraitBox!.height - expectedPortraitSize)).toBeLessThanOrEqual(1);
      expect(Math.abs(portraitBox!.width - portraitBox!.height)).toBeLessThanOrEqual(1);
      if (width >= 640) {
        expect(portraitBox!.x).toBeLessThan(bioBox!.x);
        expect(Math.abs(portraitBox!.y - bioBox!.y)).toBeLessThanOrEqual(1);
      } else {
        expect(portraitBox!.y).toBeLessThan(bioBox!.y);
      }
    }

    if (width >= 1280) {
      expect(harunaBox!.x).toBeLessThan(hashyBox!.x);
      expect(Math.abs(harunaBox!.y - hashyBox!.y)).toBeLessThanOrEqual(1);
      expect(harunaBox!.width).toBeLessThan(groupBox!.width * 0.5);
      expect(hashyBox!.width).toBeLessThan(groupBox!.width * 0.5);

      const [harunaDivider, hashyDivider] = await Promise.all([
        harunaProfile.locator('[data-profile-credentials]').boundingBox(),
        hashyProfile.locator('[data-profile-credentials]').boundingBox(),
      ]);
      expect(harunaDivider).not.toBeNull();
      expect(hashyDivider).not.toBeNull();
      expect(Math.abs(harunaDivider!.y - hashyDivider!.y)).toBeLessThanOrEqual(1);
    } else {
      expect(harunaBox!.y).toBeLessThan(hashyBox!.y);
    }

    if (width < 768) {
      expect(Math.abs(heroBox!.width - width)).toBeLessThanOrEqual(1);
    }
  }
});

test('uses collective service copy and keeps team names in profiles', async ({ page }) => {
  await page.goto('/');

  const profiles = page.locator('[data-procurement-profiles]');
  await expect(profiles).toContainText('Haruna Bayoh');
  await expect(profiles).toContainText('Hashy');

  const nonProfileText = await page.locator('body').evaluate((body) => {
    const copy = body.cloneNode(true) as HTMLElement;
    copy.querySelector('[data-procurement-profiles]')?.remove();
    copy.querySelectorAll('script, style').forEach((element) => element.remove());
    return (copy.textContent ?? '').replace(/haruna@harpapro\.com/gi, '');
  });

  expect(nonProfileText).not.toMatch(/\b(?:haruna(?: bayoh)?|hashy)\b/i);
  await expect(page.getByRole('link', { name: /haruna/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Contact Us' })).toBeVisible();

  await page.goto('/app');
  await expect(page.getByText('Haruna Bayoh', { exact: true })).toHaveCount(1);

  await page.goto('/not-a-real-page');
  await expect(page.getByRole('link', { name: /haruna/i })).toHaveCount(0);
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Contact Us', exact: true }),
  ).toBeVisible();
});
