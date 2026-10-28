import { expect, test } from '../src/index.js';

/**
 * The fixture itself: a test that lets the page move must fail, a calm one must pass. Playwright's
 * `test.fail()` turns "this test fails" into a pass, so these tests prove that the guard really
 * stops a test.
 */

test('passes on a page that stays put', async ({ page }) => {
  await page.goto('/stable.html');
  await page.getByRole('button', { name: 'Press' }).click();
  await page.waitForTimeout(400);
  await expect(page.locator('h1')).toBeVisible();
});

test.describe('a page that moves', () => {
  test.fail();

  test('fails the test that visited it', async ({ page }) => {
    await page.goto('/banner-after-load.html');
    // The test itself finds nothing wrong, the guard does
    await expect(page.locator('#title')).toBeVisible();
    await page.waitForTimeout(600);
  });
});

test.describe('with the guard switched off', () => {
  test.use({ layoutGuard: false });

  test('does not fail on a page that moves', async ({ page }) => {
    await page.goto('/banner-after-load.html');
    await page.waitForTimeout(600);
    await expect(page.locator('#title')).toBeVisible();
  });
});

test.describe('with options', () => {
  test.use({ layoutGuard: { ignore: ['main'] } });

  test('leaves out what ignore names', async ({ page }) => {
    await page.goto('/banner-after-load.html');
    await page.waitForTimeout(600);
    await expect(page.locator('#title')).toBeVisible();
  });
});

test('allows shifts for an action, and shows what it found', async ({ page, guard }) => {
  await page.goto('/banner-on-click.html');
  await page.waitForTimeout(300);
  await guard.allowShifts(async () => {
    await page.getByRole('button', { name: 'Show the offer' }).click();
    await page.waitForTimeout(300);
  });
  await page.waitForTimeout(800);
  expect(guard.shifts).toEqual([]);
});

test.describe('with armWhen that never matches', () => {
  test.fail();
  test.use({ layoutGuard: { armWhen: '#never-drawn' } });

  test('fails the test, because nothing was watched', async ({ page }) => {
    await page.goto('/app-after-load.html');
    await page.waitForTimeout(600);
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('with armWhen that matches', () => {
  test.use({ layoutGuard: { armWhen: '#app' } });

  test('passes on an app that draws itself after the load', async ({ page }) => {
    await page.goto('/app-after-load.html');
    await expect(page.locator('#app')).toBeVisible();
    await page.waitForTimeout(1000);
  });
});
