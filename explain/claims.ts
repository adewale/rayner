import { stepWords } from './trace.ts';
import { normalise } from './script.ts';

/** Optional evidence links and editorial lint over step titles, lines and captions.
 * Matching a phrase to a named test is not proof of truth or of what that test asserts.
 * Stage labels and check answers need separate review. See docs/REFERENCE.md, meta.claims.
 */
export interface Claim {
  /** A phrase of the sentence the claim backs, matched as a reader reads it (case and quotes ignored). */
  says: string;
  /** The test that holds it: a test file and part of the test's name, "test/x.test.ts: name". */
  test?: string;
  /**
   * Instead of a test: the sentence's scope is only what its own step draws ("every round in the strip"),
   * so the picture, computed from the model, is the evidence. A claim about cases the page doesn't
   * show needs a test.
   */
  shown?: true;
}
export interface ClaimsMeta {
  claims?: unknown;
}

/** English scope words worth inspecting; this is not a complete claim detector. */
export const SCOPE_WORDS = /\b(every|never|only|always|whenever|nobody|no one|impossible)\b/i;
/** Text that reads as code rather than as a reader's word: an identifier, a call, an edge id. */
const CODE = /`[^`]+`|\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z]+_[A-Za-z0-9_]+\b|\b[\w$.]+\(\)|\b\w+->\w+(?:#\d+)?|\b[A-Za-z]+\.[a-z]+[A-Za-z]*\(/g;

/** Refuse `claims` that cannot work: not a list, or a claim without a phrase or a test. */
export function checkClaimsMeta(meta: ClaimsMeta | undefined): Claim[] {
  if (meta?.claims === undefined) return [];
  if (!Array.isArray(meta.claims)) throw new Error('meta.claims must be a list of { says, test }');
  return meta.claims.map((c, i) => {
    const says = (c as { says?: unknown })?.says,
      test = (c as { test?: unknown })?.test,
      shown = (c as { shown?: unknown })?.shown;
    if (typeof says !== 'string' || !says.trim()) throw new Error(`meta.claims[${i}] has no says`);
    if (shown === true && test === undefined) return { says, shown: true as const };
    if (typeof test !== 'string' || !/^[^:]+\.test\.ts: .+/.test(test))
      throw new Error(`meta.claims[${i}] ("${says}") needs test: "test/<file>.test.ts: <part of the test's name>", or shown: true when it speaks only of its own step's picture`);
    return { says, test };
  });
}

/** A text's sentences, split where a sentence ends and the next begins. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'‘(¿¡])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Step = { step: string; meta: Record<string, unknown> };
export interface ClaimsReport {
  /** Each sentence with a scope word, the step it is in, and what backs it, if anything: a test, or "shown". */
  scope: { step: string; sentence: string; backedBy?: string }[];
  /** How many scope sentences no declared claim backs. */
  unbacked: number;
  /** Each code name in the steps' words, with the step that first uses it. */
  code: { token: string; step: string }[];
  /** The declared claims this case states somewhere (by `says`). */
  stated: string[];
}

/** One case's claims report: its scope sentences, which declared claims back them, and its code names. */
export function claimsReport(meta: ClaimsMeta | undefined, steps: readonly Step[]): ClaimsReport {
  const claims = checkClaimsMeta(meta);
  const scope: ClaimsReport['scope'] = [],
    code = new Map<string, string>(),
    stated = new Set<string>();
  for (const s of steps) {
    const w = stepWords(s);
    for (const text of [w.title, w.line, w.caption]) {
      for (const sentence of sentences(text)) {
        const n = normalise(sentence);
        const matches = claims.filter((c) => n.includes(normalise(c.says)));
        for (const claim of matches) stated.add(claim.says);
        const backing = matches[0];
        if (SCOPE_WORDS.test(sentence)) scope.push({ step: s.step, sentence, ...(backing ? { backedBy: backing.test ?? 'shown' } : {}) });
      }
      for (const m of text.matchAll(CODE)) if (!code.has(m[0])) code.set(m[0], s.step);
    }
  }
  return {
    scope,
    unbacked: scope.filter((s) => !s.backedBy).length,
    code: [...code].map(([token, step]) => ({ token, step })),
    stated: [...stated],
  };
}
