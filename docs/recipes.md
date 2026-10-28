# Recipes

Short answers to "my test fails, what now?". The first question is always the same: **is the shift a bug or is it meant?** A bug is fixed in the page (reserve the space, see the end of this file). A shift that is meant is allowed in the narrowest way that works, so that the guard keeps watching everything else.

| Situation                                            | Use                                                       |
| ---------------------------------------------------- | --------------------------------------------------------- |
| One action opens something (menu, dialog, panel)     | [`guard.allowShifts()`](#an-action-that-opens-something)  |
| A CSS transition of a size, on purpose               | [`animations: 'allow'`](#a-panel-that-slides-open)        |
| A box whose insides rearrange (board, sortable list) | [`data-layout-fluid`](#a-board-or-a-list-that-rearranges) |
| An ad, a ticker, a carousel you do not control       | [`ignore`](#an-ad-a-ticker-a-carousel)                    |
| A client-side app that renders after the load        | [`guard.forget()`](#an-app-that-renders-after-the-load)   |
| A project that moves today                           | [`baseline`](#a-project-that-moves-today)                 |

## An action that opens something

A menu, a dialog or a panel that is allowed to push the page. The shifts of this one action are not reported, everything before and after it still is:

```ts
import { expect, test } from 'playwright-layout-guard';

test('the menu opens', async ({ page, guard }) => {
  await page.goto('/');
  await guard.allowShifts(async () => {
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('navigation')).toBeVisible();
  });
  // From here on the page must stand still again
  await page.getByRole('link', { name: 'Pricing' }).hover();
});
```

`<details>` that a visitor opens are allowed automatically, and so is a resize of the window and a change of the address with `history.pushState`: a page needs a moment to show the result, and for 600 ms (`quietMs`) the guard looks again from the new state.

## A panel that slides open

If the panel is **animated** (`transition: height 300ms`), allow it for the whole test or file, and the guard lets go of exactly the time the animation runs:

```ts
test.use({ layoutGuard: { animations: 'allow' } });
```

Without the animation (the panel is just there at once) the shift is real: use `allowShifts` around the click, or reserve the space.

## A board or a list that rearranges

Mark the box with an attribute. The box itself is still watched (it must not move or change its size), what is inside is not:

```html
<ul class="tiles" data-layout-fluid>
  <li>...</li>
</ul>
```

Use this when the rearranging **is** the feature (the tiles of a game board, a list that the visitor sorts). If a list only grows, the box moves what is below it, and that is reported: reserve its height instead.

## An ad, a ticker, a carousel

What you do not control and what moves all the time:

```ts
test.use({ layoutGuard: { ignore: ['.ad-slot', '.live-ticker', '[data-carousel]'] } });
```

The selectors are CSS selectors; the element and everything inside it is left alone. Keep the list short and say why in a comment: every entry is a place where the guard is blind.

An embedded widget in an iframe has a page of its own that the guard watches too. Leave it out by its address with `ignoreFrames`:

```ts
test.use({ layoutGuard: { ignoreFrames: ['widget.example'] } });
```

The iframe box in your page is still watched (it can push your content), the page inside it is not.

## An app that renders after the load

A client-side rendered app is an empty page at the load event and fills in afterwards, which looks like a page that moves. Wait until the app has rendered, then tell the guard to start from there:

```ts
test('the dashboard', async ({ page, guard }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await guard.forget();
  // Now everything that moves is a shift
});
```

Or let the guard wait for the app by itself: name something that is shown when it is ready.

```ts
test.use({ layoutGuard: { armWhen: '#app' } });
```

The guard reports nothing until the element is shown, takes the layout then, and reports from there on. If the element never shows (a wrong selector, an app that failed to start), the test fails and says so, because nothing was watched.

Server-rendered pages need none of this. A framework that renders on the server and then **hydrates** is what the guard is best at: the page must look the same before and after.

## Several pages in one test

The guard watches every page of the test's browser context, popups and new tabs included, each with its own starting point. A test that opens a second page with `context.newPage()` is checked on both.

## A project that moves today

Record the existing shifts in a baseline file and fail only on new ones. See [Adopting it in a project that moves today](../README.md#adopting-it-in-a-project-that-moves-today). Delete a line from the file when you fix a shift: the guard then holds that place for good.

## Use it in the CI

The failed test has the picture and the data attached. Keep the Playwright report as an artifact, and the picture is one click away from the red job:

```yaml
- run: npx playwright test
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: playwright-report
    path: playwright-report/
```

## Compose it with your own fixtures

`test` of this package is Playwright's `test`, extended. Merge it with your own with `mergeTests`:

```ts
import { mergeTests } from '@playwright/test';
import { test as guarded } from 'playwright-layout-guard';
import { test as mine } from './my-fixtures';

export const test = mergeTests(guarded, mine);
```

A check in your own test that the guard is really on (so that a changed import or option cannot switch it off unseen) is a test that moves the page on purpose and expects the guard to fail it:

```ts
test.describe('the guard is on', () => {
  test.fail(); // the tests inside must fail, and a pass means that the guard saw nothing

  test('a banner pushes the page down', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const banner = document.createElement('div');
      banner.style.height = '48px';
      document.body.insertBefore(banner, document.body.firstChild);
    });
    await page.waitForTimeout(600);
  });
});
```

## The fix, when it is a bug

A page does not move when the space for what comes later is **there from the start**:

- **Images and video:** `width` and `height` attributes, or `aspect-ratio` in CSS.
- **Something that arrives later** (a banner, an ad, a loaded component): a container with the final `min-height`, or a skeleton with the same boxes as the real thing.
- **Web fonts:** `font-display: swap` with a fallback font that has the same measures (`size-adjust`, `ascent-override`), and a `<link rel="preload">` for the font files.
- **Messages that appear** (a form error, a confirmation): put them where the space is already reserved, such as a line below the field that is always there.
- **Animations:** move things with `transform`, which does not change the layout, instead of `top`, `left`, `margin` or `height`.
