import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { impot, bareme, tranche, repartition, BAREME } from '../../../scenes/explainers/lib/quotient-familial.ts';

/** Every scenario's step state equals the model's answers for its number of children and income. */
export function check(trace: Trace, values: Record<string, string>): void {
  const enfants = Number(values.enfants),
    rni = Number(values.revenu);
  const r = impot(rni, enfants),
    top = BAREME[2024][tranche(r.quotient)]!.rate;
  assertStepState(trace, 'revenu', { rni, enfants });
  assertStepState(trace, 'parts', { parts: r.parts });
  assertStepState(trace, 'quotient', { quotient: rni / r.parts });
  assertStepState(trace, 'bareme', { parPart: bareme(r.quotient).total, tranche: top, tauxMoyenPart: r.parPart / r.quotient });
  // The two rulers: the income's euros in each tranche, whole and by parts.
  assertStepState(trace, 'tranches', { tranches: repartition(rni, enfants) });
  assertStepState(trace, 'multiplie', { brut: r.brut });
  assertStepState(trace, 'reference', { sansEnfants: r.sansEnfants, avantage: r.avantage });
  // The plafond card multiplies the half-parts the step records.
  assertStepState(trace, 'plafond', { plafond: r.plafond, plafonne: r.plafonne, plafQf: r.plafQf, demiParts: r.demiParts });
  assertStepState(trace, 'decote', {
    decote: r.decoteGain,
    impot: r.impot,
    parEnfants: [0, 1, 2, 3].map((n) => impot(rni, n).impot),
    // The household card's last row: the share of the income the tax takes.
    tauxMoyen: r.tauxMoyen,
  });
  assertStepState(trace, 'revenus-2025', { impot2025: impot(rni, enfants, 2025).impot });
}
