import type { PageOptions } from './types.js';

/**
 * The part of the guard that runs inside the page. Playwright serializes this function with
 * `toString()` and runs it in the browser before any script of the page, so it must not use anything
 * from outside itself (no imports, no helpers of this package, no closure variables). It is compiled
 * with plain `tsc` for that reason: a bundler that wraps functions in helpers would break it.
 *
 * What it does: from the moment the page has loaded, it looks at every element on every frame and
 * remembers where the element was first seen (its place on the page and its size, from the layout,
 * so effects that only use `transform` do not count). When an element is found somewhere else, it is
 * reported. The page height is watched the same way, because a page that grows means that something
 * was added in the flow.
 */
export function guardInPage(options: PageOptions): void {
  type Box = [top: number, left: number, width: number, height: number];

  interface Controller {
    pause: () => void;
    resume: () => void;
    forget: () => void;
  }

  const globalScope = window as unknown as Record<string, unknown>;
  const report = globalScope[options.report] as ((shift: unknown) => void) | undefined;
  // Installing the guard twice (an init script that runs again) must not double the work
  if (globalScope[`${options.report}:controller`] !== undefined) {
    return;
  }

  let baselines = new WeakMap<Element, Box>();
  const reported = new Set<string>();
  let paused = false;
  let reportedCount = 0;
  // After something that the visitor asked for (a resize, an opened panel, a new address) the page
  // needs a moment to show the result: the guard only looks again after that
  let quietUntil = 0;
  let pageHeight: number | undefined;
  let scrollTop = window.scrollY;
  // The guard looks from the first frame, so that it knows where everything was before it moves, but
  // it only reports once it is armed: at the load event (or at once with start: immediate)
  let armed = options.start === 'immediate';
  // The height of the page is only compared after the load event: while a page is still arriving, it
  // gets longer all the time and nothing that is already shown moves because of that
  let loaded = false;

  // Web components keep their insides in a shadow tree: for the guard the host is the parent of what
  // is at the top of such a tree, and a selector can match across the border
  const parentOf = (node: Element): Element | null => {
    if (node.parentElement !== null) {
      return node.parentElement;
    }
    const root = node.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };
  const closestAcross = (node: Element | null, selector: string): Element | null => {
    for (let current = node; current !== null; current = parentOf(current)) {
      if (current.matches(selector)) {
        return current;
      }
    }
    return null;
  };
  // Every element below the root, and the ones in the shadow trees (open ones) on the way
  const elementsBelow = (root: ParentNode, into: Element[] = []): Element[] => {
    for (const element of root.querySelectorAll('*')) {
      into.push(element);
      if (element.shadowRoot !== null) {
        elementsBelow(element.shadowRoot, into);
      }
    }
    return into;
  };

  // The style of an element is looked up again after a short time, because a script can make a part
  // sticky or inline later (a class that is set on scroll), and reading every style on every frame is
  // too slow on a long page
  const STYLE_LIFETIME = 500;
  // Milliseconds after the load event before the guard reports anything
  const SETTLE_AFTER_LOAD = 50;
  const inline = new WeakMap<Element, { value: boolean; at: number }>();
  // Words inside a line (display: inline) change their size whenever their text changes. That moves
  // nothing by itself, the block that holds them is watched instead
  const isInline = (element: Element): boolean => {
    const now = performance.now();
    let known = inline.get(element);
    if (known === undefined || now - known.at > STYLE_LIFETIME) {
      known = { value: getComputedStyle(element).display === 'inline', at: now };
      inline.set(element, known);
    }
    return known.value;
  };

  const floating = new WeakMap<Element, { value: boolean; at: number }>();
  // Sticky and fixed parts (a header) change their offset while the page scrolls: not a layout change
  const isFloating = (element: Element): boolean => {
    const now = performance.now();
    let known = floating.get(element);
    if (known === undefined || now - known.at > STYLE_LIFETIME) {
      const parent = parentOf(element);
      known = {
        value:
          (parent !== null && isFloating(parent)) ||
          ['sticky', 'fixed'].includes(getComputedStyle(element).position),
        at: now,
      };
      floating.set(element, known);
    }
    return known.value;
  };

  const place = (element: HTMLElement): Box | null => {
    // Hidden elements and fixed ones have no offset parent
    if (element.offsetParent === null) {
      return null;
    }
    let top = 0;
    let left = 0;
    for (
      let node: HTMLElement | null = element;
      node !== null;
      node = node.offsetParent as HTMLElement | null
    ) {
      top += node.offsetTop;
      left += node.offsetLeft;
    }
    return [top, left, element.offsetWidth, element.offsetHeight];
  };

  // Inside a frame the report says which frame, because the same init script runs in every one
  const framePrefix = window === window.top ? '' : `[frame ${location.pathname}] `;

  /** A short way to find the element again: tag, id, classes, and the path to the nearest id */
  const describe = (element: HTMLElement): string => {
    const part = (node: Element): string => {
      const classes = [...node.classList]
        .slice(0, 2)
        .map((name) => `.${CSS.escape(name)}`)
        .join('');
      return `${node.tagName.toLowerCase()}${node.id !== '' ? `#${CSS.escape(node.id)}` : ''}${classes}`;
    };
    const parts = [part(element)];
    let node = parentOf(element);
    while (node !== null && parts.length < 3 && node !== document.body) {
      parts.unshift(part(node));
      if (node.id !== '') {
        break;
      }
      node = parentOf(node);
    }
    return `${framePrefix}${parts.join(' > ')}`;
  };

  // The first words of the text, cut at a word and marked as cut, to recognise the element
  const textOf = (element: HTMLElement): string => {
    const text = element.textContent.trim().replace(/\s+/g, ' ');
    if (text.length <= 40) {
      return text;
    }
    const cut = text.slice(0, 40);
    const space = cut.lastIndexOf(' ');
    return `${space > 20 ? cut.slice(0, space) : cut}…`;
  };

  const send = (key: string, shift: Record<string, unknown>): void => {
    if (reported.has(key) || reportedCount >= options.maxReports) {
      return;
    }
    reported.add(key);
    reportedCount += 1;
    report?.({ ...shift, at: Math.round(performance.now()) });
  };

  const ignored = (element: Element): boolean =>
    options.ignore.length > 0 &&
    options.ignore.some((selector) => closestAcross(element, selector) !== null);

  const scan = (): void => {
    // How far the page was scrolled since the last look: a part that moves exactly as far is stuck to
    // the window (a header that sticks, a table of contents that follows), which is not a layout change
    const scrolled = window.scrollY - scrollTop;
    scrollTop = window.scrollY;
    if (!paused) {
      interface Move {
        deltaTop: number;
        deltaLeft: number;
        root: Move;
        affected: number;
      }
      const moves = new Map<Element, Move>();
      const roots: {
        element: HTMLElement;
        move: Move;
        before: Box;
        now: Box;
      }[] = [];
      // Before the body exists there is nothing to look at yet
      const scope = (document.querySelector(options.scope) ?? document.body) as Element | null;
      for (const element of scope === null ? [] : elementsBelow(scope)) {
        // Pictures (SVG) have no place of their own in the layout, and scripts and styles are not shown
        if (
          !(element instanceof HTMLElement) ||
          ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)
        ) {
          continue;
        }
        // Buttons and links lift or shift a little when pointed at, and what they hold does not
        // rearrange: only the button itself is watched
        if (options.ignoreInsideInteractive) {
          const holder = closestAcross(parentOf(element), 'a, button');
          if (holder !== null) {
            continue;
          }
        }
        // Inside a fluid box the parts may rearrange, the box itself is watched like any other
        const fluid = closestAcross(element, `[${options.fluidAttribute}]`);
        if (fluid !== null && fluid !== element) {
          continue;
        }
        if (ignored(element) || isFloating(element) || isInline(element)) {
          continue;
        }
        // Nobody sees what is invisible: it may fill with text, and it counts as new when it is shown
        if (!element.checkVisibility({ visibilityProperty: true })) {
          baselines.delete(element);
          continue;
        }
        const now = place(element);
        if (now === null) {
          continue;
        }
        const before = baselines.get(element);
        baselines.set(element, now);
        if (before === undefined || !armed || performance.now() < quietUntil) {
          continue;
        }
        // Moved: its top changed, or both its left and its right edge changed. A box that only grows
        // or shrinks (text that changes, a line that wraps) is not a move: what it pushes is moved,
        // and that is reported at the thing that moved.
        const [top, left, width] = now;
        const [oldTop, oldLeft, oldWidth, oldHeight] = before;
        const tolerance = options.tolerance;
        const moved =
          Math.abs(top - oldTop) > tolerance ||
          (Math.abs(left - oldLeft) > tolerance &&
            Math.abs(left + width - (oldLeft + oldWidth)) > tolerance);
        if (moved) {
          // When the box around it moved by the same amount, this is only a consequence: what is
          // reported is the box that moved first, with the number of elements that went with it
          let holder = parentOf(element);
          while (holder !== null && !moves.has(holder)) {
            holder = parentOf(holder);
          }
          const outer = holder === null ? undefined : moves.get(holder);
          const deltaTop = top - oldTop;
          const deltaLeft = left - oldLeft;
          if (
            scrolled !== 0 &&
            Math.abs(deltaTop - scrolled) <= tolerance &&
            Math.abs(deltaLeft) <= tolerance
          ) {
            continue;
          }
          if (
            outer !== undefined &&
            Math.abs(outer.deltaTop - deltaTop) <= tolerance &&
            Math.abs(outer.deltaLeft - deltaLeft) <= tolerance
          ) {
            moves.set(element, {
              deltaTop,
              deltaLeft,
              root: outer.root,
              affected: 0,
            });
            outer.root.affected += 1;
            continue;
          }
          const move: Move = {
            deltaTop,
            deltaLeft,
            root: undefined as unknown as Move,
            affected: 0,
          };
          move.root = move;
          moves.set(element, move);
          roots.push({
            element,
            move,
            before: [oldTop, oldLeft, oldWidth, oldHeight],
            now,
          });
        }
      }
      for (const { element, move, before, now } of roots) {
        send(`${describe(element)}:${before.join(',')}:${now.join(',')}`, {
          kind: 'moved',
          element: describe(element),
          text: textOf(element),
          before: {
            top: before[0],
            left: before[1],
            width: before[2],
            height: before[3],
          },
          after: { top: now[0], left: now[1], width: now[2], height: now[3] },
          affected: move.affected,
        });
      }
    }
    // The page itself: a higher page means that something that was not there was added in the flow
    const height = document.documentElement.scrollHeight;
    if (
      !paused &&
      armed &&
      loaded &&
      pageHeight !== undefined &&
      height - pageHeight > options.tolerance &&
      // A page that is still shorter than the window has nothing below the fold that could be pushed
      height > window.innerHeight &&
      performance.now() >= quietUntil
    ) {
      send(`page:${String(pageHeight)}:${String(height)}`, {
        kind: 'page-height',
        element: `${framePrefix}the page`,
        text: '',
        before: { top: 0, left: 0, width: 0, height: pageHeight },
        after: { top: 0, left: 0, width: 0, height },
        affected: 0,
      });
    }
    pageHeight = height;
  };

  const sample = (): void => {
    scan();
    window.requestAnimationFrame(sample);
  };

  const forget = (): void => {
    quietUntil = performance.now() + options.quietMs;
    baselines = new WeakMap();
    pageHeight = undefined;
  };

  const controller: Controller = {
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      forget();
    },
    forget,
  };
  globalScope[`${options.report}:controller`] = controller;

  // What the visitor asks for (a new window size, an opened panel) is not a surprise
  window.addEventListener('resize', forget);
  document.addEventListener('toggle', forget, true);
  // The toggle event of a <details> comes a moment after the panel has opened (a task of its own),
  // and a frame can be sampled in between on a busy machine: the click on the summary is the first sign
  document.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('summary') !== null) {
        forget();
      }
    },
    true,
  );
  window.addEventListener('popstate', forget);
  // A page that opens a new view with a new history entry (a single page app) shows something new on
  // purpose. replaceState does not count: pages call it all the time while they load (to tidy the
  // address, to remember the scroll position), and the guard must not go blind for that
  const pushState = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>): void => {
    pushState(...args);
    forget();
  };

  window.requestAnimationFrame(sample);
  // A page can change a lot before its first frame (a stylesheet that arrives late): the guard also
  // looks when the document is parsed and whenever a stylesheet, a script or a picture has loaded
  document.addEventListener('DOMContentLoaded', scan);
  document.addEventListener('load', scan, true);
  const arm = (): void => {
    // What the load event itself changes (a script that starts the page) is part of the baseline: the
    // guard takes it a moment later, and starts reporting from then on. A timer and not a frame, so
    // that a slow machine, which draws its next frame late, cannot swallow a shift that comes after
    window.setTimeout(() => {
      scan();
      armed = true;
      loaded = true;
    }, SETTLE_AFTER_LOAD);
  };
  if (document.readyState === 'complete') {
    arm();
  } else {
    window.addEventListener('load', arm, { once: true });
  }
}
