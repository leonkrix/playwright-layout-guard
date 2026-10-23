---
'playwright-layout-guard': patch
---

Fix three false results found by running the guard on a real site: a window that is resized a moment after the load, with the page laying itself out again a moment later, no longer reports the second step; a page that writes its document again (`document.open`) no longer throws "Cannot read properties of null"; a shift that makes the page wider than the window on a phone is reported again. The guard also notices a new window size by itself, because Firefox delivers the resize event late.
