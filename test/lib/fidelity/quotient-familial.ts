import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { impot, bareme, tranche, BAREME } from '../../../scenes/explainers/lib/quotient-familial.ts';

/** Every case's step state equals the model's answers for its number of children and income. */
export function check(trace: Trace, values: Record<string, string>): void {
  const enfants = Number(values.enfants),
    rni = Number(values.revenu);
  const r = impot(rni, enfants),
    top = BAREME[2024][tranche(r.quotient)]!.rate;
  assertStepState(trace, 'revenu', { rni, enfants });
  assertStepState(trace, 'parts', { parts: r.parts });
  assertStepState(trace, 'quotient', { quotient: rni / r.parts });
  assertStepState(trace, 'bareme', { parPart: bareme(r.quotient).total, tranche: top, tauxMoyenPart: r.parPart / r.quotient });
  assertStepState(trace, 'multiplie', { brut: r.brut });
  assertStepState(trace, 'reference', { sansEnfants: r.sansEnfants, avantage: r.avantage });
  assertStepState(trace, 'plafond', { plafond: r.plafond, plafonne: r.plafonne, plafQf: r.plafQf });
  assertStepState(trace, 'decote', {
    decote: r.decoteGain,
    impot: r.impot,
    parEnfants: [0, 1, 2, 3].map((n) => impot(rni, n).impot),
  });
  assertStepState(trace, 'revenus-2025', { impot2025: impot(rni, enfants, 2025).impot });
}
