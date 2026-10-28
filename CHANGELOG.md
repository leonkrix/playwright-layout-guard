# playwright-layout-guard

## 0.4.0

### Minor Changes

- 035afd5: Three additions that came out of the trial on public pages:
  
  - **`ignoreFrames`** leaves single iframes alone, by a text that their address contains (`*` for any characters), for widgets you do not control. The box of the iframe in your page is still watched.
  - **`armWhen`** is a CSS selector of something that is shown when an app that draws itself after the load event is ready: the guard reports nothing until it matches, takes the layout then, and reports from there on. `guard.armed()` says whether the guard is watching, and a test whose selector never matched fails instead of passing without having watched anything.
  - **A command line**: `npx playwright-layout-guard scan <address...>` opens pages in a browser and reports every box that moved after the load, next to the layout shift score of the browser (Chromium). Addresses can come from a file (`--file`), the report can be text, JSON, Markdown or HTML (`--format`, `--out`), the options come from a JSON file (`--options`), `--immediate` and `--arm-when` set `start` and `armWhen`, `--screenshots` saves the picture with the moved boxes marked, and the exit code is 0, 1 (something moved) or 2 (wrong command, a page that could not be loaded, an `--arm-when` element that never showed). The script of the trial is the first version of it.

## 0.3.0

### Minor Changes

- 5afafb9: Four additions and one fix that came out of using the guard on a real site:
  
  - **A picture of what moved.** A failed test gets `layout-shifts.png` attached: the old place of every moved box dashed, the new one in amber with the number of its line in the message. `guard.screenshot()` takes the same picture yourself, `screenshot: false` switches it off.
  - **Animations that are meant.** `animations: 'allow'` lets go of the time that a CSS transition or animation of a layout property (a panel that slides open) runs. Animations that never end are still reported.
  - **A baseline for known shifts.** `baseline: 'path.json'` accepts the shifts that are in the file and fails on new ones; `LAYOUT_GUARD_UPDATE=1` writes the file. `guard.unknownShifts` and `assertStable()` respect it.
  - **Options for the whole project.** The new type `LayoutGuardTestOptions` types `use` in `playwright.config.ts`. Every `Shift` now has a `url`, the path of the page it was found on.
  - **A part that drifts slowly is found.** A part that moved by less than the tolerance in every frame (a slow animation of `left`, one pixel a frame) was never reported, because the guard took the new place as the reference every frame. The old place stays the reference now until the part has moved far enough.

## 0.2.0

### Minor Changes

- 8b9bcd2: New option `pageHeight` (`'growth'`, the default, or `'any'`): with `'any'` a page that becomes lower is reported as well, for pages that must not change their height at all.

### Patch Changes

- 8b9bcd2: Fix three false results found by running the guard on a real site: a window that is resized a moment after the load, with the page laying itself out again a moment later, no longer reports the second step; a page that writes its document again (`document.open`) no longer throws "Cannot read properties of null"; a shift that makes the page wider than the window on a phone is reported again. The guard also notices a new window size by itself, because Firefox delivers the resize event late.

## 0.1.0

### Minor Changes

- 26920bf: First release: a Playwright fixture that fails a test when something on the page moves or changes its size, in Chromium, Firefox and WebKit.
