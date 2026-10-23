# playwright-layout-guard

[![CI](https://github.com/leonkrix/playwright-layout-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/leonkrix/playwright-layout-guard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/playwright-layout-guard)](https://www.npmjs.com/package/playwright-layout-guard)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/leonkrix/playwright-layout-guard/badge)](https://scorecard.dev/viewer/?uri=github.com/leonkrix/playwright-layout-guard)

**A Playwright fixture that fails a test when something on the page moves.** Any element that changes its place or size after the page has loaded — a banner that pushes the content down, an image without a size, a button that jumps when it is pressed — fails the test, and the message names the element and says how far it moved. It works in Chromium, Firefox and WebKit.

```text
Error: Something on the page moved or changed its size (1 shift):
  1. <main> "Content This card is pushed down when…" moved 60 px down, with 2 elements inside it
     (top 37 to 97, left 16 to 16) after 196 ms

If this is meant to happen: mark the box with data-layout-fluid, leave it out with the "ignore"
option, or wrap the action in guard.allowShifts().
```

## Why

A page that jumps is annoying, and a user clicks the wrong thing when it does. The usual tools do not stop it from coming back:

|                                   | Lighthouse / Web Vitals CLS                          | Screenshot tests                     | **layout-guard**                 |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------ | -------------------------------- |
| Fails a test when something jumps | only with a budget, and over a whole page load       | only if the jump changes the picture | yes, on any movement             |
| Says which element moved          | Lighthouse lists elements, field data does not       | a picture diff                       | yes, with before and after       |
| Sees what happens after a click   | no: shifts within 500 ms of an input are not counted | only the moments you take a shot of  | yes, the whole test              |
| Browsers                          | Chromium only                                        | all                                  | Chromium, Firefox, WebKit        |
| Maintenance                       | a budget to tune                                     | baselines to review                  | none, there is nothing to update |

It does **not** replace CLS: CLS measures how bad a shift is for a visitor (size of the area times distance) and is what Google ranks. This is a regression guard: _nothing_ may move. The two go well together.

## Install

```bash
pnpm add -D playwright-layout-guard    # or npm install -D, yarn add -D
```

Needs `@playwright/test` 1.45 or newer (a peer dependency) and Node 20.19 or newer (the package is ESM only, and Playwright projects that are not ESM themselves load it with `require`, which Node supports from 20.19).

## Use

Import `test` and `expect` from this package instead of `@playwright/test`. That is all: every test now fails when the page moves.

```ts
import { expect, test } from 'playwright-layout-guard';

test('home page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Subscribe' }).click();
  await expect(page.getByText('Thank you')).toBeVisible();
});
```

Already have your own fixtures? Merge them:

```ts
import { mergeTests } from '@playwright/test';
import { test as guarded } from 'playwright-layout-guard';
import { test as mine } from './my-fixtures';

export const test = mergeTests(guarded, mine);
```

### When something is meant to move

Three ways, from the narrowest to the widest:

```ts
// 1. An action that opens a panel: nothing is reported while it runs
test('menu', async ({ page, guard }) => {
  await guard.allowShifts(() => page.getByRole('button', { name: 'Menu' }).click());
});
```

```html
<!-- 2. A box whose insides rearrange on purpose (a board, a sortable list).
        The box itself is still watched, the parts inside are not. -->
<ul data-layout-fluid>
  ...
</ul>
```

```ts
// 3. Leave something out for good, or for a whole file
test.use({ layoutGuard: { ignore: ['.ad-slot', '.live-ticker'] } });
test.use({ layoutGuard: false }); // off for this file, say why in a comment
```

### Options

All optional. Set them with `test.use({ layoutGuard: { ... } })`, or pass them to `installLayoutGuard(page, options)`.

| Option                    | Default               | What it does                                                                                                              |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ignore`                  | `[]`                  | CSS selectors of elements (and everything inside) to leave alone.                                                         |
| `fluidAttribute`          | `'data-layout-fluid'` | Attribute that marks a box whose inside may rearrange.                                                                    |
| `tolerance`               | `1`                   | Pixels an element may be off before it counts as moved.                                                                   |
| `quietMs`                 | `600`                 | How long to wait after a resize, an opened `<details>` or a `pushState` before looking again.                             |
| `scope`                   | `'body'`              | CSS selector of the part of the page to watch.                                                                            |
| `start`                   | `'load'`              | `'load'` reports from the load event on. `'immediate'` also reports what moves while the page loads (noisier, see below). |
| `ignoreInsideInteractive` | `true`                | Leave out what is inside a link or a button.                                                                              |
| `pageHeight`              | `'growth'`            | `'growth'`: the page became higher than the window. `'any'`: also a page that became lower.                               |
| `maxReports`              | `50`                  | The most shifts reported in one test.                                                                                     |

### Without the fixture

```ts
import { installLayoutGuard } from 'playwright-layout-guard';

const guard = await installLayoutGuard(page); // before page.goto()
await page.goto('/');
// guard.shifts       what was found, as data
// guard.assertStable() throws an error that names every shift
// guard.forget()     start over from the current layout (after a client-side app rendered)
// guard.pause() / guard.resume()
```

Every failed test also gets the shifts attached as `layout-shifts.json`.

## What it does and does not catch

- **Catches** anything that changes its place or size in the layout: content pushed by a late banner, an image or an ad without reserved space, a font swap that re-wraps text, a button that moves its neighbours, a page that grows at the bottom.
- **Does not count** `transform` and `opacity` animations (they do not change the layout), scrolling, sticky and fixed parts, and everything that is not visible. [How it works](docs/how-it-works.md) has the full list and the reasons.
- **A page that renders after the load event** (a client-side app) looks like a page that is changing. Wait for the app, then call `await guard.forget()`.
- **Loading is not judged by default.** Pages change a lot while they arrive, and the guard reports from the load event on. That is the job of CLS and Lighthouse. `start: 'immediate'` watches from the first frame, but then it also reports a page that is still being delivered in pieces.
- **Web components and frames:** open shadow trees are looked into, and so are iframes (each frame is watched on its own). Closed shadow trees cannot be seen from outside.
- **It reads the layout, not the picture.** Something can change its look (colour, text) without moving: that is not a layout shift.

## How well does it work on real pages?

The package was tried on 23 public pages (documentation sites, news sites, framework home pages) in desktop and phone size, next to the browser's own layout shift measurement. [The survey](docs/survey.md) has the numbers, what the first versions got wrong and what it found. The script is in `scripts/survey.mjs`.

## Ideas

Not promises, and in no particular order. If one of them would help you, [open an issue](https://github.com/leonkrix/playwright-layout-guard/issues) and say what you test.

- **Recognise motion that is meant:** an element whose layout is animated on purpose by a CSS transition or animation (an accordion that slides open) is reported today; an opt-in could leave it out while the animation runs.
- **Leave out a single frame** (`ignoreFrames`), for embedded widgets you do not control.
- **Arm on a condition** (`armWhen: 'main'`) instead of calling `guard.forget()`, for client-side rendered apps.
- **A visual report:** a screenshot with the moved boxes marked, attached to the Playwright report.
- **A baseline file** for existing projects: record today's known shifts, fail only on new ones.
- **A viewport-only mode**, to count only what a visitor could see, like CLS does.
- **A command line tool** to point the guard at a URL (`npx`), which is what the survey script does by hand.
- **Other test runners** (Puppeteer, Cypress, WebdriverIO): the part that runs in the page does not depend on Playwright.

## Status and versioning

**Status: early, `0.x`.** The behaviour is covered by browser tests in Chromium, Firefox and WebKit, and the defaults were tuned against real pages, but the rules about _what counts_ as a shift may still change when real projects find false positives. Please [report them](CONTRIBUTING.md#reporting-a-false-positive).

- [Semantic versioning](https://semver.org). In `0.x`, a minor version may break things; it is written in the [changelog](CHANGELOG.md). From `1.0.0` on, the options and the rules are stable within a major version.
- Supported: the latest release. Node 20.19+, 22 and 24; `@playwright/test` from 1.45 (the CI tests the oldest and the newest); Chromium, Firefox, WebKit.

## Packages and releases

| Package                                                                            | Where                                        | What                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------- |
| [`playwright-layout-guard`](https://www.npmjs.com/package/playwright-layout-guard) | npm, built and published from GitHub Actions | the fixture and its API |

- Releases are git tags (`v0.2.0`). The workflow checks everything again in three browsers, publishes to npm **with provenance** (every version can be traced to its commit and build, and no publish token exists) and writes the GitHub release from the changelog. Process: [docs/releasing.md](docs/releasing.md).
- Every pull request carries a [changeset](https://github.com/changesets/changesets), which becomes the changelog entry.
- The repository is checked by CodeQL, OpenSSF Scorecard and a weekly dependency audit; Dependabot keeps dependencies and actions current, and every action is pinned to a commit.

## Development

```bash
pnpm install
pnpm exec playwright install chromium
pnpm check      # lint, format, types, unit tests, build, package lint, browser tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Security problems: [SECURITY.md](SECURITY.md).

## Origin

The guard was built for [leonkrix.dev](https://leonkrix.dev), a site that promises that nothing on any page ever moves, and where every browser test runs with it. [A note on how that works](https://leonkrix.dev/notes/a-page-that-never-moves/) goes into the detail.

## License

[MIT](LICENSE) © Leon Krix
