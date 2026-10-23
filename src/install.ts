import type { BrowserContext, Page } from '@playwright/test';

import { formatShifts } from './format.js';
import { resolveOptions } from './options.js';
import { guardInPage } from './page-script.js';
import type { LayoutGuardOptions, Shift } from './types.js';

/** The guard of one test: what it found so far, and how to talk to it. */
export interface LayoutGuard {
  /** Everything that moved so far, in the order it was found */
  readonly shifts: readonly Shift[];
  /** Runs an action during which things may move (a panel that opens): nothing is reported for it */
  allowShifts: <T>(action: () => Promise<T>) => Promise<T>;
  /** Forgets where everything was and looks again after the quiet period */
  forget: () => Promise<void>;
  /** Stops looking until `resume` */
  pause: () => Promise<void>;
  /** Looks again, from the current layout */
  resume: () => Promise<void>;
  /** Throws an error that names every shift, when there is one */
  assertStable: () => void;
}

let counter = 0;

type Method = 'pause' | 'resume' | 'forget';

/**
 * Starts the guard for every page of a browser context (or one page). Call it before the page is
 * opened: the part that runs in the page is added as an init script. The fixture of this package
 * does that for you; use this when you build your own.
 */
export async function installLayoutGuard(
  target: BrowserContext | Page,
  options: LayoutGuardOptions = {},
): Promise<LayoutGuard> {
  counter += 1;
  const report = `__layoutGuard${String(counter)}`;
  const resolved = resolveOptions(options, report);
  const shifts: Shift[] = [];
  await target.exposeFunction(report, (shift: Shift) => {
    shifts.push(shift);
  });
  await target.addInitScript(guardInPage, resolved);

  const pages = (): Page[] => ('pages' in target ? target.pages() : [target]);
  const tell = async (method: Method): Promise<void> => {
    await Promise.all(
      pages().map(async (page) => {
        if (page.isClosed()) {
          return;
        }
        await page.evaluate(
          ([name, action]) => {
            const controllers = window as unknown as Record<
              string,
              Record<string, (() => void) | undefined> | undefined
            >;
            controllers[`${String(name)}:controller`]?.[String(action)]?.();
          },
          [report, method],
        );
      }),
    );
  };

  return {
    shifts,
    allowShifts: async (action) => {
      await tell('pause');
      try {
        return await action();
      } finally {
        await tell('resume');
      }
    },
    forget: () => tell('forget'),
    pause: () => tell('pause'),
    resume: () => tell('resume'),
    assertStable: () => {
      if (shifts.length > 0) {
        throw new Error(formatShifts(shifts));
      }
    },
  };
}
