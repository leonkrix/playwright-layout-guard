import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import {
  type Browser,
  type BrowserType,
  chromium,
  devices,
  firefox,
  type Page,
  webkit,
} from '@playwright/test';

import { describeShift } from './format.js';
import { installLayoutGuard } from './install.js';
import { DEFAULTS } from './options.js';
import type { LayoutGuardOptions, Shift } from './types.js';

export type Format = 'text' | 'json' | 'markdown' | 'html';
export type FailOn = 'shift' | 'never';
export type BrowserName = 'chromium' | 'firefox' | 'webkit';

/** What the command line asked for. */
export interface ScanArguments {
  urls: string[];
  /** A file with more addresses */
  file: string | undefined;
  browser: BrowserName;
  format: Format;
  out: string | undefined;
  failOn: FailOn;
  /** Seconds to leave the page alone after it has loaded */
  wait: number;
  scroll: boolean;
  /** Milliseconds to wait for a page to load */
  timeout: number;
  immediate: boolean;
  armWhen: string | undefined;
  optionsFile: string | undefined;
  device: string | undefined;
  screenshots: string | undefined;
}

export type Parsed =
  | { kind: 'scan'; scan: ScanArguments }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string };

const FORMATS: readonly Format[] = ['text', 'json', 'markdown', 'html'];
const FAIL_ON: readonly FailOn[] = ['shift', 'never'];
const BROWSERS: readonly BrowserName[] = ['chromium', 'firefox', 'webkit'];

export const HELP = `Look at public pages the way the layout guard looks at a test.

Usage
  playwright-layout-guard scan <url...> [options]

Every page is opened in a fresh browser, left alone for a few seconds and scrolled once, without
clicks. The guard reports every box that moved or changed its size after the page had loaded, how far
and when. Next to it comes the layout shift score (CLS) of the browser, where the browser has one.

Options
  --file <path>         Read more addresses from a file, one per line (# starts a comment)
  --browser <name>      chromium (default), firefox or webkit
  --format <name>       text (default), json, markdown or html
  --out <path>          Write the report to a file instead of the console
  --fail-on <level>     shift (default) or never: when the exit code is 1
  --options <path>      A JSON file with the options of the guard, for example
                        { "ignore": [".ad-slot"], "ignoreFrames": ["widget.example"] }
  --immediate           Also report what moves while the page loads (start: immediate)
  --arm-when <selector> For an app that draws itself after the load: report from the moment
                        this element is shown
  --screenshots <dir>   Save a picture with the moved boxes marked for every page with a shift
  --wait <seconds>      How long to leave a page alone after the load (default 4)
  --no-scroll           Do not scroll through the page
  --timeout <seconds>   How long a page may take to load (default 45)
  --device <name>       A device of Playwright, for example "iPhone 13"
  -h, --help            This text
  -v, --version         The version

Exit code: 0 when nothing moved (or with --fail-on never), 1 when something did, 2 when the command
was wrong or a page could not be loaded.

Playwright needs its browser: npx playwright install chromium
`;

type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

function numberOf(text: string | undefined, fallback: number, name: string): Checked<number> {
  if (text === undefined) {
    return { ok: true, value: fallback };
  }
  const value = Number(text);
  return Number.isFinite(value) && value >= 0
    ? { ok: true, value }
    : { ok: false, message: `--${name} needs a number, not "${text}"` };
}

function choiceOf<T extends string>(
  text: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string,
): Checked<T> {
  if (text === undefined) {
    return { ok: true, value: fallback };
  }
  const found = allowed.find((item) => item === text);
  return found === undefined
    ? { ok: false, message: `--${name} is one of ${allowed.join(', ')}, not "${text}"` }
    : { ok: true, value: found };
}

