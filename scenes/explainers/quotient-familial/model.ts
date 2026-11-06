// French income tax on one year's revenu net imposable for a married or PACS couple, as
// OpenFisca France computes it, cut down to the quotient familial, its cap and the décote.
// Every rule and number below is read from openfisca/openfisca-france at tag 176.1.3,
// commit 5cc6563749b88254b479ef89c98099cb9513d6cb; paths are under openfisca_france/.
// Pure TypeScript with no Node APIs: the scene runs it in the browser.

export type Year = 2024 | 2025;
export interface Bracket {
  /** Lower edge of the tranche, in euros of quotient (income per part). */
  from: number;
  rate: number;
}
/**
 * parameters/impot_revenu/bareme_ir_depuis_1945/bareme.yaml. Thresholds dated 2024-01-01
 * (lines 134, 290, 448, 608) apply to revenus 2024 (threshold_unit: currency_next_year); the
 * 2025-01-01 values (lines 136, 292, 450, 610) were added by commit a59104153d "Barème 2026".
 * Rates: 0 since 1945; 11 % since 2020-01-01 (line 164); 30 %, 41 %, 45 % since 2014-01-01
 * (lines 322, 480, 642).
 */
export const BAREME: Record<Year, readonly Bracket[]> = {
  2024: [
    { from: 0, rate: 0 },
    { from: 11497, rate: 0.11 },
    { from: 29315, rate: 0.3 },
    { from: 83823, rate: 0.41 },
    { from: 180294, rate: 0.45 },
  ],
  2025: [
    { from: 0, rate: 0 },
    { from: 11600, rate: 0.11 },
    { from: 29579, rate: 0.3 },
    { from: 84577, rate: 0.41 },
    { from: 181917, rate: 0.45 },
  ],
};
/**
 * plafond: parameters/impot_revenu/calcul_impot_revenu/plaf_qf/plafond_avantages_procures_par_demi_part/general.yaml
 * lines 89–92 (1 791 then 1 807). décote: plaf_qf/decote/seuil_couple.yaml lines 41–44
 * (1 470 then 1 483) and plaf_qf/decote/taux.yaml line 9 (0.4525 since 2020).
 */
export const PARAMS: Record<Year, { plafond: number; decoteSeuil: number; decoteTaux: number }> = {
  2024: { plafond: 1791, decoteSeuil: 1470, decoteTaux: 0.4525 },
  2025: { plafond: 1807, decoteSeuil: 1483, decoteTaux: 0.4525 },
};

/** numpy.around with no decimals, which OpenFisca's décote and ip_net use: halves go to the even neighbour. */
export function around(x: number): number {
  const r = Math.round(x);
  return Math.abs(x - Math.trunc(x)) === 0.5 ? 2 * Math.round(x / 2) : r;
}

/** One tranche's share of a quotient: the slice of the quotient inside it and the tax on that slice. */
export interface Slice {
  from: number;
  /** Upper edge, or null for the open top tranche. */
  to: number | null;
  rate: number;
  base: number;
  tax: number;
}
/** OpenFisca's MarginalRateTaxScale.calc: each tranche taxes only the part of q inside it. */
export function bareme(q: number, year: Year = 2024): { total: number; slices: Slice[] } {
  const b = BAREME[year];
  const slices = b.map((br, i) => {
    const to = b[i + 1]?.from ?? null,
      base = Math.max(0, Math.min(q, to ?? Infinity) - br.from);
    return { from: br.from, to, rate: br.rate, base, tax: br.rate * base };
  });
  return { total: slices.reduce((s, x) => s + x.tax, 0), slices };
}
/**
 * The income's euros in each tranche, two ways: the barème on the whole income, and on the quotient
 * times the parts. Both add up to the income; split into parts, they sit lower in the barème.
 */
export function repartition(rni: number, enfants: number, year: Year = 2024): { rate: number; entier: number; parts: number }[] {
  const p = parts(enfants),
    split = bareme(rni / p, year).slices;
  return bareme(rni, year).slices.map((x, k) => ({ rate: x.rate, entier: x.base, parts: p * split[k]!.base }));
}
/** The tranche q falls in: its rate is the taux marginal. */
export function tranche(q: number, year: Year = 2024): number {
  const b = BAREME[year];
  let i = 0;
  while (i + 1 < b.length && q >= b[i + 1]!.from) i++;
  return i;
}

/**
 * nbptr for a married or PACS couple with `enfants` children fully in their care
 * (model/prelevements_obligatoires/impot_revenu/ir.py, nbptr.formula_2008_01_01, lines 3792–3828):
 * 1 + 1 for the spouse, then ½ part each for the first two children and 1 from the third
 * (plaf_qf/quotient_familial/cas_general/enf1, enf2, enf3_et_sup.yaml).
 */
export function parts(enfants: number): number {
  return 2 + 0.5 * Math.min(enfants, 1) + 0.5 * Math.max(Math.min(enfants - 1, 1), 0) + Math.max(enfants - 2, 0);
}

