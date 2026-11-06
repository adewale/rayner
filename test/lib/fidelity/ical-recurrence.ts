import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { INVITED, MOVED_FROM, SERIES, SERVER_CASES, copyOf, counts, expand, guestCopy, organiserCopy, schema, validate, weeks } from '../../../scenes/explainers/lib/ical-recurrence.ts';
import type { Change, Copy } from '../../../scenes/explainers/lib/ical-recurrence.ts';

/** Every scenario's step state equals the model's stored copies, meetings and refusals for that change and copy. */
export function check(trace: Trace, values: Record<string, string>): void {
  const change = values.change as Change,
    copy = values.copy as Copy;
  assert.ok(['none', 'move', 'skip'].includes(change), `unknown change ${change}`);
  assert.ok(['organiser', 'guest'].includes(copy), `unknown copy ${copy}`);
  const starts = (cs: Parameters<typeof expand>[0]) => expand(cs).map((m) => m.start);

  // Each step also records the VEVENTs Alice's object holds: her meeting list is a view of them.
  assertStepState(trace, 'series', { series: { vevents: SERIES.length, meetings: starts(SERIES), components: SERIES } });
  assertStepState(trace, 'invite', { invite: { stored: counts(INVITED), meetings: starts(INVITED), components: INVITED } });
  const after = organiserCopy(change),
    moved = expand(after).find((m) => m.slot === MOVED_FROM)!;
  assertStepState(trace, 'change', {
    change: {
      change,
      stored: counts(after),
      meetings: starts(after),
      ...(change === 'move' ? { moved: { from: moved.slot, to: moved.start } } : {}),
      components: after,
    },
  });
  // The copies view: Alice's and Bob's stored objects side by side, by the weeks of Alice's rule. A staged step drawn
  // from this state alone, so it also holds the edit and each copy's VEVENTs, which the columns list and the strips date.
  const bob = guestCopy(change);
  assertStepState(trace, 'copies', {
    copies: {
      alice: { stored: counts(after), weeks: weeks(after).map((w) => w.week), components: after },
      bob: { stored: counts(bob.copy), weeks: weeks(bob.copy).map((w) => w.week), sent: bob.messages.map((m) => m.method), components: bob.copy },
      change,
    },
  });
  assertStepState(trace, 'schema', { schema: { relations: schema('rfc') } });
  const mine = copyOf(change, copy);
  // The copy's VEVENTs too: Bob's copy is a staged step whose stored object is drawn from them.
  assertStepState(trace, 'copy', { copy: { copy, stored: counts(mine), meetings: expand(mine).map((m) => [m.start, m.cancelled]), components: mine } });
  if (copy === 'guest') assertStepState(trace, 'copy', { messages: guestCopy(change).messages.map((m) => m.method) });
  assertStepState(trace, 'server', {
    server: {
      relations: schema('sabre'),
      refused: Object.fromEntries((['two masters', 'two RRULEs', 'override only'] as const).map((k) => [k, validate(SERVER_CASES[k]).map((r) => r.message)])),
    },
  });

  // The headings say the model's counts.
  const title = (step: string) => String(trace.steps.find((s) => s.step === step)!.meta.title);
  if (copy === 'organiser') assert.match(title('copy'), new RegExp(`^Alice’s copy: ${['', 'one', 'two', 'three'][counts(mine).vevents]} VEVENT`), title('copy'));
  if (change === 'skip') assert.match(title('change'), new RegExp(`${['', '', '', '', '', 'five', 'six'][expand(after).length]} meetings remain`), title('change'));
}