/** An address as a person types it: `example.com` means `https://example.com`. */
export function normalizeUrl(text: string): string | undefined {
  const trimmed = text.trim();
  const full = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(full);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** The addresses of a file: one per line, empty lines and `#` comments left out. */
export function parseUrlList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** Reads the command line. Pure, so that it can be tested without a browser. */
export function parseCli(argv: readonly string[]): Parsed {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        file: { type: 'string' },
        browser: { type: 'string' },
        format: { type: 'string' },
        out: { type: 'string' },
        'fail-on': { type: 'string' },
        options: { type: 'string' },
        immediate: { type: 'boolean' },
        'arm-when': { type: 'string' },
        screenshots: { type: 'string' },
        wait: { type: 'string' },
        'no-scroll': { type: 'boolean' },
        timeout: { type: 'string' },
        device: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;
  if (values.help === true) {
    return { kind: 'help' };
  }
  if (values.version === true) {
    return { kind: 'version' };
  }
  const [command, ...rest] = positionals;
  if (command === undefined) {
    return { kind: 'help' };
  }
  if (command !== 'scan') {
    return { kind: 'error', message: `unknown command "${command}" (the only one is "scan")` };
  }
  const text = (name: string): string | undefined => {
    const value = values[name];
    return typeof value === 'string' ? value : undefined;
  };
  const browser = choiceOf(text('browser'), BROWSERS, 'chromium', 'browser');
  const format = choiceOf(text('format'), FORMATS, 'text', 'format');
  const failOn = choiceOf(text('fail-on'), FAIL_ON, 'shift', 'fail-on');
  const wait = numberOf(text('wait'), 4, 'wait');
  const timeout = numberOf(text('timeout'), 45, 'timeout');
  for (const checked of [browser, format, failOn, wait, timeout]) {
    if (!checked.ok) {
      return { kind: 'error', message: checked.message };
    }
  }
  if (!browser.ok || !format.ok || !failOn.ok || !wait.ok || !timeout.ok) {
    return { kind: 'error', message: 'wrong option' };
  }
  const urls: string[] = [];
  for (const item of rest) {
    const url = normalizeUrl(item);
    if (url === undefined) {
      return { kind: 'error', message: `"${item}" is not an http or https address` };
    }
    urls.push(url);
  }
  return {
    kind: 'scan',
    scan: {
      urls,
      file: text('file'),
      browser: browser.value,
      format: format.value,
      out: text('out'),
      failOn: failOn.value,
      wait: wait.value,
      scroll: values['no-scroll'] !== true,
      timeout: timeout.value * 1000,
      immediate: values.immediate === true,
      armWhen: text('arm-when'),
      optionsFile: text('options'),
      device: text('device'),
      screenshots: text('screenshots'),
    },
  };
}

/** What happened to one address. */
export interface PageResult {
  url: string;
  finalUrl?: string;
  http?: number;
  /** Set when the page could not be loaded: then there is nothing else */
  error?: string;
  /** The layout shift score of the browser itself, where the browser measures one (Chromium) */
  cls?: number;
  /** Whether the guard was watching at the end (it is not while `armWhen` has not matched) */
  armed?: boolean;
  shifts?: Shift[];
  /** The picture with the moved boxes marked, when `--screenshots` asked for it */
  screenshot?: string;
}

/** The options of the file, with the ones of the command line on top. */
export function mergeOptions(
  given: LayoutGuardOptions,
  scan: Pick<ScanArguments, 'immediate' | 'armWhen'>,
): LayoutGuardOptions {
  return {
    ...given,
    ...(scan.immediate ? { start: 'immediate' as const } : {}),
    ...(scan.armWhen === undefined ? {} : { armWhen: scan.armWhen }),
  };
}

async function scroll(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let at = 0; at < Math.min(height, 12_000); at += 500) {
    await page.evaluate((top) => {
      window.scrollTo(0, top);
    }, at);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

/** Adds up the layout shifts of the browser itself, where it has them. */
function measureCls(): void {
  const scope = window as unknown as { __layoutGuardCls?: number | null };
  try {
    if (!PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      scope.__layoutGuardCls = null;
      return;
    }
    scope.__layoutGuardCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as unknown as { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) {
          scope.__layoutGuardCls = (scope.__layoutGuardCls ?? 0) + shift.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    scope.__layoutGuardCls = null;
  }
}

/** A name for a file from an address: `example.com-pricing` */
export function fileNameOf(url: string, index: number): string {
  const parsed = new URL(url);
  const name = `${parsed.hostname}${parsed.pathname}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${String(index + 1).padStart(2, '0')}-${name}.png`;
}

/** Opens one address in a fresh browser context and returns what the guard found. */
export async function scanPage(
  browser: Browser,
  url: string,
  settings: ScanArguments,
  options: LayoutGuardOptions,
  index = 0,
): Promise<PageResult> {
  const device = settings.device === undefined ? undefined : devices[settings.device];
  if (settings.device !== undefined && device === undefined) {
    return { url, error: `unknown device "${settings.device}"` };
  }
  const context = await browser.newContext(device ?? { viewport: { width: 1280, height: 800 } });
  try {
    await context.addInitScript(measureCls);
    const guard = await installLayoutGuard(context, options);
    const page = await context.newPage();
    const result: PageResult = { url };
    try {
      const response = await page.goto(url, { waitUntil: 'load', timeout: settings.timeout });
      if (response !== null) {
        result.http = response.status();
      }
      await page.waitForTimeout(settings.wait * 1000);
      if (settings.scroll) {
        await scroll(page);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { url, error: message.split('\n')[0] ?? message };
    }
    result.finalUrl = page.url();
    const cls = await page
      .evaluate(() => (window as unknown as { __layoutGuardCls?: number | null }).__layoutGuardCls)
      .catch(() => undefined);
    if (typeof cls === 'number') {
      result.cls = Math.round(cls * 10_000) / 10_000;
    }
    result.armed = await guard.armed();
    result.shifts = [...guard.unknownShifts];
    if (settings.screenshots !== undefined && result.shifts.length > 0) {
      const picture = await guard.screenshot();
      if (picture !== undefined) {
        const file = join(settings.screenshots, fileNameOf(url, index));
        await mkdir(settings.screenshots, { recursive: true });
        await writeFile(file, picture);
        result.screenshot = file;
      }
    }
    return result;
  } finally {
    await context.close();
  }
}

const plural = (count: number, one: string, many = `${one}s`): string =>
  `${String(count)} ${count === 1 ? one : many}`;

/** The text report: one block per page, what moved, and the score of the browser. */
export function renderText(results: readonly PageResult[]): string {
  const lines: string[] = [];
  let withShifts = 0;
  let total = 0;
  let failed = 0;
  for (const result of results) {
    const where =
      result.finalUrl !== undefined && result.finalUrl !== result.url
        ? `${result.url} (now ${result.finalUrl})`
        : result.url;
    if (result.shifts === undefined) {
      failed += 1;
      lines.push(where, `  could not be loaded: ${result.error ?? 'unknown error'}`, '');
      continue;
    }
    const facts = [
      result.http === undefined ? '' : `HTTP ${String(result.http)}`,
      result.cls === undefined ? '' : `CLS ${String(result.cls)}`,
    ].filter((part) => part !== '');
    lines.push(`${where}${facts.length === 0 ? '' : ` (${facts.join(', ')})`}`);
    if (result.armed === false) {
      lines.push('  the guard never started to watch: the arm-when element was not shown');
    } else if (result.shifts.length === 0) {
      lines.push('  nothing moved');
    } else {
      withShifts += 1;
      total += result.shifts.length;
      lines.push(`  ${plural(result.shifts.length, 'shift')}:`);
      for (const [at, shift] of result.shifts.entries()) {
        lines.push(`    ${String(at + 1)}. ${describeShift(shift)}`);
      }
      if (result.screenshot !== undefined) {
        lines.push(`  picture: ${result.screenshot}`);
      }
    }
    lines.push('');
  }
  lines.push(
    `${plural(results.length, 'page')}: ${plural(withShifts, 'page')} with shifts (${plural(total, 'shift')})${failed > 0 ? `, ${String(failed)} could not be loaded` : ''}`,
  );
  return `${lines.join('\n')}\n`;
}

const cell = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** A table for the summary of a GitHub Actions run, or any Markdown viewer. */
export function renderMarkdown(results: readonly PageResult[]): string {
  const lines = [
    '## Layout guard',
    '',
    '| Page | Shifts | CLS | Biggest move |',
    '| --- | --- | --- | --- |',
  ];
  for (const result of results) {
    if (result.shifts === undefined) {
      lines.push(`| ${cell(result.url)} | could not be loaded | | ${cell(result.error ?? '')} |`);
      continue;
    }
    const biggest = [...result.shifts].sort(
      (a, b) => Math.abs(b.after.top - b.before.top) - Math.abs(a.after.top - a.before.top),
    )[0];
    lines.push(
      `| ${cell(result.url)} | ${String(result.shifts.length)} | ${result.cls === undefined ? '' : String(result.cls)} | ${biggest === undefined ? '' : cell(describeShift(biggest))} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A page of its own for the whole run. */
export function renderHtml(results: readonly PageResult[]): string {
  const blocks = results.map((result) => {
    if (result.shifts === undefined) {
      return `<section><h2>${escapeHtml(result.url)}</h2><p class="bad">could not be loaded: ${escapeHtml(result.error ?? '')}</p></section>`;
    }
    const list =
      result.shifts.length === 0
        ? '<p class="ok">nothing moved</p>'
        : `<ol>${result.shifts.map((shift) => `<li>${escapeHtml(describeShift(shift))}</li>`).join('')}</ol>`;
    const cls =
      result.cls === undefined ? '' : ` <span class="muted">CLS ${String(result.cls)}</span>`;
    return `<section><h2>${escapeHtml(result.url)}${cls}</h2>${list}</section>`;
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Layout guard</title>
<style>
:root { color-scheme: light dark; }
body { font: 15px/1.5 system-ui, sans-serif; max-width: 56rem; margin: 2rem auto; padding: 0 1rem; }
h2 { font-size: 1.05rem; word-break: break-all; }
.ok { color: #1a7f37; } .bad { color: #cf222e; } .muted { color: #59636e; font-weight: normal; }
li { margin: 0.25rem 0; }
</style>
</head>
<body>
<h1>Layout guard</h1>
${blocks.join('\n')}
</body>
</html>
`;
}

/** A report in the format that was asked for. */
export function renderReport(
  results: readonly PageResult[],
  format: Format,
  browser: BrowserName,
  generatedAt = new Date().toISOString(),
): string {
  if (format === 'json') {
    return `${JSON.stringify({ version: 1, generatedAt, browser, pages: results }, null, 2)}\n`;
  }
  if (format === 'markdown') {
    return renderMarkdown(results);
  }
  if (format === 'html') {
    return renderHtml(results);
  }
  return renderText(results);
}

/** The exit code: 2 when a page could not be loaded or never armed, 1 for a shift, else 0. */
export function exitCodeOf(results: readonly PageResult[], failOn: FailOn): number {
  if (results.some((result) => result.shifts === undefined || result.armed === false)) {
    return 2;
  }
  if (failOn === 'never') {
    return 0;
  }
  return results.some((result) => (result.shifts?.length ?? 0) > 0) ? 1 : 0;
}

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

const ENGINES: Record<BrowserName, BrowserType> = { chromium, firefox, webkit };

async function version(): Promise<string> {
  const text = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const { version: value } = JSON.parse(text) as { version?: string };
  return value ?? 'unknown';
}

async function readOptions(path: string | undefined): Promise<LayoutGuardOptions> {
  if (path === undefined) {
    return {};
  }
  const given = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  // A typo in a name would be ignored by the guard, which is not what a person who wrote it wants
  const known = [...Object.keys(DEFAULTS), 'baseline', 'screenshot'];
  for (const key of Object.keys(given)) {
    if (!known.includes(key)) {
      throw new Error(
        `${path}: "${key}" is not an option of the guard (they are: ${known.join(', ')})`,
      );
    }
  }
  return given;
}

/** The whole command. Returns the exit code. */
export async function main(argv: readonly string[], io: Io = defaultIo): Promise<number> {
  const parsed = parseCli(argv);
  if (parsed.kind === 'help') {
    io.out(HELP);
    return 0;
  }
  if (parsed.kind === 'version') {
    io.out(`${await version()}\n`);
    return 0;
  }
  if (parsed.kind === 'error') {
    io.err(`playwright-layout-guard: ${parsed.message}\nTry --help.\n`);
    return 2;
  }
  const { scan } = parsed;
  let options: LayoutGuardOptions;
  const urls = [...scan.urls];
  try {
    options = mergeOptions(await readOptions(scan.optionsFile), scan);
    if (scan.file !== undefined) {
      for (const line of parseUrlList(await readFile(scan.file, 'utf8'))) {
        const url = normalizeUrl(line);
        if (url === undefined) {
          io.err(
            `playwright-layout-guard: "${line}" in ${scan.file} is not an http or https address\n`,
          );
          return 2;
        }
        urls.push(url);
      }
    }
  } catch (error) {
    io.err(`playwright-layout-guard: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  if (urls.length === 0) {
    io.err('playwright-layout-guard: give at least one address, or --file\nTry --help.\n');
    return 2;
  }
  let browser: Browser;
  try {
    browser = await ENGINES[scan.browser].launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.err(
      `playwright-layout-guard: could not start ${scan.browser}: ${message.split('\n')[0] ?? ''}\n` +
        `Install it once with: npx playwright install ${scan.browser}\n`,
    );
    return 2;
  }
  const results: PageResult[] = [];
  try {
    for (const [index, url] of urls.entries()) {
      io.err(`[${String(index + 1)}/${String(urls.length)}] ${url}\n`);
      try {
        results.push(await scanPage(browser, url, scan, options, index));
      } catch (error) {
        // An option the guard refuses (a wrong name in the file) is a mistake of the caller
        io.err(
          `playwright-layout-guard: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return 2;
      }
    }
  } finally {
    await browser.close();
  }
  const report = renderReport(results, scan.format, scan.browser);
  if (scan.out === undefined) {
    io.out(report);
  } else {
    await mkdir(dirname(scan.out), { recursive: true });
    await writeFile(scan.out, report);
    io.err(`written to ${scan.out}\n`);
  }
  return exitCodeOf(results, scan.failOn);
}
