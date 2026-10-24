import { expect, test } from '../src/index.js';

/** The fixture with a baseline file: a known shift passes, a new one fails the test. */

test.describe('with a baseline', () => {
  test.use({ layoutGuard: { baseline: 'test/fixtures/banner.baseline.json' } });

  test('a page whose shift is known passes', async ({ page }) => {
    await page.goto('/banner-after-load.html');
    await page.waitForTimeout(600);
    await expect(page.locator('#title')).toBeVisible();
  });

  test.describe('and a shift that is not in it', () => {
    test.fail();

    test('fails the test', async ({ page }) => {
      await page.goto('/banner-on-click.html');
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'Show the offer' }).click();
      await page.waitForTimeout(600);
    });
  });
});
