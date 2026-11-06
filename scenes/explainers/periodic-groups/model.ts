/**
 * Where an element sits in the periodic table, computed from its electrons.
 *
 * The filling rule (Madelung: subshells in order of n + l, then n) predicts a
 * ground-state configuration for every element. NIST's Atomic Spectra Database
 * supplies the captured reference for elements 1 to 108; 20 configurations differ
 * from the prediction. Those 20 are stored here, and the tests check all 108
 * against the frozen reference. Beyond hassium (108), this model uses the filling
 * rule's prediction. The captured rows do not distinguish measured configurations
 * from computed ones.
 *
 * A position comes from the prediction: the block is the subshell filled last,
 * the period is the number of noble gases passed, and the group counts the s, d
 * and p electrons beyond the preceding noble gas (f is not counted), as the IUPAC
 * 1 to 18 numbering does. The test compares every position with an independently
 * typed 18-column table that puts Sc, Y, Lu and Lr in group 3, the arrangement
 * Wikipedia reports IUPAC endorsed in 1988 and 2021 (many textbooks use La and Ac).
 * Two adjustments are visible in the scene rather than hidden in the count: before
 * period 4 there is no d subshell, so the p block starts 10 columns over; and
 * helium's two electrons count to 2, but helium sits over neon in group 18.
 */

export type Block = 's' | 'p' | 'd' | 'f';
export interface Subshell { readonly n: number; readonly l: Block; readonly electrons: number }

export const SYMBOLS = [
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
  'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
  'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
  'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
] as const;
export type Symbol = typeof SYMBOLS[number];

/** Names for the elements a caption speaks of. */
export const NAMES: Partial<Record<Symbol, string>> = {
  H: 'hydrogen', He: 'helium', Li: 'lithium', Be: 'beryllium', B: 'boron', C: 'carbon', N: 'nitrogen', O: 'oxygen',
  F: 'fluorine', Ne: 'neon', Na: 'sodium', Mg: 'magnesium', Al: 'aluminium', Cl: 'chlorine', Ar: 'argon',
  K: 'potassium', Ca: 'calcium', Sc: 'scandium', Fe: 'iron', Co: 'cobalt', Ni: 'nickel', Cu: 'copper',
  Br: 'bromine', Kr: 'krypton', Rb: 'rubidium', Y: 'yttrium', Ru: 'ruthenium', Ag: 'silver', I: 'iodine', Xe: 'xenon',
  Cs: 'caesium', La: 'lanthanum', Lu: 'lutetium', Os: 'osmium', Au: 'gold', At: 'astatine', Rn: 'radon',
  Fr: 'francium', Ac: 'actinium', Lr: 'lawrencium', Hs: 'hassium', Rg: 'roentgenium', Ts: 'tennessine', Og: 'oganesson',
};

export const CAPACITY: Record<Block, number> = { s: 2, p: 6, d: 10, f: 14 };
const L: Record<Block, number> = { s: 0, p: 1, d: 2, f: 3 };
const BLOCKS: Block[] = ['s', 'p', 'd', 'f'];

/** Subshells in filling order: by n + l, then by n. Through 7p, enough for element 118. */
export const FILLING_ORDER: readonly { n: number; l: Block }[] = (() => {
  const all: { n: number; l: Block }[] = [];
  for (let n = 1; n <= 7; n++) for (const l of BLOCKS) if (L[l] < n) all.push({ n, l });
  return all.sort((a, b) => a.n + L[a.l] - (b.n + L[b.l]) || a.n - b.n);
})();

/** The noble gases' atomic numbers: each closes a period. */
export const NOBLE = [2, 10, 18, 36, 54, 86, 118] as const;

export const symbolOf = (z: number): Symbol => {
  const s = SYMBOLS[z - 1];
  if (!s) throw new Error(`No element ${z}`);
  return s;
};
export const atomicNumber = (symbol: Symbol): number => SYMBOLS.indexOf(symbol) + 1;

/** The filling rule's configuration, in filling order. */
export function predicted(z: number): Subshell[] {
  symbolOf(z);
  const out: Subshell[] = [];
  let left = z;
  for (const { n, l } of FILLING_ORDER) {
    if (left === 0) break;
    const electrons = Math.min(CAPACITY[l], left);
    out.push({ n, l, electrons });
    left -= electrons;
  }
  return out;
}

