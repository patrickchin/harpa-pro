import { expect, test } from '@playwright/test';

const APP_STORE_URL = 'https://apps.apple.com/us/app/harpa-pro/id6776759817';

test('uses the complete procurement page as home without a reporting promotion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const hero = page.locator('main > section').first();
  const heroHeading = hero.locator('h1');
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
    'We coordinate specifications, factories, quality checks, shipping records, and project approvals in China.',
  );
  await expect(page.getByText(/now available for iPhone/i)).toHaveCount(0);

  const heroVisual = hero.locator('[data-hero-visual]');
  const heroImage = hero.getByRole('img', {
    name: 'Contemporary living room with stone, timber, and fabric samples arranged for review',
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
  expect(heroVisualBox!.width / heroBox!.width).toBeGreaterThan(0.9);
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
      lineHeight: Number.parseFloat(headingStyle.lineHeight),
      whiteSpace: headingStyle.whiteSpace,
    };
  });
  expect(heroTreatment.backgroundImage).not.toBe('none');
  expect(heroTreatment.whiteSpace).toBe('nowrap');
  expect(heroHeadingBox!.height).toBeLessThanOrEqual(heroTreatment.lineHeight * 1.1);

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
    'contact',
  ]);
  for (let index = 1; index < sectionBackgrounds.length; index += 1) {
    expect(sectionBackgrounds[index]).not.toBe(sectionBackgrounds[index - 1]);
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  const [compactHeadingBox, compactImageBox, compactWhiteSpace] = await Promise.all([
    heroHeading.boundingBox(),
    heroImage.boundingBox(),
    heroHeading.evaluate((heading) => getComputedStyle(heading).whiteSpace),
  ]);
  expect(compactHeadingBox).not.toBeNull();
  expect(compactImageBox).not.toBeNull();
  expect(compactWhiteSpace).toBe('normal');
  expect(compactHeadingBox!.x + compactHeadingBox!.width).toBeLessThanOrEqual(
    compactImageBox!.x + compactImageBox!.width,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const [mobileHeadingBox, mobileLineHeight, mobileOverflow] = await Promise.all([
    heroHeading.boundingBox(),
    heroHeading.evaluate((heading) => Number.parseFloat(getComputedStyle(heading).lineHeight)),
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ]);
  expect(mobileHeadingBox).not.toBeNull();
  expect(mobileHeadingBox!.height / mobileLineHeight).toBeGreaterThan(1.9);
  expect(mobileHeadingBox!.height / mobileLineHeight).toBeLessThan(2.1);
  expect(mobileOverflow).toBe(0);
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
