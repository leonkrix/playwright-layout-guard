import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addToBaseline, isKnown, normalise, readBaseline } from './baseline.js';
import type { Shift } from './types.js';

const shift = (overrides: Partial<Shift> = {}): Shift => ({
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

let folder = '';
let file = '';

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'layout-guard-'));
  file = join(folder, 'baseline.json');
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('isKnown', () => {
  const entries = [{ kind: 'moved' as const, url: '/docs', element: 'main > p.card' }];

  it('knows a shift by its kind, its page and its element, not by how far it moved', () => {
    expect(isKnown(shift(), entries)).toBe(true);
    expect(isKnown(shift({ after: { top: 500, left: 16, width: 300, height: 40 } }), entries)).toBe(
      true,
    );
  });

  it('does not know a shift on another page, of another element or of another kind', () => {
    expect(isKnown(shift({ url: '/other' }), entries)).toBe(false);
    expect(isKnown(shift({ element: 'footer' }), entries)).toBe(false);
    expect(isKnown(shift({ kind: 'page-height' }), entries)).toBe(false);
  });
});

describe('readBaseline', () => {
  it('reads a file that does not exist as an empty baseline', () => {
    expect(readBaseline(file)).toEqual([]);
  });

  it('refuses a file that is not JSON, has no entries or has a wrong entry', () => {
    writeFileSync(file, 'not json');
    expect(() => readBaseline(file)).toThrow(/not valid JSON/);
    writeFileSync(file, '{"version":1}');
    expect(() => readBaseline(file)).toThrow(/no "entries"/);
    writeFileSync(file, '{"entries":[{"kind":"wobble","url":"/","element":"x"}]}');
    expect(() => readBaseline(file)).toThrow(/not valid/);
  });
});

describe('normalise', () => {
  it('sorts the entries and drops doubles, so that a file stays calm in a diff', () => {
    const entries = normalise([
      { kind: 'moved', url: '/b', element: 'z' },
      { kind: 'moved', url: '/a', element: 'y' },
      { kind: 'moved', url: '/a', element: 'y' },
      { kind: 'moved', url: '/a', element: 'x' },
    ]);
    expect(entries.map((entry) => `${entry.url} ${entry.element}`)).toEqual([
      '/a x',
      '/a y',
      '/b z',
    ]);
  });
});

describe('addToBaseline', () => {
  it('writes the shifts and keeps what is there already', () => {
    addToBaseline(file, [shift()]);
    addToBaseline(file, [shift({ element: 'footer' }), shift()]);
    expect(readBaseline(file).map((entry) => entry.element)).toEqual(['footer', 'main > p.card']);
    expect(readFileSync(file, 'utf8')).toMatch(/"version": 1/);
    expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true);
  });

  it('leaves no lock behind', () => {
    addToBaseline(file, [shift()]);
    expect(() => readFileSync(`${file}.lock`)).toThrow();
  });
});
