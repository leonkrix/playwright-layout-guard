// A trial of the guard against public pages: does it find real shifts, and how much noise does it make?
//
// Every page is opened once per screen size (a normal page load, no crawling, no clicks), watched
// for a few seconds, scrolled from top to bottom once like a reader would (that wakes up lazy
// content), and scrolled back. Next to the guard it measures CLS with the browser's own API, so the
// two can be compared. Run `pnpm build` first (the script uses the built package).
//
//   node scripts/survey.mjs                 all pages
//   node scripts/survey.mjs --only react    only the pages whose address contains "react"
//
// The result goes to survey-results/ as JSON and as a table on the console. It is not committed.
import { mkdir, writeFile } from 'node:fs/promises';

import { chromium, devices } from '@playwright/test';

import { installLayoutGuard } from '../dist/index.js';

const PAGES = [
  'https://playwright.dev/docs/intro',
  'https://react.dev/learn',
  'https://developer.mozilla.org/en-US/docs/Web/CSS/grid',
  'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs',
  'https://docs.github.com/en/get-started/start-your-journey/about-github-and-git',
  'https://vite.dev/guide/',
  'https://tailwindcss.com/docs/installation',
  'https://astro.build/',
  'https://web.dev/articles/cls',
  'https://en.wikipedia.org/wiki/Web_browser',
  'https://news.ycombinator.com/',
  'https://www.python.org/',
  'https://www.rust-lang.org/',
  'https://kubernetes.io/docs/concepts/overview/',
  'https://vuejs.org/guide/introduction.html',
  'https://svelte.dev/docs/svelte/overview',
  'https://angular.dev/overview',
  'https://docs.python.org/3/tutorial/index.html',
  'https://www.typescriptlang.org/docs/handbook/intro.html',
  'https://nextjs.org/docs',
  'https://go.dev/doc/',
  'https://www.bbc.com/news',
  'https://www.theguardian.com/international',
];

const start = process.argv.includes('--default') ? 'load' : 'immediate';
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : undefined;

const SIZES = [
  { name: 'desktop', options: { viewport: { width: 1280, height: 800 } } },
  { name: 'mobile', options: { ...devices['iPhone 13'] } },
];

/** The layout shift entries of the browser itself, for comparison */
const clsScript = () => {
  const entries = [];
  window.__cls = entries;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      entries.push({
        value: entry.value,
        input: entry.hadRecentInput,
        at: Math.round(entry.startTime),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

async function scroll(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = 500;
  for (let at = 0; at < Math.min(height, 12000); at += step) {
    await page.evaluate((top) => window.scrollTo(0, top), at);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
}

const browser = await chromium.launch();
const results = [];

for (const url of PAGES) {
  if (only !== undefined && !url.includes(only)) {
    continue;
  }
  for (const size of SIZES) {
    const context = await browser.newContext(size.options);
    const page = await context.newPage();
    await page.addInitScript(clsScript);
    // start: immediate (the default of this script) also reports what moves while the page loads,
    // --default uses the default of the package: only after the load event
    const guard = await installLayoutGuard(page, { start });
    const entry = { url, size: size.name, status: 'ok' };
    try {
      const response = await page.goto(url, {
        waitUntil: 'load',
        timeout: 45000,
      });
      entry.http = response?.status();
      await page.waitForTimeout(4000);
      await scroll(page);
    } catch (error) {
      entry.status = `error: ${String(error.message).split('\n')[0]}`;
    }
    const cls = await page.evaluate(() => window.__cls ?? []).catch(() => []);
    entry.guardShifts = guard.shifts.length;
    entry.guardElements = [...new Set(guard.shifts.map((shift) => shift.element))].length;
    entry.guardMaxPx = Math.max(
      0,
      ...guard.shifts.map((shift) =>
        Math.max(
          Math.abs(shift.after.top - shift.before.top),
          Math.abs(shift.after.left - shift.before.left),
        ),
      ),
    );
    entry.clsEntries = cls.length;
    entry.cls = Number(
      cls
        .filter((item) => !item.input)
        .reduce((sum, item) => sum + item.value, 0)
        .toFixed(4),
    );
    entry.shifts = guard.shifts.slice(0, 15);
    results.push(entry);
    console.log(
      `${size.name.padEnd(8)} ${url.slice(0, 70).padEnd(70)} guard ${String(entry.guardShifts).padStart(3)} (${String(entry.guardElements)} elements, max ${String(entry.guardMaxPx)} px)  CLS ${String(entry.cls)}  ${entry.status === 'ok' ? '' : entry.status}`,
    );
    await context.close();
  }
}

await browser.close();
await mkdir('survey-results', { recursive: true });
const file = `survey-results/survey-${start}${only === undefined ? '' : `-${only.replace(/\W/g, '')}`}.json`;
await writeFile(file, JSON.stringify(results, null, 2));
console.log(`\nwritten to ${file}`);
