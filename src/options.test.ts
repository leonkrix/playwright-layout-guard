import { describe, expect, it } from 'vitest';

import { DEFAULTS, resolveOptions } from './options.js';

describe('resolveOptions', () => {
  it('fills in the defaults and the name of the report function', () => {
    expect(resolveOptions({}, '__report')).toEqual({ ...DEFAULTS, report: '__report' });
  });

  it('takes what is set and keeps the default for what is left out or undefined', () => {
    const options = resolveOptions({ tolerance: 3, quietMs: undefined, ignore: ['.ad'] }, 'r');
    expect(options.tolerance).toBe(3);
    expect(options.quietMs).toBe(DEFAULTS.quietMs);
    expect(options.ignore).toEqual(['.ad']);
  });

  it('does not share the list of ignored selectors with the caller or the defaults', () => {
    const ignore = ['.ad'];
    const options = resolveOptions({ ignore }, 'r');
    options.ignore.push('.other');
    expect(ignore).toEqual(['.ad']);
    expect(DEFAULTS.ignore).toEqual([]);
  });

  it.each([
    [{ tolerance: -1 }, /tolerance/],
    [{ tolerance: Number.NaN }, /tolerance/],
    [{ quietMs: -5 }, /quietMs/],
    [{ maxReports: 0 }, /maxReports/],
    [{ maxReports: 2.5 }, /maxReports/],
    [{ fluidAttribute: 'data layout' }, /fluidAttribute/],
    [{ fluidAttribute: '' }, /fluidAttribute/],
  ])('refuses %o', (options, message) => {
    expect(() => resolveOptions(options, 'r')).toThrow(message);
  });

  it('accepts the edge values that work', () => {
    expect(() =>
      resolveOptions({ tolerance: 0, quietMs: 0, maxReports: 1, fluidAttribute: 'data-x' }, 'r'),
    ).not.toThrow();
  });
});
