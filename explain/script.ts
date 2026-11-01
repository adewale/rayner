import { stepWords } from './trace.ts';

/**
 * The script a scene is written from, as far as tools can hold it to it: `meta.answer`, the one
 * sentence that answers the reader's question, and `meta.checks`, the questions a reader should be
 * able to answer afterwards. See skills/rayner-explainers/SKILL.md, "Script first".
 */
export interface ScriptMeta {
  answer?: unknown;
  checks?: unknown;
}
/** The most check questions a scene may ask: more is a test, not a check. */
export const CHECKS_MAX = 6;
/** The teaching steps an answer must arrive within. */
export const ANSWER_BY_STEP = 2;

/** Refuse an `answer` or `checks` that cannot work: wrong types, empty text, or too many questions. */
export function checkScriptMeta(meta: ScriptMeta | undefined): void {
  if (meta?.answer !== undefined && (typeof meta.answer !== 'string' || !meta.answer.trim()))
    throw new Error('meta.answer must be the one sentence that answers the reader’s question');
  if (meta?.checks === undefined) return;
  if (!Array.isArray(meta.checks) || !meta.checks.length)
    throw new Error('meta.checks must be a list of { question, answer }');
  if (meta.checks.length > CHECKS_MAX)
    throw new Error(`meta.checks asks ${meta.checks.length} questions; at most ${CHECKS_MAX}`);
  for (const [i, c] of meta.checks.entries()) {
    const q = (c as { question?: unknown })?.question,
      a = (c as { answer?: unknown })?.answer;
    if (typeof q !== 'string' || !q.trim()) throw new Error(`meta.checks[${i}] has no question`);
    if (typeof a !== 'string' || !a.trim()) throw new Error(`meta.checks[${i}] ("${q}") has no answer`);
  }
}

/** Text compared as a reader reads it: case, quote style, spacing and final punctuation ignored. */
export function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[  \s]+/g, ' ')
    .trim()
    .replace(/[.!?…:;,\s]+$/u, '');
}

type Step = { step: string; meta: Record<string, unknown> };
/** Teaching steps, as the player counts them: every step not marked `detail`, or every step. */
function teaching<T extends Step>(steps: readonly T[]): T[] {
  const main = steps.filter((s) => s.meta.detail !== true);
  return main.length ? main : [...steps];
}

/**
 * Where a case's steps first state `answer`: the teaching step (1-based) whose title, line or
 * caption contains it, or null when none does.
 */
export function answerStep(answer: string, steps: readonly Step[]): { step: string; at: number } | null {
  const wanted = normalise(answer);
  for (const [i, s] of teaching(steps).entries()) {
    const w = stepWords(s);
    if ([w.title, w.line, w.caption].some((text) => normalise(text).includes(wanted))) return { step: s.step, at: i + 1 };
  }
  return null;
}

export interface ScriptReport {
  /** The teaching step that first states `meta.answer` (1-based), or null when no step does. */
  answer?: { step: string; at: number } | null;
  /** How many check questions the page asks after its last step. */
  checks: number;
  /** What the scene's script leaves undeclared: `answer`, `checks`. */
  missing: ('answer' | 'checks')[];
  /** Why the case fails the script gate; empty when it passes. */
  problems: string[];
}
/**
 * The script gate for one case: a declared answer must be stated by the second teaching step.
 * An undeclared answer or check list is reported as missing, not failed, so older scenes still
 * check; new scenes start with both (`rayner init`).
 */
export function scriptReport(meta: ScriptMeta | undefined, steps: readonly Step[]): ScriptReport {
  checkScriptMeta(meta);
  const missing: ScriptReport['missing'] = [],
    problems: string[] = [];
  let found: ScriptReport['answer'];
  if (typeof meta?.answer === 'string') {
    found = answerStep(meta.answer, steps);
    if (!found) problems.push(`No step states meta.answer ("${meta.answer}"); put it in the title, line or caption of step 1 or 2`);
    else if (found.at > ANSWER_BY_STEP)
      problems.push(`meta.answer first appears in step ${found.at} ("${found.step}"); state it by step ${ANSWER_BY_STEP}, before the explanation elaborates`);
  } else missing.push('answer');
  const checks = Array.isArray(meta?.checks) ? meta.checks.length : 0;
  if (!checks) missing.push('checks');
  return { ...(found === undefined ? {} : { answer: found }), checks, missing, problems };
}
