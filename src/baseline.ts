import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Shift } from './types.js';

/** What identifies a known shift: what it is, where it was found and which element it is. */
export interface BaselineEntry {
  kind: Shift['kind'];
  url: string;
  element: string;
}

interface BaselineFile {
  version: 1;
  entries: BaselineEntry[];
}

export function entryOf(shift: Pick<Shift, 'kind' | 'url' | 'element'>): BaselineEntry {
  return { kind: shift.kind, url: shift.url, element: shift.element };
}

const keyOf = (entry: BaselineEntry): string =>
  `${entry.kind}\u0000${entry.url}\u0000${entry.element}`;

/** Whether a shift is one of the known ones. */
export function isKnown(
  shift: Pick<Shift, 'kind' | 'url' | 'element'>,
  entries: readonly BaselineEntry[],
): boolean {
  const key = keyOf(entryOf(shift));
  return entries.some((entry) => keyOf(entry) === key);
}

/** The entries of a baseline file; a file that does not exist is an empty baseline. */
export function readBaseline(path: string): BaselineEntry[] {
  if (!existsSync(path)) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new SyntaxError(`layout-guard: the baseline ${path} is not valid JSON`);
  }
  const entries = (parsed as Partial<BaselineFile> | null)?.entries;
  if (!Array.isArray(entries)) {
    throw new TypeError(`layout-guard: the baseline ${path} has no "entries" list`);
  }
  return entries.map((entry: unknown) => {
    const { kind, url, element } = (entry ?? {}) as Partial<BaselineEntry>;
    if (
      (kind !== 'moved' && kind !== 'page-height') ||
      typeof url !== 'string' ||
      typeof element !== 'string'
    ) {
      throw new TypeError(`layout-guard: an entry of the baseline ${path} is not valid`);
    }
    return { kind, url, element };
  });
}

/** The same entries in a fixed order without doubles, so that the file stays calm in a diff. */
export function normalise(entries: readonly BaselineEntry[]): BaselineEntry[] {
  const byKey = new Map(entries.map((entry) => [keyOf(entry), entry]));
  return [...byKey.values()].sort(
    (a, b) =>
      a.url.localeCompare(b.url) ||
      a.element.localeCompare(b.element) ||
      a.kind.localeCompare(b.kind),
  );
}

/** Runs an action while this process holds a lock next to the file (tests run in several workers). */
function withLock<T>(path: string, action: () => T): T {
  const lock = `${path}.lock`;
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (Date.now() - started > 5000) {
        // A lock that nobody gave back (a worker that was killed) must not block for ever
        rmSync(lock, { recursive: true, force: true });
      }
    }
  }
  try {
    return action();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Adds the shifts to the baseline file, without losing what other workers wrote meanwhile. */
export function addToBaseline(path: string, shifts: readonly Shift[]): void {
  mkdirSync(dirname(path), { recursive: true });
  withLock(path, () => {
    const entries = normalise([...readBaseline(path), ...shifts.map(entryOf)]);
    const file: BaselineFile = { version: 1, entries };
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`);
    renameSync(temporary, path);
  });
}
