# playwright-layout-guard

## 0.2.0

### Minor Changes

- 8b9bcd2: New option `pageHeight` (`'growth'`, the default, or `'any'`): with `'any'` a page that becomes lower is reported as well, for pages that must not change their height at all.

### Patch Changes

- 8b9bcd2: Fix three false results found by running the guard on a real site: a window that is resized a moment after the load, with the page laying itself out again a moment later, no longer reports the second step; a page that writes its document again (`document.open`) no longer throws "Cannot read properties of null"; a shift that makes the page wider than the window on a phone is reported again. The guard also notices a new window size by itself, because Firefox delivers the resize event late.

## 0.1.0

### Minor Changes

- 26920bf: First release: a Playwright fixture that fails a test when something on the page moves or changes its size, in Chromium, Firefox and WebKit.
