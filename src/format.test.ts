import { describe, expect, it } from 'vitest';

import { describeShift, formatShifts } from './format.js';
import type { Shift } from './types.js';

const moved = (overrides: Partial<Shift> = {}): Shift => ({
  kind: 'moved',
  element: 'main > p.card',
  text: 'Hello',
  before: { top: 10, left: 16, width: 300, height: 40 },
  after: { top: 70, left: 16, width: 300, height: 40 },
  affected: 0,
  at: 180,
  url: '/docs',
  ...overrides,
});

describe('describeShift', () => {
  it('says what moved, how far and when', () => {
    expect(describeShift(moved())).toBe(
      '<main > p.card> "Hello" moved 60 px down (top 10 to 70, left 16 to 16) after 180 ms',
    );
  });

  it('names both directions', () => {
    const text = describeShift(moved({ after: { top: 5, left: 30, width: 300, height: 40 } }));
    expect(text).toContain('5 px up and 14 px right');
  });

  it('counts what went with it', () => {
    expect(describeShift(moved({ affected: 1 }))).toContain('with 1 element inside it');
    expect(describeShift(moved({ affected: 7 }))).toContain('with 7 elements inside it');
  });

  it('leaves out the text when there is none', () => {
    expect(describeShift(moved({ text: '' }))).not.toContain('""');
  });

  it('describes a page that became higher', () => {
    const text = describeShift({
      kind: 'page-height',
      element: 'the page',
      text: '',
      before: { top: 0, left: 0, width: 0, height: 800 },
      after: { top: 0, left: 0, width: 0, height: 2300 },
      affected: 0,
      at: 400,
      url: '/docs',
    });
    expect(text).toBe('the page became 1500 px higher (800 to 2300 px) after 400 ms');
  });
});

describe('formatShifts', () => {
  it('says that nothing moved', () => {
    expect(formatShifts([])).toBe('Nothing on the page moved.');
  });

  it('numbers the shifts and tells what can be done about them', () => {
    const message = formatShifts([moved(), moved({ element: 'footer' })]);
    expect(message).toContain('(2 shifts)');
    expect(message).toContain('1. <main > p.card>');
    expect(message).toContain('2. <footer>');
    expect(message).toContain('data-layout-fluid');
    expect(message).toContain('allowShifts');
  });

  it('uses the singular for one shift', () => {
    expect(formatShifts([moved()])).toContain('(1 shift)');
  });
});
