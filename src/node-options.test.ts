import { describe, expect, it } from 'vitest';

import { resolveNodeOptions, resolveOptions } from './options.js';

describe('the options that are for the test and not for the page', () => {
  it('does not send the baseline and the picture switch to the page', () => {
    const options = resolveOptions({ baseline: 'tests/baseline.json', screenshot: false }, 'r');
    expect(options).not.toHaveProperty('baseline');
    expect(options).not.toHaveProperty('screenshot');
  });

  it('knows the defaults of the test side', () => {
    expect(resolveNodeOptions({})).toEqual({ baseline: undefined, screenshot: true });
    expect(resolveNodeOptions({ baseline: 'a.json', screenshot: false })).toEqual({
      baseline: 'a.json',
      screenshot: false,
    });
    expect(() => resolveNodeOptions({ baseline: '  ' })).toThrow(/baseline/);
  });

  it('refuses an animations value that does not exist', () => {
    expect(() => resolveOptions({ animations: 'maybe' as 'allow' }, 'r')).toThrow(/animations/);
    expect(resolveOptions({ animations: 'allow' }, 'r').animations).toBe('allow');
  });
});
