# playwright-layout-guard

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
