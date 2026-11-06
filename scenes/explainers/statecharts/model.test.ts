import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeStates, coffeeWithFrother, flatten } from './model.ts';
import { frotherInBrewing, frotherOutside } from './answers.ts';

test('the check answers’ words: outside on the frother froths while off, inside on it cannot, and on steam it pairs only with brewing', () => {
  // The answers' words: outside on, the frother can froth while the machine is off, and inside on it cannot;
  // on steam, frothing pairs only with brewing, so only the brewing states have two words.
  const offFrothing = (m: ReturnType<typeof flatten>) => Object.values(m.configurations).some((c) => c.includes('off') && c.includes('frothing'));
  assert.ok(offFrothing(flatten(frotherOutside())));
  assert.ok(!offFrothing(flatten(coffeeWithFrother())));
  assert.ok(
    Object.values(flatten(frotherInBrewing()).configurations).every((c) => !c.includes('frothing') || activeStates(frotherInBrewing(), c).includes('brewing')),
  );
});
