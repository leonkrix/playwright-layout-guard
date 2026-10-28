import type { LayoutGuardOptions, PageOptions } from './types.js';

export const DEFAULTS = {
  ignore: [] as string[],
  fluidAttribute: 'data-layout-fluid',
  tolerance: 1,
  quietMs: 600,
  scope: 'body',
  start: 'load' as 'load' | 'immediate',
  ignoreInsideInteractive: true,
  pageHeight: 'growth' as 'growth' | 'any',
  animations: 'report' as 'report' | 'allow',
  maxReports: 50,
  ignoreFrames: [] as string[],
  armWhen: undefined as string | undefined,
};

/** The options that are used on the side of the test and not sent to the page. */
export interface NodeOptions {
  baseline: string | undefined;
  screenshot: boolean;
}

export function resolveNodeOptions(options: LayoutGuardOptions = {}): NodeOptions {
  if (options.baseline?.trim() === '') {
    throw new TypeError('layout-guard: baseline must be the path of a file');
  }
  return { baseline: options.baseline, screenshot: options.screenshot ?? true };
}

/** Fills in the defaults and refuses values that cannot work, so a typo fails at once and not silently. */
export function resolveOptions(options: LayoutGuardOptions = {}, report: string): PageOptions {
  // What is for the side of the test (the baseline, the picture) does not go to the page
  const forPage: LayoutGuardOptions = { ...options };
  delete forPage.baseline;
  delete forPage.screenshot;
  const merged = { ...DEFAULTS, ...definedOnly(forPage) };
  if (!Number.isFinite(merged.tolerance) || merged.tolerance < 0) {
    throw new RangeError(
      `layout-guard: tolerance must be 0 or more, not ${String(merged.tolerance)}`,
    );
  }
  if (!Number.isFinite(merged.quietMs) || merged.quietMs < 0) {
    throw new RangeError(`layout-guard: quietMs must be 0 or more, not ${String(merged.quietMs)}`);
  }
  if (!Number.isInteger(merged.maxReports) || merged.maxReports < 1) {
    throw new RangeError('layout-guard: maxReports must be a whole number of 1 or more');
  }
  const pageHeight: string = merged.pageHeight;
  if (pageHeight !== 'growth' && pageHeight !== 'any') {
    throw new TypeError(`layout-guard: pageHeight must be "growth" or "any", not "${pageHeight}"`);
  }
  const animations: string = merged.animations;
  if (animations !== 'report' && animations !== 'allow') {
    throw new TypeError(
      `layout-guard: animations must be "report" or "allow", not "${animations}"`,
    );
  }
  if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(merged.fluidAttribute)) {
    throw new TypeError(
      `layout-guard: fluidAttribute must be the name of an attribute, not "${merged.fluidAttribute}"`,
    );
  }
  if (
    !Array.isArray(merged.ignoreFrames) ||
    merged.ignoreFrames.some((entry) => typeof entry !== 'string' || entry === '')
  ) {
    throw new TypeError('layout-guard: ignoreFrames must be a list of texts, none of them empty');
  }
  if (
    merged.armWhen !== undefined &&
    (typeof merged.armWhen !== 'string' || merged.armWhen.trim() === '')
  ) {
    throw new TypeError('layout-guard: armWhen must be a CSS selector');
  }
  return {
    ...merged,
    ignore: [...merged.ignore],
    ignoreFrames: [...merged.ignoreFrames],
    report,
  };
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
