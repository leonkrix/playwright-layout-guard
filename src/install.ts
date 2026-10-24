import { resolve } from 'node:path';

import type { BrowserContext, Frame, Page } from '@playwright/test';

import { addToBaseline, isKnown, readBaseline } from './baseline.js';
import { formatShifts } from './format.js';
import { drawMarks, type Mark, removeMarks } from './marks.js';
import { resolveNodeOptions, resolveOptions } from './options.js';
import { guardInPage } from './page-script.js';
import type { LayoutGuardOptions, Shift } from './types.js';

/** The guard of one test: what it found so far, and how to talk to it. */
export interface LayoutGuard {
  /** Everything that moved so far, in the order it was found */
  readonly shifts: readonly Shift[];
  /** The shifts that are not in the baseline (all of them when there is no baseline) */
  readonly unknownShifts: readonly Shift[];
  /** Runs an action during which things may move (a panel that opens): nothing is reported for it */
  allowShifts: <T>(action: () => Promise<T>) => Promise<T>;
  /** Forgets where everything was and looks again after the quiet period */
  forget: () => Promise<void>;
  /** Stops looking until `resume` */
  pause: () => Promise<void>;
  /** Looks again, from the current layout */
  resume: () => Promise<void>;
  /** Throws an error that names every shift that is not in the baseline, when there is one */
  assertStable: () => void;
  /**
   * A picture of the page with the moved boxes marked, as PNG (`undefined` when there is nothing to
   * show: no shift, or only shifts inside a frame, or the page is gone).
   */
  screenshot: () => Promise<Buffer | undefined>;
  /** Writes the shifts found so far into the baseline file (does nothing without a baseline) */
  updateBaseline: () => void;
}

let counter = 0;

/** What Playwright tells a function that was exposed to the page about where the call came from. */
interface Source {
  page: Page;
  frame: Frame;
}

type Method = 'pause' | 'resume' | 'forget';

/** `/docs/intro` of `https://example.com/docs/intro?a=1#top`; anything else as it is */
function pathOf(address: string): string {
  try {
    return new URL(address).pathname;
  } catch {
    return address;
  }
}

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
  const node = resolveNodeOptions(options);
  const baselinePath = node.baseline === undefined ? undefined : resolve(node.baseline);
  const shifts: Shift[] = [];
  // Where each shift was found: the page to take the picture of
  const sources = new WeakMap<Shift, Source>();
  await target.exposeBinding(report, (source: Source, shift: Omit<Shift, 'url'>) => {
    const found: Shift = { ...shift, url: pathOf(source.frame.url()) };
    sources.set(found, source);
    shifts.push(found);
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

  const unknown = (): Shift[] => {
    if (baselinePath === undefined) {
      return [...shifts];
    }
    const entries = readBaseline(baselinePath);
    return shifts.filter((shift) => !isKnown(shift, entries));
  };

  const screenshot = async (): Promise<Buffer | undefined> => {
    // Only what was found in the page itself: the places inside a frame are relative to the frame
    const drawable = shifts.filter((shift) => {
      const source = sources.get(shift);
      return source !== undefined && source.frame === source.page.mainFrame();
    });
    const first = drawable[0];
    const page = first === undefined ? undefined : sources.get(first)?.page;
    if (page === undefined || page.isClosed()) {
      return undefined;
    }
    const marks: Mark[] = drawable
      .filter((shift) => sources.get(shift)?.page === page)
      .map((shift) => ({
        index: shifts.indexOf(shift) + 1,
        kind: shift.kind,
        before: shift.before,
        after: shift.after,
      }));
    try {
      // The marks are extra elements: the guard must not look at them
      await tell('pause');
      const clip = await page.mainFrame().evaluate(drawMarks, marks);
      return await page.screenshot({ fullPage: true, clip, caret: 'hide' });
    } catch {
      return undefined;
    } finally {
      await page
        .mainFrame()
        .evaluate(removeMarks)
        .catch(() => undefined);
      await tell('resume').catch(() => undefined);
    }
  };

  return {
    shifts,
    get unknownShifts() {
      return unknown();
    },
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
      const found = unknown();
      if (found.length > 0) {
        throw new Error(formatShifts(found));
      }
    },
    screenshot,
    updateBaseline: () => {
      if (baselinePath !== undefined) {
        addToBaseline(baselinePath, shifts);
      }
    },
  };
}
