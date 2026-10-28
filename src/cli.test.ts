import { describe, expect, it } from 'vitest';

import {
  exitCodeOf,
  fileNameOf,
  mergeOptions,
  normalizeUrl,
  type PageResult,
  parseCli,
  parseUrlList,
  renderReport,
  renderText,
} from './cli.js';
import type { Shift } from './types.js';

const shift = (element: string, extra: Partial<Shift> = {}): Shift => ({
  kind: 'moved',
  element,
  text: 'Hello',
  before: { top: 100, left: 0, width: 600, height: 40 },
  after: { top: 160, left: 0, width: 600, height: 40 },
  affected: 2,
  at: 1200,
  url: '/',
  ...extra,
});

const calm: PageResult = { url: 'https://a.example/', http: 200, cls: 0, armed: true, shifts: [] };
const moving: PageResult = {
  url: 'https://b.example/',
  finalUrl: 'https://b.example/home',
  http: 200,
  cls: 0.1281,
  armed: true,
  shifts: [shift('main'), shift('footer', { affected: 0 })],
  screenshot: 'pictures/02-b-example.png',
};
const broken: PageResult = {
  url: 'https://c.example/',
  error: 'page.goto: Timeout 45000ms exceeded.',
};
const waiting: PageResult = { url: 'https://d.example/', http: 200, armed: false, shifts: [] };

describe('parseCli', () => {
  it('reads addresses and options', () => {
    const parsed = parseCli([
      'scan',
      'example.com',
      'http://localhost:3000/a',
      '--browser',
      'webkit',
      '--format=json',
      '--fail-on',
      'never',
      '--wait',
      '1.5',
      '--timeout',
      '10',
      '--no-scroll',
      '--immediate',
      '--arm-when',
      '#app',
      '--out',
      'report/layout.json',
      '--options',
      'guard.json',
      '--device',
      'iPhone 13',
      '--file',
      'urls.txt',
      '--screenshots',
      'pictures',
    ]);
    expect(parsed).toEqual({
      kind: 'scan',
      scan: {
        urls: ['https://example.com/', 'http://localhost:3000/a'],
        file: 'urls.txt',
        browser: 'webkit',
        format: 'json',
        out: 'report/layout.json',
        failOn: 'never',
        wait: 1.5,
        scroll: false,
        timeout: 10_000,
        immediate: true,
        armWhen: '#app',
        optionsFile: 'guard.json',
        device: 'iPhone 13',
        screenshots: 'pictures',
      },
    });
  });

  it('has defaults', () => {
    expect(parseCli(['scan', 'https://example.com'])).toMatchObject({
      kind: 'scan',
      scan: { browser: 'chromium', format: 'text', failOn: 'shift', wait: 4, scroll: true },
    });
  });

  it('answers help, version and no command', () => {
    expect(parseCli(['--help'])).toEqual({ kind: 'help' });
    expect(parseCli(['-h'])).toEqual({ kind: 'help' });
    expect(parseCli([])).toEqual({ kind: 'help' });
    expect(parseCli(['--version'])).toEqual({ kind: 'version' });
  });

  it('says what is wrong', () => {
    const message = (args: string[]): string => {
      const parsed = parseCli(args);
      return parsed.kind === 'error' ? parsed.message : parsed.kind;
    };
    expect(message(['crawl', 'example.com'])).toContain('unknown command "crawl"');
    expect(message(['scan', 'example.com', '--browser', 'edge'])).toContain(
      '--browser is one of chromium, firefox, webkit',
    );
    expect(message(['scan', 'example.com', '--format', 'xml'])).toContain('--format');
    expect(message(['scan', 'example.com', '--fail-on', 'error'])).toContain('--fail-on');
    expect(message(['scan', 'example.com', '--wait', 'soon'])).toContain('--wait needs a number');
    expect(message(['scan', 'ftp://example.com'])).toContain('not an http or https address');
    expect(message(['scan', 'example.com', '--nope'])).toContain('--nope');
  });
});

describe('addresses', () => {
  it('adds https when there is no scheme', () => {
    expect(normalizeUrl('example.com/a')).toBe('https://example.com/a');
    expect(normalizeUrl('file:///etc/passwd')).toBeUndefined();
  });

  it('reads a list: one per line, comments and empty lines left out', () => {
    expect(parseUrlList('# pages\nexample.com\n\nexample.org/a # second\r\n#last\n')).toEqual([
      'example.com',
      'example.org/a',
    ]);
  });

  it('makes a file name from an address', () => {
    expect(fileNameOf('https://www.example.com/docs/intro?a=1', 1)).toBe(
      '02-www-example-com-docs-intro.png',
    );
  });
});

describe('options', () => {
  it('puts the flags of the command line over the file', () => {
    expect(
      mergeOptions({ ignore: ['.ad'], start: 'load' }, { immediate: true, armWhen: '#app' }),
    ).toEqual({ ignore: ['.ad'], start: 'immediate', armWhen: '#app' });
    expect(mergeOptions({ start: 'immediate' }, { immediate: false, armWhen: undefined })).toEqual({
      start: 'immediate',
    });
  });
});

describe('exit code', () => {
  it('is 0 for calm pages and 1 for a shift', () => {
    expect(exitCodeOf([calm], 'shift')).toBe(0);
    expect(exitCodeOf([calm, moving], 'shift')).toBe(1);
    expect(exitCodeOf([moving], 'never')).toBe(0);
  });

  it('is 2 when a page could not be loaded or the guard never started to watch', () => {
    expect(exitCodeOf([broken], 'never')).toBe(2);
    expect(exitCodeOf([moving, broken], 'shift')).toBe(2);
    expect(exitCodeOf([waiting], 'shift')).toBe(2);
  });
});

describe('the reports', () => {
  it('writes text with a block per page and the score of the browser', () => {
    const text = renderText([calm, moving, broken, waiting]);
    expect(text).toContain('https://a.example/ (HTTP 200, CLS 0)\n  nothing moved');
    expect(text).toContain(
      'https://b.example/ (now https://b.example/home) (HTTP 200, CLS 0.1281)',
    );
    expect(text).toContain('2 shifts:');
    expect(text).toContain('1. <main> "Hello" moved 60 px down, with 2 elements inside it');
    expect(text).toContain('picture: pictures/02-b-example.png');
    expect(text).toContain('could not be loaded: page.goto: Timeout');
    expect(text).toContain('never started to watch');
    expect(text).toContain('4 pages: 1 page with shifts (2 shifts), 1 could not be loaded');
  });

  it('writes JSON that can be read back', () => {
    const json = JSON.parse(renderReport([calm, moving, broken], 'json', 'webkit', 'then')) as {
      version: number;
      browser: string;
      pages: PageResult[];
    };
    expect(json).toMatchObject({ version: 1, browser: 'webkit' });
    expect(json.pages[1]?.shifts).toHaveLength(2);
    expect(json.pages[2]?.error).toContain('Timeout');
  });

  it('writes a Markdown table with the biggest move of each page', () => {
    const markdown = renderReport([calm, moving, broken], 'markdown', 'chromium');
    expect(markdown).toContain('## Layout guard');
    expect(markdown).toContain('| https://b.example/ | 2 | 0.1281 | <main>');
    expect(markdown).toContain('| https://c.example/ | could not be loaded');
  });

  it('writes an HTML page that escapes what it shows', () => {
    const html = renderReport(
      [{ ...moving, shifts: [shift('div.<script>')] }, broken],
      'html',
      'chromium',
    );
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('div.<script>');
  });
});
