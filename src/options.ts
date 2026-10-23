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
  maxReports: 50,
};

/** Fills in the defaults and refuses values that cannot work, so a typo fails at once and not silently. */
export function resolveOptions(options: LayoutGuardOptions = {}, report: string): PageOptions {
  const merged = { ...DEFAULTS, ...definedOnly(options) };
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
  if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(merged.fluidAttribute)) {
    throw new TypeError(
      `layout-guard: fluidAttribute must be the name of an attribute, not "${merged.fluidAttribute}"`,
    );
  }
  return { ...merged, ignore: [...merged.ignore], report };
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
