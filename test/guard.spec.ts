import { expect, test } from '@playwright/test';

import { installLayoutGuard } from '../src/index.js';

/**
 * What the guard finds and what it leaves alone, one test page for each case. These tests use the
 * guard by hand (`installLayoutGuard`) so that they can look at what it found instead of failing.
 */

test('finds nothing on a page that stays put', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/stable.html');
  await page.getByRole('button', { name: 'Press' }).click();
  await page.waitForTimeout(400);
  expect(guard.shifts).toEqual([]);
});

test('finds what is pushed down by a banner that arrives after the load', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/banner-after-load.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  // Only the box that was pushed is reported, the heading and the card inside it went with it
  expect(guard.shifts).toHaveLength(1);
  const shift = guard.shifts[0];
  expect(shift?.kind).toBe('moved');
  expect(shift?.element).toBe('main');
  expect(shift?.affected).toBe(2);
  // The banner is 60 px high
  expect(shift?.after.top).toBe((shift?.before.top ?? 0) + 60);
});

test('finds what jumps when a button is pressed, which the browser itself would not count', async ({
  page,
}) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/banner-on-click.html');
  await page.waitForTimeout(300);
  expect(guard.shifts).toEqual([]);
  await page.getByRole('button', { name: 'Show the offer' }).click();
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  expect(guard.shifts.some((entry) => entry.element.includes('main'))).toBe(true);
});

test('does not look while the page is loading, unless it is asked to', async ({ page }) => {
  const late = await installLayoutGuard(page);
  await page.goto('/banner-while-loading.html');
  await page.waitForTimeout(500);
  expect(late.shifts).toEqual([]);
});

test('looks from the first frame with start: immediate', async ({ page }) => {
  const guard = await installLayoutGuard(page, { start: 'immediate' });
  await page.goto('/banner-while-loading.html');
  await expect.poll(() => guard.shifts.length, { timeout: 4000 }).toBeGreaterThan(0);
});

test('leaves the inside of a box marked as fluid alone', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/fluid.html');
  await page.getByRole('button', { name: 'Shuffle' }).click();
  await page.waitForTimeout(400);
  expect(guard.shifts).toEqual([]);
});

test('finds the same rearranging when the box is not marked', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/unmarked-board.html');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Shuffle' }).click();
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
});

test('accepts that a panel that was opened pushes what is below it down', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/details.html');
  await page.waitForTimeout(300);
  await page.locator('#summary').click();
  await page.waitForTimeout(900);
  expect(guard.shifts).toEqual([]);
});

test('does not count a move with transform or a word that changes its length', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/transform.html');
  await page.waitForTimeout(1200);
  expect(guard.shifts).toEqual([]);
});

test('finds a page that grows although nothing above the new part moves', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/page-grows.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  expect(guard.shifts.map((entry) => entry.kind)).toContain('page-height');
});

test('leaves out what the ignore option names', async ({ page }) => {
  const watched = await installLayoutGuard(page);
  await page.goto('/carousel.html');
  await page.waitForTimeout(700);
  // The slide moves inside the carousel all the time
  expect(watched.shifts.length).toBeGreaterThan(0);
  const quiet = await installLayoutGuard(page, { ignore: ['.carousel'] });
  await page.reload();
  await page.waitForTimeout(700);
  expect(quiet.shifts).toEqual([]);
});

test('allowShifts lets an action move things without a report', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/banner-on-click.html');
  await page.waitForTimeout(300);
  await guard.allowShifts(async () => {
    await page.getByRole('button', { name: 'Show the offer' }).click();
    await page.waitForTimeout(300);
  });
  await page.waitForTimeout(900);
  expect(guard.shifts).toEqual([]);
});

test('a tolerance lets a small difference pass', async ({ page }) => {
  const guard = await installLayoutGuard(page, { tolerance: 100 });
  await page.goto('/banner-on-click.html');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Show the offer' }).click();
  await page.waitForTimeout(600);
  // The card moves by 60 px, below the tolerance
  expect(guard.shifts).toEqual([]);
});

test('reports a shift once, not once per frame', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/banner-after-load.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  const count = guard.shifts.length;
  await page.waitForTimeout(600);
  expect(guard.shifts.length).toBe(count);
});

test('looks into the shadow tree of a web component', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/shadow-dom.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  // The text below the banner moved, the host and the heading above it did not
  expect(guard.shifts.map((entry) => entry.element).join(' ')).toContain('p#text');
  expect(guard.shifts.some((entry) => entry.element.includes('h1'))).toBe(false);
});

test('leaves out what ignore names inside a shadow tree', async ({ page }) => {
  const guard = await installLayoutGuard(page, { ignore: ['x-card'] });
  await page.goto('/shadow-dom.html');
  await page.waitForTimeout(700);
  expect(guard.shifts).toEqual([]);
});

test('looks into a frame as well', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/iframe.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  // The report says which frame it is from
  expect(
    guard.shifts.every((entry) => entry.element.startsWith('[frame /banner-after-load.html] ')),
  ).toBe(true);
});

test('a resize right after the load is the test sizing the window, not a shift', async ({
  page,
}) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/resize-layout.html');
  // After the guard has started to report, but soon after the load: the window is sized on purpose
  await page.waitForTimeout(120);
  await page.setViewportSize({ width: 420, height: 800 });
  await page.waitForTimeout(500);
  expect(guard.shifts).toEqual([]);
});

test('does not throw while the document of the page is being written again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await installLayoutGuard(page);
  await page.goto('/document-open.html');
  await page.waitForTimeout(700);
  expect(errors).toEqual([]);
  await expect(page.getByRole('heading', { name: 'After' })).toBeVisible();
});

test('a page that gets lower is only reported when pageHeight is any', async ({ page }) => {
  const calm = await installLayoutGuard(page);
  await page.goto('/page-shrinks.html');
  await page.waitForTimeout(600);
  expect(calm.shifts).toEqual([]);

  const strict = await installLayoutGuard(page, { pageHeight: 'any' });
  await page.reload();
  await expect.poll(() => strict.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  expect(strict.shifts[0]?.kind).toBe('page-height');
});

test.describe('on a phone', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 412, height: 800 } });

  test('a shift that makes the page wider than the window is still a shift', async ({
    page,
    browserName,
  }) => {
    // Firefox does not emulate a phone
    test.skip(browserName === 'firefox', 'isMobile is not supported in Firefox');
    const guard = await installLayoutGuard(page);
    await page.goto('/sideways-phone.html');
    await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  });
});
