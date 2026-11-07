import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { Card } from '../../../explain/panels.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, { scenario }: FidelityRun): Promise<void> {
  // Measured from the cards themselves: logical start/end take the stage's halves, physical
  // left/right keep theirs, and a card's field columns follow the stage unless it overrides them,
  // before and after an update, without reversing the digits.
  const rtl = values.direction === 'rtl';
  const seen: string[] = [];
  await new scenario.Scene({
    async frame() {},
    async stepEnd(scene, step) {
      if (!['columns', 'updates', 'physical'].includes(step.name)) return;
      const cards = scene.familyMembers().filter((m): m is Card => m instanceof Card);
      assert.equal(cards.length, 2);
      const [left, right] = cards.sort((a, b) => a.center()[0] - b.center()[0]);
      assert.ok(left!.center()[0] < 0 && right!.center()[0] > 0, 'one card on each half');
      const expected = step.name === 'updates' ? '456' : '123';
      for (const card of cards) assert.equal(card.values.get('Field')!.text, expected);
      const nameFirst = (card: Card) => card.labels.get('Field')!.box()![2] < card.values.get('Field')!.box()![0];
      const valueFirst = (card: Card) => card.values.get('Field')!.box()![2] < card.labels.get('Field')!.box()![0];
      // Which card is which, from the titles the reader sees.
      const titled = (t: string) => cards.find((c) => c.describe().what.includes(t))!;
      if (step.name === 'physical') {
        assert.ok(titled('Left,') === left && titled('Right,') === right, 'left and right keep their halves');
        for (const card of cards) {
          assert.equal(card.direction, values.direction);
          assert.ok(rtl ? valueFirst(card) : nameFirst(card), 'physical cards take the stage columns');
        }
      } else {
        const start = titled('Start,'),
          end = titled('End,');
        assert.equal(start, rtl ? right : left, 'start follows the stage');
        assert.equal(end, rtl ? left : right, 'end follows the stage');
        assert.equal(start.direction, values.direction);
        assert.equal(end.direction, 'ltr');
        assert.ok(rtl ? valueFirst(start) : nameFirst(start), 'the Start card inherits the stage columns');
        assert.ok(nameFirst(end), 'the End card’s ltr override puts the name before the value');
      }
      seen.push(step.name);
    },
  }, {skipUntil: Infinity}).run();
  assert.deepEqual(seen, ['columns', 'updates', 'physical']);
  // The state the scene records says the same.
  assertStepState(trace, 'columns', {
    cards: {
      start: { side: rtl ? 'right' : 'left', name: rtl ? 'right of value' : 'left of value', value: '123' },
      end: { side: rtl ? 'left' : 'right', name: 'left of value', value: '123' },
    },
  });
  assertStepState(trace, 'physical', {
    cards: {
      left: { side: 'left', name: rtl ? 'right of value' : 'left of value', value: '123' },
      right: { side: 'right', name: rtl ? 'right of value' : 'left of value', value: '123' },
    },
  });
}
