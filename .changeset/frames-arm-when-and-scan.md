---
'playwright-layout-guard': minor
---

Three additions that came out of the trial on public pages:

- **`ignoreFrames`** leaves single iframes alone, by a text that their address contains (`*` for any characters), for widgets you do not control. The box of the iframe in your page is still watched.
- **`armWhen`** is a CSS selector of something that is shown when an app that draws itself after the load event is ready: the guard reports nothing until it matches, takes the layout then, and reports from there on. `guard.armed()` says whether the guard is watching, and a test whose selector never matched fails instead of passing without having watched anything.
- **A command line**: `npx playwright-layout-guard scan <address...>` opens pages in a browser and reports every box that moved after the load, next to the layout shift score of the browser (Chromium). Addresses can come from a file (`--file`), the report can be text, JSON, Markdown or HTML (`--format`, `--out`), the options come from a JSON file (`--options`), `--immediate` and `--arm-when` set `start` and `armWhen`, `--screenshots` saves the picture with the moved boxes marked, and the exit code is 0, 1 (something moved) or 2 (wrong command, a page that could not be loaded, an `--arm-when` element that never showed). The script of the trial is the first version of it.
