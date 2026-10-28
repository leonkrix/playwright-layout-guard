import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { main } from '../src/cli.js';

/** Runs the command like a terminal would, and returns what it printed */
async function run(
  args: string[],
  browserName: string,
): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await main([...args, '--browser', browserName, '--wait', '1', '--no-scroll'], {
    out: (text) => (out += text),
    err: (text) => (err += text),
  });
  return { code, out, err };
}

/** Writes a file in a folder of its own and hands it to the test */
async function inFolder(body: (folder: string) => Promise<void>): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'layout-guard-cli-'));
  try {
    await body(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test.describe('the command line', () => {
  test('a page that stays put exits with 0', async ({ baseURL, browserName }) => {
    const { code, out } = await run(['scan', `${baseURL ?? ''}/stable.html`], browserName);
    expect(code).toBe(0);
    expect(out).toContain('nothing moved');
    expect(out).toContain('1 page: 0 pages with shifts (0 shifts)');
  });

  test('a page that moves after the load exits with 1 and says what moved', async ({
    baseURL,
    browserName,
  }) => {
    const { code, out } = await run(
      ['scan', `${baseURL ?? ''}/banner-after-load.html`],
      browserName,
    );
    expect(code).toBe(1);
    expect(out).toContain('1 shift:');
    expect(out).toContain('<main>');
    expect(out).toContain('moved 60 px down');
  });

  test('--fail-on never lets it pass', async ({ baseURL, browserName }) => {
    const { code, out } = await run(
      ['scan', `${baseURL ?? ''}/banner-after-load.html`, '--fail-on', 'never'],
      browserName,
    );
    expect(code).toBe(0);
    expect(out).toContain('1 shift');
  });

  test('--immediate also sees what moves while the page loads', async ({
    baseURL,
    browserName,
  }) => {
    const address = `${baseURL ?? ''}/banner-while-loading.html`;
    expect((await run(['scan', address], browserName)).code).toBe(0);
    expect((await run(['scan', address, '--immediate'], browserName)).code).toBe(1);
  });

  test('--arm-when waits for an app, and exits with 2 when the element never comes', async ({
    baseURL,
    browserName,
  }) => {
    const address = `${baseURL ?? ''}/app-after-load.html`;
    expect((await run(['scan', address], browserName)).code).toBe(1);
    expect((await run(['scan', address, '--arm-when', '#app'], browserName)).code).toBe(0);
    const never = await run(['scan', address, '--arm-when', '#never-drawn'], browserName);
    expect(never.code).toBe(2);
    expect(never.out).toContain('never started to watch');
  });

  test('an options file leaves out what is meant', async ({ baseURL, browserName }) => {
    await inFolder(async (folder) => {
      const file = join(folder, 'guard.json');
      await writeFile(file, JSON.stringify({ ignore: ['main'] }));
      const { code, out } = await run(
        ['scan', `${baseURL ?? ''}/banner-after-load.html`, '--options', file],
        browserName,
      );
      expect(code).toBe(0);
      expect(out).toContain('nothing moved');
    });
  });

  test('a frame can be left out in the options file', async ({ baseURL, browserName }) => {
    await inFolder(async (folder) => {
      const file = join(folder, 'guard.json');
      const address = `${baseURL ?? ''}/iframe.html`;
      expect((await run(['scan', address], browserName)).code).toBe(1);
      await writeFile(file, JSON.stringify({ ignoreFrames: ['banner-after-load'] }));
      expect((await run(['scan', address, '--options', file], browserName)).code).toBe(0);
    });
  });

  test('a wrong name in the options file is refused with the name', async ({
    baseURL,
    browserName,
  }) => {
    await inFolder(async (folder) => {
      const file = join(folder, 'guard.json');
      await writeFile(file, JSON.stringify({ ignoer: ['main'] }));
      const { code, err } = await run(
        ['scan', `${baseURL ?? ''}/stable.html`, '--options', file],
        browserName,
      );
      expect(code).toBe(2);
      expect(err).toContain('"ignoer"');
    });
  });

  test('the addresses can come from a file, the report goes to a file, the pictures to a folder', async ({
    baseURL,
    browserName,
  }) => {
    await inFolder(async (folder) => {
      const list = join(folder, 'urls.txt');
      const result = join(folder, 'nested', 'report.json');
      const pictures = join(folder, 'pictures');
      await writeFile(
        list,
        `# pages\n${baseURL ?? ''}/stable.html\n${baseURL ?? ''}/banner-after-load.html # moves\n`,
      );
      const { code, out, err } = await run(
        ['scan', '--file', list, '--format', 'json', '--out', result, '--screenshots', pictures],
        browserName,
      );
      expect(code).toBe(1);
      expect(out).toBe('');
      expect(err).toContain('[2/2]');
      const report = JSON.parse(await readFile(result, 'utf8')) as {
        pages: { shifts: unknown[]; screenshot?: string }[];
      };
      expect(report.pages.map((page) => page.shifts.length > 0)).toEqual([false, true]);
      const picture = report.pages[1]?.screenshot;
      expect(picture).toContain('02-');
      await access(picture ?? '');
    });
  });

  test('a page that cannot be loaded exits with 2', async ({ browserName }) => {
    const { code, out } = await run(['scan', 'http://127.0.0.1:1/', '--timeout', '5'], browserName);
    expect(code).toBe(2);
    expect(out).toContain('could not be loaded');
  });

  test('a mistake in the command is told at once, without starting a browser', async () => {
    let err = '';
    const code = await main(['scan', 'example.com', '--format', 'xml'], {
      out: () => undefined,
      err: (text) => (err += text),
    });
    expect(code).toBe(2);
    expect(err).toContain('--format');
  });
});
