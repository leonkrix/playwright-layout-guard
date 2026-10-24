import type { Rect } from './types.js';

/** One shift to draw: the same numbers as in the report. */
export interface Mark {
  /** The number of the line in the report */
  index: number;
  kind: 'moved' | 'page-height';
  before: Rect;
  after: Rect;
}

/** The part of the page that a picture shows, in page coordinates. */
export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws the moved boxes on top of the page: the old place dashed and grey, the new one in amber with
 * the number of the line of the report. A page that became higher gets a line at the old and one at
 * the new end. Playwright sends this function to the page as text, so it must not use anything
 * from outside itself. Returns the part of the page that is worth a picture.
 */
export function drawMarks(marks: Mark[]): Clip {
  const layer = document.createElement('div');
  layer.setAttribute('data-layout-guard-marks', '');
  const style = (element: HTMLElement, values: Record<string, string>): void => {
    // One property at a time: it works with a content security policy that forbids a style attribute
    for (const [name, value] of Object.entries(values)) {
      element.style.setProperty(name, value, 'important');
    }
  };
  style(layer, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    'z-index': '2147483647',
    'pointer-events': 'none',
  });

  const width = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  let top = Infinity;
  let bottom = 0;
  const box = (rect: Rect, values: Record<string, string>, label?: string): void => {
    const element = document.createElement('div');
    style(element, {
      position: 'absolute',
      top: `${String(rect.top)}px`,
      left: `${String(rect.left)}px`,
      width: `${String(Math.max(rect.width, 2))}px`,
      height: `${String(Math.max(rect.height, 2))}px`,
      'box-sizing': 'border-box',
      ...values,
    });
    if (label !== undefined) {
      const badge = document.createElement('span');
      badge.textContent = label;
      style(badge, {
        position: 'absolute',
        top: '0',
        left: '0',
        padding: '2px 5px',
        font: '700 11px/1 ui-monospace, Menlo, Consolas, monospace',
        background: '#f5b642',
        color: '#0a0d12',
      });
      element.append(badge);
    }
    layer.append(element);
  };

  for (const mark of marks) {
    if (mark.kind === 'page-height') {
      for (const [at, color, dash] of [
        [mark.before.height, '#8b98a9', 'dashed'],
        [mark.after.height, '#f5b642', 'solid'],
      ] as const) {
        box(
          { top: at, left: 0, width, height: 0 },
          { 'border-top': `2px ${dash} ${color}` },
          dash === 'solid' ? String(mark.index) : undefined,
        );
        top = Math.min(top, at);
        bottom = Math.max(bottom, at);
      }
    } else {
      box(mark.before, {
        border: '1.5px dashed #8b98a9',
        background: 'rgba(139, 152, 169, 0.14)',
      });
      box(
        mark.after,
        { border: '2px solid #f5b642', background: 'rgba(245, 182, 66, 0.16)' },
        String(mark.index),
      );
      top = Math.min(top, mark.before.top, mark.after.top);
      bottom = Math.max(
        bottom,
        mark.before.top + mark.before.height,
        mark.after.top + mark.after.height,
      );
    }
  }
  document.body.append(layer);

  // A picture of the shifts and some of the page around them, not of the whole page
  const y = Math.max(0, Math.floor(top) - 60);
  return {
    x: 0,
    y,
    width: Math.min(width, 1600),
    height: Math.max(40, Math.min(1800, Math.ceil(bottom) + 60 - y)),
  };
}

/** Takes the marks away again. */
export function removeMarks(): void {
  for (const layer of document.querySelectorAll('[data-layout-guard-marks]')) {
    layer.remove();
  }
}
