import type { Shift } from './types.js';

function direction(dx: number, dy: number): string {
  const parts: string[] = [];
  if (dy !== 0) {
    parts.push(`${String(Math.abs(dy))} px ${dy > 0 ? 'down' : 'up'}`);
  }
  if (dx !== 0) {
    parts.push(`${String(Math.abs(dx))} px ${dx > 0 ? 'right' : 'left'}`);
  }
  return parts.join(' and ');
}

/** One shift as a line: what moved, where it was, where it is, how far. */
export function describeShift(shift: Shift): string {
  if (shift.kind === 'page-height') {
    const grew = shift.after.height - shift.before.height;
    return `the page became ${String(Math.abs(grew))} px ${grew > 0 ? 'higher' : 'lower'} (${String(shift.before.height)} to ${String(shift.after.height)} px) after ${String(shift.at)} ms`;
  }
  const dx = shift.after.left - shift.before.left;
  const dy = shift.after.top - shift.before.top;
  const text = shift.text === '' ? '' : ` "${shift.text}"`;
  const moved = direction(dx, dy);
  const inside =
    shift.affected > 0
      ? `, with ${String(shift.affected)} ${shift.affected === 1 ? 'element' : 'elements'} inside it`
      : '';
  return `<${shift.element}>${text} moved ${moved === '' ? 'sideways' : moved}${inside} (top ${String(shift.before.top)} to ${String(shift.after.top)}, left ${String(shift.before.left)} to ${String(shift.after.left)}) after ${String(shift.at)} ms`;
}

/** All shifts as the message of a failed test. */
export function formatShifts(shifts: readonly Shift[]): string {
  if (shifts.length === 0) {
    return 'Nothing on the page moved.';
  }
  const lines = shifts.map((shift, at) => `  ${String(at + 1)}. ${describeShift(shift)}`);
  return [
    `Something on the page moved or changed its size (${String(shifts.length)} ${shifts.length === 1 ? 'shift' : 'shifts'}):`,
    ...lines,
    '',
    'If this is meant to happen: mark the box with data-layout-fluid, leave it out with the "ignore" option, or wrap the action in guard.allowShifts().',
  ].join('\n');
}
