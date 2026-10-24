import { test as base } from '@playwright/test';

import { formatShifts } from './format.js';
import { installLayoutGuard, type LayoutGuard } from './install.js';
import { resolveNodeOptions } from './options.js';
import type { LayoutGuardOptions, LayoutGuardTestOptions } from './types.js';

export interface LayoutGuardFixtures extends LayoutGuardTestOptions {
  /** The guard of this test, to allow movement for an action or to look at what it found */
  guard: LayoutGuard;
}

const off: LayoutGuard = {
  shifts: [],
  unknownShifts: [],
  allowShifts: (action) => action(),
  forget: () => Promise.resolve(),
  pause: () => Promise.resolve(),
  resume: () => Promise.resolve(),
  assertStable: () => undefined,
  screenshot: () => Promise.resolve(undefined),
  updateBaseline: () => undefined,
};

/** Set by the person who wants the baseline file written instead of the test failed. */
const updating = (): boolean => ['1', 'true'].includes(process.env.LAYOUT_GUARD_UPDATE ?? '');

/**
 * Playwright's `test`, with the guard switched on for every test: when the test ends and something
 * on the page moved or changed its size, the test fails and says which element and how far.
 */
export const test = base.extend<LayoutGuardFixtures>({
  layoutGuard: [true, { option: true }],
  guard: [
    async ({ context, layoutGuard }, use, testInfo) => {
      if (layoutGuard === false) {
        await use(off);
        return;
      }
      const options: LayoutGuardOptions = layoutGuard === true ? {} : layoutGuard;
      const guard = await installLayoutGuard(context, options);
      await use(guard);
      if (guard.shifts.length === 0) {
        return;
      }
      const unknown = guard.unknownShifts;
      await testInfo.attach('layout-shifts.json', {
        body: JSON.stringify(
          guard.shifts.map((shift) => ({ ...shift, known: !unknown.includes(shift) })),
          null,
          2,
        ),
        contentType: 'application/json',
      });
      if (options.baseline !== undefined && updating()) {
        // Recording the shifts that are there today: nothing fails
        guard.updateBaseline();
        return;
      }
      if (unknown.length === 0) {
        return;
      }
      if (resolveNodeOptions(options).screenshot) {
        const picture = await guard.screenshot();
        if (picture !== undefined) {
          await testInfo.attach('layout-shifts.png', { body: picture, contentType: 'image/png' });
        }
      }
      // A test that already failed says why; a second error about the layout would only hide it
      if (testInfo.errors.length === 0) {
        const known = guard.shifts.length - unknown.length;
        const note =
          known > 0 ? `\n\n(${String(known)} known shifts from the baseline are not listed)` : '';
        throw new Error(`${formatShifts(unknown)}${note}`);
      }
    },
    { auto: true },
  ],
});
