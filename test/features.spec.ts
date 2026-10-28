import { expect, test } from '@playwright/test';

import { installLayoutGuard } from '../src/index.js';

/** Animations that are meant, the picture of the moved boxes and the baseline of known shifts. */

test('an animation of a layout property that ends is a shift, unless animations is allow', async ({
  page,
}) => {
  const strict = await installLayoutGuard(page);
  await page.goto('/accordion.html');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Open panel' }).click();
  await expect.poll(() => strict.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
});

test('with animations allowed a panel that slides open is not reported, a jump after it is', async ({
  page,
}) => {
  const guard = await installLayoutGuard(page, { animations: 'allow' });
  await page.goto('/accordion.html');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Open panel' }).click();
  await page.waitForTimeout(800);
  expect(guard.shifts).toEqual([]);
  // Nothing animates any more: what moves now is a shift
  await page.getByRole('button', { name: 'Jump' }).click();
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  expect(guard.shifts[0]?.element).toContain('card');
});

test('an animation that never ends is not let go, also with animations allowed', async ({
  page,
}) => {
  const guard = await installLayoutGuard(page, { animations: 'allow' });
  await page.goto('/endless.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
});

test('finds a part that drifts by less than the tolerance in every frame', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/slow-drift.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  expect(guard.shifts[0]?.element).toContain('drifter');
});

test('takes a picture of the moved boxes', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/banner-after-load.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  const picture = await guard.screenshot();
  expect(picture).toBeDefined();
  // A PNG starts with these eight bytes
  expect([...(picture ?? Buffer.alloc(0)).subarray(0, 8)]).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  expect(picture?.length ?? 0).toBeGreaterThan(1000);
  // The marks are gone again and the page is as it was
  expect(await page.locator('[data-layout-guard-marks]').count()).toBe(0);
});

test('has no picture when nothing moved', async ({ page }) => {
  const guard = await installLayoutGuard(page);
  await page.goto('/stable.html');
  await page.waitForTimeout(300);
  expect(await guard.screenshot()).toBeUndefined();
});

test('a shift that is in the baseline is known, another one is not', async ({ page }, testInfo) => {
  const baseline = testInfo.outputPath('baseline.json');
  const guard = await installLayoutGuard(page, { baseline });
  await page.goto('/banner-after-load.html');
  await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  // Nothing is known yet
  expect(guard.unknownShifts.length).toBe(guard.shifts.length);
  expect(() => {
    guard.assertStable();
  }).toThrow(/moved/);

  guard.updateBaseline();
  expect(guard.unknownShifts).toEqual([]);
  expect(() => {
    guard.assertStable();
  }).not.toThrow();

  // Another page with other elements: not in the baseline
  await page.goto('/accordion.html');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Jump' }).click();
  await expect.poll(() => guard.unknownShifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  expect(guard.unknownShifts.every((entry) => entry.url === '/accordion.html')).toBe(true);
});

test.describe('an app that draws itself after the load event', () => {
  test('is reported as moving without armWhen', async ({ page }) => {
    const guard = await installLayoutGuard(page);
    await page.goto('/app-after-load.html');
    await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
    expect(guard.shifts[0]?.kind).toBe('moved');
  });

  test('is not reported with armWhen, and what comes later still is', async ({ page }) => {
    const guard = await installLayoutGuard(page, { armWhen: '#app' });
    await page.goto('/app-after-load.html');
    await expect.poll(() => guard.armed(), { timeout: 3000 }).toBe(true);
    // Let the quiet moment after the arming pass
    await page.waitForTimeout(900);
    expect(guard.shifts).toEqual([]);
    await page.evaluate(() => {
      (window as unknown as { showLateBanner: () => void }).showLateBanner();
    });
    await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  });

  test('is not armed while the selector matches nothing', async ({ page }) => {
    const guard = await installLayoutGuard(page, { armWhen: '#never-drawn' });
    await page.goto('/app-after-load.html');
    await page.waitForTimeout(900);
    expect(await guard.armed()).toBe(false);
    // Nothing is reported because nothing is watched: the fixture fails such a test (below)
    expect(guard.shifts).toEqual([]);
  });

  test('is armed when it is combined with start: immediate', async ({ page }) => {
    const guard = await installLayoutGuard(page, { armWhen: '#app', start: 'immediate' });
    await page.goto('/app-after-load.html');
    await expect.poll(() => guard.armed(), { timeout: 3000 }).toBe(true);
  });

  test('a page without armWhen counts as armed once it has loaded', async ({ page }) => {
    const guard = await installLayoutGuard(page);
    await page.goto('/stable.html');
    await expect.poll(() => guard.armed(), { timeout: 3000 }).toBe(true);
  });
});

test.describe('frames that are left out', () => {
  test('a frame whose address is named is not watched', async ({ page }) => {
    const guard = await installLayoutGuard(page, { ignoreFrames: ['banner-after-load'] });
    await page.goto('/iframe.html');
    await page.waitForTimeout(1000);
    expect(guard.shifts).toEqual([]);
  });

  test('a star stands for any characters, and a text that is not in the address leaves it in', async ({
    page,
  }) => {
    const left = await installLayoutGuard(page, { ignoreFrames: ['*/banner-after-*.html'] });
    await page.goto('/iframe.html');
    await page.waitForTimeout(1000);
    expect(left.shifts).toEqual([]);
    const other = await page.context().newPage();
    const kept = await installLayoutGuard(other, { ignoreFrames: ['somewhere-else'] });
    await other.goto('/iframe.html');
    await expect.poll(() => kept.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  });

  test('the page itself is still watched', async ({ page }) => {
    const guard = await installLayoutGuard(page, { ignoreFrames: ['banner-after-load'] });
    await page.goto('/banner-after-load.html');
    await expect.poll(() => guard.shifts.length, { timeout: 3000 }).toBeGreaterThan(0);
  });
});

test.describe('refuses options that cannot work', () => {
  test('ignoreFrames and armWhen', async ({ page }) => {
    await expect(installLayoutGuard(page, { ignoreFrames: [''] })).rejects.toThrow('ignoreFrames');
    await expect(
      installLayoutGuard(page, { ignoreFrames: 'x' as unknown as string[] }),
    ).rejects.toThrow('ignoreFrames');
    await expect(installLayoutGuard(page, { armWhen: '  ' })).rejects.toThrow('armWhen');
  });
});
