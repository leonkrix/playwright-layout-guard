# How it works

A small script is added to every page of the test (a Playwright init script, so it runs before the page's own scripts). On every animation frame it looks at the elements of the page and remembers where each one stood the first time it saw it. When an element is somewhere else later, the script reports it to the test: which element (a short selector path), the first words of its text, where it was and where it is, and when.

When the test ends, the fixture fails it if there is any report.

## What is measured

For each element: its place on the page and its size, taken from the layout (`offsetTop`, `offsetLeft`, `offsetWidth`, `offsetHeight`, summed up the `offsetParent` chain). That has three consequences:

- `transform` does not count. An element that is animated with `transform` or `opacity` does not change the layout, so it is not a layout shift. (Moving things with `top`, `left` or `margin` is a layout change and is reported.)
- Scrolling does not count, because the places are relative to the page and not to the window.
- It works the same in every browser, because it uses nothing that only one engine has.

## What counts as a move

An element **moved** when

- its top changed by more than the tolerance (default 1 px), or
- both its left edge and its right edge changed by more than the tolerance.

An element that only grows or shrinks (a text that changes, a line that wraps) is not reported by itself. What it pushes away is moved, and that is reported.

The **page height** is watched too: a page that gets higher after the load means that something was added in the flow, even when nothing above it moved (a footer that arrives late). Only growth counts, and only when the page is higher than the window afterwards (a short page has nothing below the fold that could be pushed).

## Reported once, at the cause

When a box moves, everything inside it moves as well, by the same amount. Those are consequences, not separate problems, so only the outermost box is reported, with the number of elements that went with it (`with 14 elements inside it`). An element inside a box that moved by a _different_ amount is reported on its own.

## What is left out, on purpose

| Left out                                                          | Why                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Elements that are not visible (`display: none`, `visibility`)     | Nobody sees them. They count as new when they are shown.                                                                    |
| `position: sticky` and `fixed`, and everything inside             | Their offset changes when the page scrolls.                                                                                 |
| Parts that move exactly as far as the page was scrolled           | Stuck to the window by a script, same reason.                                                                               |
| `display: inline` elements                                        | Words inside a line change their size whenever the text does. The block that holds them is watched instead.                 |
| What is inside a link or a button                                 | They lift a little when pointed at (`ignoreInsideInteractive`).                                                             |
| What is inside a box marked `data-layout-fluid`                   | For boards, lists and carousels that rearrange on purpose. The box itself is still watched.                                 |
| Elements matched by the `ignore` option                           | Ads, tickers, anything you know about.                                                                                      |
| The time right after a resize, an opened `<details>`, `pushState` | The visitor asked for it, so the page needs a moment to show the result (`quietMs`, default 600 ms). Also after `popstate`. |

## When it starts

The guard looks from the first frame, so that it knows where everything was, but it only **reports** from the moment the page has loaded (50 ms after the load event, so that what the load handlers of the page change is part of the starting point; a timer and not a frame, so that a slow machine cannot swallow a shift). Pages change a lot while they load, and judging that is a different job (see the comparison in the README). With `start: 'immediate'` it reports from the first frame; that also finds content that jumps while the page loads, and also reports a page that is still arriving in pieces.

A page that renders **after** the load event (a client-side rendered app) looks like a page that is changing. Wait until your app has rendered and tell the guard to start over:

```ts
await page.goto('/');
await expect(page.getByRole('main')).toBeVisible();
await guard.forget();
```

## Timing details that matter

- **Frames and timers:** the guard looks on every animation frame. When no frame has come for 60 ms (a page in the background, the first page of an iframe in Firefox, which is not drawn yet), a timer looks instead, so that a shift cannot hide between frames.
- **A new document in the same window:** Firefox gives the first page of an iframe the window of its empty starting page. The animation frames and listeners of the old document are gone then, so the guard notices the new document and starts its loop and listeners again.
- **A new window size:** the guard also notices a changed window size by itself, because Firefox delivers the resize event after the page has been laid out for the new size. It then keeps what it finds for 250 ms: if the resize event comes, that was the cause and it is dropped; if it does not (the page itself got wider than the window, as it does on a phone), it is reported.
- **Resizes while the page settles:** a resize in the first 300 ms after the load (Firefox sizes an iframe a moment after it loaded) makes the guard start over, but not go quiet. A resize later is a visitor's resize: quiet for `quietMs`.

## Web components and frames

Elements inside open shadow trees are watched like all others; the host counts as their parent, and `ignore` and `data-layout-fluid` work across the border. Closed shadow trees are not reachable from a script and are not seen. The init script runs in every frame, so an iframe is watched on its own (a report from inside a frame starts with `[frame /path]`).

## Cost

One pass over all elements on every frame, with a layout read per element. The style of an element (sticky, inline) is looked up again every half second, because scripts can change it. On a page with a few thousand elements this is well below a frame budget, but it is test tooling: do not run it on a production page.

## The in-page script

`src/page-script.ts` is serialised with `toString()` and sent to the browser, so it can use nothing from outside the function: no imports, no helpers, no closure variables. It is compiled with plain `tsc` (a bundler that wraps functions in helpers would break it). The report goes back through a function that is exposed to the page (`exposeFunction`), one per installed guard, so two guards in one context do not mix.
