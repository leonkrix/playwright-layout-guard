/** Where an element is on the page and how big it is, in CSS pixels. Taken from the layout, so `transform` does not count. */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** One thing that moved or changed its size while the test ran. */
export interface Shift {
  /** `moved`: an element stands somewhere else. `page-height`: the page became higher. */
  kind: 'moved' | 'page-height';
  /** A short way to find the element, such as `main > div.banner` */
  element: string;
  /** The first words of its text, to recognise it */
  text: string;
  before: Rect;
  after: Rect;
  /** How many elements inside it moved by the same amount; they are not listed on their own */
  affected: number;
  /** Milliseconds since the page started */
  at: number;
  /** The address of the page (or frame) it was found on, without the query: `/docs/intro` */
  url: string;
}

/** What you can set. Everything is optional; the defaults are what the guard was made with. */
export interface LayoutGuardOptions {
  /**
   * Elements (and everything inside them) that the guard leaves alone, as CSS selectors: an ad slot,
   * a carousel, a live ticker.
   */
  ignore?: string[];
  /**
   * The name of the attribute that marks a box whose inner parts may rearrange (the tiles of a
   * board, a list that grows): the box itself is still watched, what is inside is not.
   * Default `data-layout-fluid`.
   */
  fluidAttribute?: string;
  /** How many pixels an element may be off before it counts as moved. Default 1. */
  tolerance?: number;
  /**
   * How long the guard waits after a resize, an opened `<details>`, or a change of the address
   * before it looks again, in milliseconds. Default 600.
   */
  quietMs?: number;
  /** The part of the page to watch, as a CSS selector. Default `body`. */
  scope?: string;
  /**
   * When to start. `load` (the default) waits for the load event, so what moves while the page is
   * loading is not reported; `immediate` watches from the first frame, which also finds the content
   * that jumps while the page loads.
   */
  start?: 'load' | 'immediate';
  /**
   * Whether to leave out what is inside a link or a button (they lift a little when pointed at).
   * Default `true`.
   */
  ignoreInsideInteractive?: boolean;
  /**
   * Which changes of the height of the page count. `growth` (the default): the page became higher
   * than the window, which means that something was added in the flow. `any`: also a page that
   * became lower, for a page that must not change its height at all.
   */
  pageHeight?: 'growth' | 'any';
  /**
   * What to do with an element whose layout is animated on purpose (a panel that slides open with a
   * CSS transition of its height). `report` (the default): it is a shift like any other. `allow`: while
   * a finite CSS transition or animation of a layout property runs (and for a moment after it),
   * nothing is reported. Animations that never end are not allowed this way, and what moves with
   * `transform` or `opacity` is not a shift anyway.
   */
  animations?: 'report' | 'allow';
  /**
   * The path of a JSON file with the shifts that are known and accepted (for a project that adopts
   * the guard while it still has some). A shift that is in the file does not fail the test, a new one
   * does. Write the file with `LAYOUT_GUARD_UPDATE=1 npx playwright test --workers=1`.
   */
  baseline?: string;
  /**
   * Attach a picture with the moved boxes marked (the old place dashed, the new one in amber, with
   * the number of the report line) to a failed test. Default `true`.
   */
  screenshot?: boolean;
  /** The most shifts that are reported in one test. Default 50. */
  maxReports?: number;
  /**
   * Frames (iframes) that the guard leaves alone, for widgets you do not control. Each entry is text
   * that the address of the frame (origin and path, without the query) contains; `*` stands for any
   * characters, so `'widget.example'` or `'https://widget.example/embed'` work. A frame inside a frame is
   * matched by its own address. The box of the iframe in the page is still watched, use `ignore` to
   * leave that out too.
   */
  ignoreFrames?: string[];
  /**
   * A CSS selector of something that is on the page and shown when the page is ready, for a page that
   * is drawn by a script after the load event (a client-side app): the guard reports nothing until
   * the selector matches, takes the layout then, and reports from there on. It comes on top of
   * `start`. It is looked for in the page itself, frames start as usual. A test fails when the
   * selector never matched on a page, because then nothing was watched.
   */
  armWhen?: string;
}

/** The option of the fixture, to type `use` in `playwright.config.ts` (`defineConfig<LayoutGuardTestOptions>`). */
export interface LayoutGuardTestOptions {
  /** `false` switches the guard off; an object sets its options. */
  layoutGuard: boolean | LayoutGuardOptions;
}

/** What the part that runs in the page gets (everything is filled in). */
export interface PageOptions {
  report: string;
  ignore: string[];
  fluidAttribute: string;
  tolerance: number;
  quietMs: number;
  scope: string;
  start: 'load' | 'immediate';
  ignoreInsideInteractive: boolean;
  pageHeight: 'growth' | 'any';
  animations: 'report' | 'allow';
  maxReports: number;
  ignoreFrames: string[];
  armWhen: string | undefined;
}