/**
 * Where NIST's ground configuration differs from the filling rule, beyond the
 * noble-gas core. NIST lists every other element up to 108 as predicted.
 */
export const NIST_EXCEPTIONS: Readonly<Record<number, string>> = {
  24: '3d5 4s1', 29: '3d10 4s1', 41: '4d4 5s1', 42: '4d5 5s1', 44: '4d7 5s1', 45: '4d8 5s1', 46: '4d10',
  47: '4d10 5s1', 57: '5d1 6s2', 58: '4f1 5d1 6s2', 64: '4f7 5d1 6s2', 78: '4f14 5d9 6s1', 79: '4f14 5d10 6s1',
  89: '6d1 7s2', 90: '6d2 7s2', 91: '5f2 6d1 7s2', 92: '5f3 6d1 7s2', 93: '5f4 6d1 7s2', 96: '5f7 6d1 7s2',
  103: '5f14 7s2 7p1',
};
/** The captured NIST reference covers elements 1 to 108. */
export const NIST_UP_TO = 108;

const byShell = (a: Subshell, b: Subshell) => a.n - b.n || L[a.l] - L[b.l];
const parse = (text: string): Subshell[] =>
  text.split(' ').map((part) => {
    const m = /^(\d)([spdf])(\d+)$/.exec(part);
    if (!m) throw new Error(`Bad subshell ${part}`);
    return { n: Number(m[1]), l: m[2] as Block, electrons: Number(m[3]) };
  });

/** The preceding noble gas: the largest noble-gas atomic number below z, or 0. */
export const coreOf = (z: number): number => NOBLE.filter((g) => g < z).at(-1) ?? 0;

/** NIST's ground configuration (1 to 108), in shell order, n then l, as NIST writes it. */
export function listed(z: number): Subshell[] {
  if (z > NIST_UP_TO) throw new Error(`No captured NIST configuration for element ${z}`);
  const exception = NIST_EXCEPTIONS[z];
  if (!exception) return predicted(z).sort(byShell);
  // No noble gas is an exception, so the core is as predicted.
  const core = coreOf(z);
  return [...(core ? predicted(core) : []), ...parse(exception)].sort(byShell);
}

/** The subshells of a configuration beyond the preceding noble gas's. */
export function beyondCore(config: readonly Subshell[], z: number): Subshell[] {
  const core = coreOf(z) ? predicted(coreOf(z)) : [];
  const inCore = (s: Subshell) => core.some((c) => c.n === s.n && c.l === s.l && c.electrons === s.electrons);
  return config.filter((s) => !inCore(s));
}

/** s, d and p electrons beyond the core: f electrons are not counted. */
export const counted = (config: readonly Subshell[], z: number): number =>
  beyondCore(config, z).filter((s) => s.l !== 'f').reduce((sum, s) => sum + s.electrons, 0);

export interface Position {
  z: number;
  symbol: Symbol;
  period: number;
  block: Block;
  /** 1 to 18; null in the f block, whose 14 columns have no group number. */
  group: number | null;
  /** In the f block, the column of the detached f rows, 1 to 14. */
  fColumn: number | null;
  /** s, d and p electrons beyond the preceding noble gas, by the filling rule. */
  count: number;
  /** Why the group differs from the count, if it does. */
  adjustment: 'none' | 'no d subshell yet' | 'closed shell';
}

export function position(z: number): Position {
  const config = predicted(z),
    last = config.at(-1)!,
    period = NOBLE.filter((g) => g < z).length + 1,
    count = counted(config, z);
  const base = { z, symbol: symbolOf(z), period, block: last.l, count };
  if (last.l === 'f') return { ...base, group: null, fColumn: last.electrons, adjustment: 'none' };
  // Before period 4 no d subshell has been filled, so the p block's columns sit
  // where the heavier elements' 2 + 10 + p puts them.
  if (last.l === 'p' && !config.some((s) => s.l === 'd')) return { ...base, group: count + 10, fColumn: null, adjustment: 'no d subshell yet' };
  // A closed shell goes over the other noble gases: only helium's count disagrees.
  if ((NOBLE as readonly number[]).includes(z) && count !== 18) return { ...base, group: 18, fColumn: null, adjustment: 'closed shell' };
  return { ...base, group: count, fColumn: null, adjustment: 'none' };
}