export interface Impot {
  rni: number;
  enfants: number;
  year: Year;
  /** nbptr */
  parts: number;
  /** rni / nbptr */
  quotient: number;
  /** bareme.calc(rni / nbptr), the tax on one part */
  parPart: number;
  /** ir_brut = nbptr × bareme.calc(rni / nbptr) (ir.py line 1338) */
  brut: number;
  /** ir_ss_qf = nb_adult × bareme.calc(rni / nb_adult), the same couple with no children (lines 1402–1403) */
  sansEnfants: number;
  /** The tax the children's parts remove: ir_ss_qf − ir_brut (avantage_qf when the cap does not bind) */
  avantage: number;
  /** Half-parts beyond the couple's two: aa0 = (nbptr − nb_adult) × 2 (line 1539) */
  demiParts: number;
  /** B = plafond × aa0 (line 1542) */
  plafond: number;
  /** C = max(0, A − B) (line 1552) */
  plancher: number;
  /** ir_plaf_qf = max(I, C) (line 1554); no réduction complémentaire applies to these households */
  plafQf: number;
  /** I < C: the cap takes back the advantage above B */
  plafonne: boolean;
  /** decote.formula_2014_01_01 (lines 1627–1636): around(max(0, seuil_couple − taux × ir_plaf_qf)) */
  decote: number;
  /** decote_gain_fiscal (line 1652): around(min(decote, ir_plaf_qf)) */
  decoteGain: number;
  /** ip_net.formula_2020_01_01 (line 1735): around(ir_plaf_qf − decote_gain_fiscal) */
  impot: number;
  /** Rate of the tranche the quotient falls in */
  trancheQuotient: number;
  /**
   * ir_taux_marginal (lines 1341–1385): the rate of the tranche of rni / nbptr, or of rni / 2
   * when the cap binds, because the capped tax is then the two-part tax minus a constant
   */
  tauxMarginal: number;
  /** impot / rni */
  tauxMoyen: number;
}

/**
 * ip_net for a married or PACS couple: impôt after the quotient familial, its cap and the
 * décote, before réductions and crédits d'impôt and before the 61 € recouvrement threshold.
 */
export function impot(rni: number, enfants: number, year: Year = 2024): Impot {
  const p = PARAMS[year],
    n = parts(enfants),
    quotient = rni / n;
  const parPart = bareme(quotient, year).total,
    brut = n * parPart,
    sansEnfants = 2 * bareme(rni / 2, year).total;
  const demiParts = (n - 2) * 2,
    plafond = p.plafond * demiParts,
    plancher = Math.max(0, sansEnfants - plafond),
    plafQf = Math.max(brut, plancher);
  const decote = around(Math.max(0, p.decoteSeuil - p.decoteTaux * plafQf)),
    decoteGain = around(Math.min(decote, plafQf)),
    // OpenFisca returns −0 when the décote cancels the tax (30 000 €, no children); the reader sees 0.
    net = around(plafQf - decoteGain) + 0;
  return {
    rni,
    enfants,
    year,
    parts: n,
    quotient,
    parPart,
    brut,
    sansEnfants,
    avantage: sansEnfants - brut,
    demiParts,
    plafond,
    plancher,
    plafQf,
    plafonne: brut < plancher,
    decote,
    decoteGain,
    impot: net,
    trancheQuotient: BAREME[year][tranche(quotient, year)]!.rate,
    tauxMarginal: BAREME[year][tranche(brut < plancher ? rni / 2 : quotient, year)]!.rate,
    tauxMoyen: net / rni,
  };
}

// ---- French number formatting, by hand so the scene gives the same text in every runtime.
/** Narrow no-break space: thousands separator, and before ; : ! ? % and inside « ». */
export const NNBSP = ' ';
/** No-break space, before €. */
export const NBSP = ' ';
/** 65673.88 → "65 673,88" with narrow no-break spaces; `decimals` fixed. */
export function nombre(x: number, decimals = 0): string {
  const [whole, frac] = Math.abs(x).toFixed(decimals).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  return (x < 0 && Number(x.toFixed(decimals)) !== 0 ? '−' : '') + grouped + (frac ? ',' + frac : '');
}
/** Euros, whole by default. */
export const euros = (x: number, decimals = 0) => nombre(x, decimals) + NBSP + '€';
/** 0.11 → "11 %", 0.4525 → "45,25 %", 0.0918 with 1 decimal → "9,2 %". */
export function pourcent(rate: number, decimals?: number): string {
  const v = rate * 100;
  const d = decimals ?? (Number.isInteger(Math.round(v * 1e6) / 1e6) ? 0 : 2);
  return nombre(v, d) + NNBSP + '%';
}
/** 2.5 → "2,5"; 2 → "2". */
export const partsTexte = (n: number) => nombre(n, Number.isInteger(n) ? 0 : 1);
