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
  /** The most shifts that are reported in one test. Default 50. */
  maxReports?: number;
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
  maxReports: number;
}