export const POSITIONS: readonly Position[] = SYMBOLS.map((_, i) => position(i + 1));

/** The members of a group, top to bottom. */
export const membersOf = (group: number): Position[] => POSITIONS.filter((p) => p.group === group);

/** The difference in atomic number between each member and the one above it. */
export const gaps = (group: number): number[] => {
  const zs = membersOf(group).map((p) => p.z);
  return zs.slice(1).map((z, i) => z - zs[i]!);
};

/** How many elements each period holds: the size of the core a period adds. */
export const periodLength = (period: number): number => NOBLE[period - 1]! - (NOBLE[period - 2] ?? 0);

export interface GroupName { group: number; cas: string; oldIupac: string; byElement: string; trivial: string | null }
/** IUPAC 1 to 18 (since 1988), with the earlier CAS and old IUPAC letters, from Wikipedia's table. */
export const GROUP_NAMES: readonly GroupName[] = [
  { group: 1, cas: 'IA', oldIupac: 'IA', byElement: 'lithium group', trivial: 'hydrogen and alkali metals' },
  { group: 2, cas: 'IIA', oldIupac: 'IIA', byElement: 'beryllium group', trivial: 'alkaline earth metals' },
  { group: 3, cas: 'IIIB', oldIupac: 'IIIA', byElement: 'scandium group', trivial: null },
  { group: 4, cas: 'IVB', oldIupac: 'IVA', byElement: 'titanium group', trivial: null },
  { group: 5, cas: 'VB', oldIupac: 'VA', byElement: 'vanadium group', trivial: null },
  { group: 6, cas: 'VIB', oldIupac: 'VIA', byElement: 'chromium group', trivial: null },
  { group: 7, cas: 'VIIB', oldIupac: 'VIIA', byElement: 'manganese group', trivial: null },
  { group: 8, cas: 'VIIIB', oldIupac: 'VIII', byElement: 'iron group', trivial: null },
  { group: 9, cas: 'VIIIB', oldIupac: 'VIII', byElement: 'cobalt group', trivial: null },
  { group: 10, cas: 'VIIIB', oldIupac: 'VIII', byElement: 'nickel group', trivial: null },
  { group: 11, cas: 'IB', oldIupac: 'IB', byElement: 'copper group', trivial: 'coinage metals' },
  { group: 12, cas: 'IIB', oldIupac: 'IIB', byElement: 'zinc group', trivial: 'volatile metals' },
  { group: 13, cas: 'IIIA', oldIupac: 'IIIB', byElement: 'boron group', trivial: 'triels' },
  { group: 14, cas: 'IVA', oldIupac: 'IVB', byElement: 'carbon group', trivial: 'tetrels' },
  { group: 15, cas: 'VA', oldIupac: 'VB', byElement: 'nitrogen group', trivial: 'pnictogens' },
  { group: 16, cas: 'VIA', oldIupac: 'VIB', byElement: 'oxygen group', trivial: 'chalcogens' },
  { group: 17, cas: 'VIIA', oldIupac: 'VIIB', byElement: 'fluorine group', trivial: 'halogens' },
  { group: 18, cas: 'VIIIA', oldIupac: '0', byElement: 'helium or neon group', trivial: 'noble gases' },
];

/** A configuration as text with superscript counts: 3d¹⁰ 4s¹. */
const SUPER = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (k: number) => String(k).split('').map((d) => SUPER[Number(d)]).join('');
export const subshellText = (s: Subshell) => `${s.n}${s.l}${sup(s.electrons)}`;
export const configText = (config: readonly Subshell[]) => config.map(subshellText).join(' ');
/** Noble-gas shorthand: [Ne] 3s¹. */
export const shorthand = (config: readonly Subshell[], z: number) => {
  const core = coreOf(z), rest = configText(beyondCore(config, z));
  return core ? `[${symbolOf(core)}] ${rest}` : rest;
};
