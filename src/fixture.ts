import { test as base } from '@playwright/test';

import { formatShifts } from './format.js';
import { installLayoutGuard, type LayoutGuard } from './install.js';
import type { LayoutGuardOptions } from './types.js';

export interface LayoutGuardFixtures {
  /**
   * `false` switches the guard off for a test or a file (`test.use({ layoutGuard: false })`; say
   * why in a comment), an object sets its options (`test.use({ layoutGuard: { ignore: ['.ad'] } })`).
   */
  layoutGuard: boolean | LayoutGuardOptions;
  /** The guard of this test, to allow movement for an action or to look at what it found */
  guard: LayoutGuard;
}

const off: LayoutGuard = {
  shifts: [],
  allowShifts: (action) => action(),
  forget: () => Promise.resolve(),
  pause: () => Promise.resolve(),
  resume: () => Promise.resolve(),
  assertStable: () => undefined,
};

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
      const guard = await installLayoutGuard(context, layoutGuard === true ? {} : layoutGuard);
      await use(guard);
      if (guard.shifts.length === 0) {
        return;
      }
      await testInfo.attach('layout-shifts.json', {
        body: JSON.stringify(guard.shifts, null, 2),
        contentType: 'application/json',
      });
      // A test that already failed says why; a second error about the layout would only hide it
      if (testInfo.errors.length === 0) {
        throw new Error(formatShifts(guard.shifts));
      }
    },
    { auto: true },
  ],
});
