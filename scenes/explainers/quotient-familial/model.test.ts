import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tranche } from './model.ts';
import { BAS, DEFAUT, FIN_DECOTE, UN150, UN30 } from './answers.ts';

test('the check answers’ words: the plafond binds, the half-part leaves the 30 % tranche, and the décote cancels the tax', () => {
  // The answers' words: the plafond binds at 65 673,88 € and 150 000 € with one child but not at 30 000 €;
  // the half-part pulls the quotient out of the 30 % tranche at 65 673,88 € only; the décote cancels the
  // childless couple's tax at 30 000 € and stops before 4 000 €.
  assert.deepEqual([UN30.plafonne, DEFAUT.plafonne, UN150.plafonne], [false, true, true]);
  assert.deepEqual([tranche(65673.88 / 2), tranche(DEFAUT.quotient), tranche(30000 / 2)], [2, 1, 1]);
  assert.equal(BAS.impot, 0);
  assert.ok(BAS.plafQf > 0 && BAS.decote > BAS.plafQf);
  assert.ok(FIN_DECOTE < 4000);
});
