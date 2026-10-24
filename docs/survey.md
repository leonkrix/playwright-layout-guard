# Trial on public pages

Before the first release the guard was tried on 23 public pages: documentation sites (Playwright, React, MDN, Node.js, GitHub Docs, Vite, Tailwind, Astro, web.dev, Python, Rust, Kubernetes, Vue, Svelte, Angular, TypeScript, Next.js, Go), a wiki article, Hacker News and two news sites. Each page was opened in Chromium once at desktop size (1280 x 800) and once as a phone (iPhone 13), left alone for four seconds, scrolled from top to bottom and back once, like a reader would. No clicks, no sign-in, no crawling. Next to the guard the script measured **CLS with the browser's own Layout Instability API**, so the two can be compared.

`pnpm build && pnpm survey` repeats it (about ten minutes, needs the network). The pages change, so the numbers will not be the same twice; the table is a snapshot from October 2026, taken with version 0.2.0 (version 0.3.0 also finds parts that drift slowly, which none of these pages did in the snapshot).

## Result

|                                                    | default (reports after the load event) | `start: 'immediate'` (reports from the first frame) |
| -------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| Loads with at least one report                     | 8 of 46                                | 30 of 46                                            |
| Loads that hit the limit of 50 reports             | 3                                      | 16                                                  |
| Of the 9 loads with CLS above 0.1 (poor), reported | 2                                      | 8                                                   |

What this says:

- **The two tools look at different things.** Most of the poor CLS on these pages happens before the load event (a stylesheet or a script that arrives late). The default mode does not judge that on purpose, so it reports 2 of 9 of them. It is for what happens afterwards, and for what happens after a click, where CLS does not count shifts within 500 ms of the input at all.
- **`immediate` finds most of what CLS finds** (8 of 9), but 30 of 46 loads report something and 16 hit the limit: a page that is still being delivered in pieces does move, and the guard says so. Use it for your own pages when the load itself is the thing to check, not as a default.
- **The default mode is quiet on most real pages** (38 of 46 loads without a report). What it reports was checked by hand:
  - **Real layout changes after the load:** web.dev (a footer pushed 78 px down), nodejs.org (the navigation settles 4 px at a time), bbc.com (a few pixels when a script finishes) and the Vue guide (the whole app moves 72 px up when a bar above it goes away). Some pages show up in one run and not in the next (MDN on a phone: a sidebar appears at 1 s and pushes the whole article 392 px down, with a CLS of 0 because the article was below the window), because what a page does after the load depends on timing.
  - **Small frames:** react.dev embeds frames that are 15 px high and grow to 20 px. They are reported with the name of the frame (`[frame /path]`). There is no option yet to leave out a single frame (listed as an idea in the README).

## Pages with a report or a poor CLS

CLS is the larger of the two runs. The columns are the number of reports (the limit is 50).

| Page                                           | Size    | CLS  | Guard, default | Guard, immediate |
| ---------------------------------------------- | ------- | ---- | -------------- | ---------------- |
| react.dev/learn                                | desktop | 0.00 | 5              | 5                |
| react.dev/learn                                | mobile  | 0.00 | 4              | 9                |
| nodejs.org/en/learn/getting-started/introducti | desktop | 0.02 | 50+            | 50+              |
| nodejs.org/en/learn/getting-started/introducti | mobile  | 0.04 | 50+            | 50+              |
| docs.github.com/en/get-started/start-your-jour | desktop | 0.24 | 0              | 50+              |
| vite.dev/guide                                 | desktop | 0.15 | 0              | 50+              |
| web.dev/articles/cls                           | desktop | 0.27 | 7              | 50+              |
| web.dev/articles/cls                           | mobile  | 0.03 | 50+            | 50+              |
| python.org                                     | desktop | 0.11 | 0              | 50+              |
| kubernetes.io/docs/concepts/overview           | desktop | 0.26 | 0              | 50+              |
| vuejs.org/guide/introduction.html              | desktop | 0.31 | 1              | 2                |
| vuejs.org/guide/introduction.html              | mobile  | 0.11 | 0              | 0                |
| docs.python.org/3/tutorial/index.html          | desktop | 0.30 | 0              | 9                |
| typescriptlang.org/docs/handbook/intro.html    | desktop | 0.17 | 0              | 3                |
| typescriptlang.org/docs/handbook/intro.html    | mobile  | 0.47 | 0              | 3                |
| bbc.com/news                                   | desktop | 0.00 | 15             | 50+              |

## What the first versions got wrong

The first versions went through this list; each point is now a rule, with a test page where it can be shown:

1. **One cause, dozens of reports.** A banner that pushes the page down moved every element below it, and each was reported (50 reports for one problem). Now only the outermost box that moved is reported, with the number of elements that went with it.
2. **Blind for 600 ms after `history.replaceState`.** Many pages call it while they load (to tidy the address), and the guard treated it like a new view and started over. Only `pushState` and `popstate` do that now. This one hid a CLS of 0.3 on docs.python.org.
3. **Sticky headers and smooth scrolling.** Parts that follow the scroll (a sticky header, a table of contents, anything a script sticks to the window) look like movement in the layout. A part that moves exactly as far as the page was scrolled is no longer reported, and the style of an element (sticky, inline) is looked up again every half second, because a script can change it later (the table of contents of Wikipedia was reported until then).
4. **Page height while the page arrives, and page height that shrinks.** A page that is still arriving gets higher all the time, and a page can shrink to the height of the window when a dialog locks the scroll. Only growth after the load event counts.
