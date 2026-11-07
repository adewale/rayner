import { stepWords } from './trace.ts';

/**
 * The script a scene is written from, as far as tools can hold it to it: `meta.answer`, the one
 * sentence that answers the reader's question, and `meta.questions`, the questions a reader should
 * be able to answer afterwards. See skills/rayner-explainers/SKILL.md, "Script first".
 */
export interface ScriptMeta {
  answer?: unknown;
  questions?: unknown;
}
/**
 * The explainer's one-sentence answer, as its script's intent header states it (Rayner adopts it as
 * `meta.answer`), so a caption that states the answer reads it instead of keeping a copy.
 */
export function answerOf(scene: object): string {
  const answer = (scene.constructor as { meta?: ScriptMeta }).meta?.answer;
  if (typeof answer !== 'string' || !answer.trim())
    throw new Error(`${scene.constructor.name} has no answer: write it in script.md's intent header (- **Answer:** …), or in static meta.answer`);
  return answer;
}
/** The most reader questions a scene may ask: more is a test, not a recap. */
export const QUESTIONS_MAX = 6;

/** Refuse an `answer` or `questions` that cannot work: wrong types, empty text, or too many questions. */
export function checkScriptMeta(meta: ScriptMeta | undefined): void {
  if (meta?.answer !== undefined && (typeof meta.answer !== 'string' || !meta.answer.trim()))
    throw new Error('meta.answer must be the one sentence that answers the reader’s question');
  if (meta?.questions === undefined) return;
  if (!Array.isArray(meta.questions) || !meta.questions.length)
    throw new Error('meta.questions must be a list of { question, answer }');
  if (meta.questions.length > QUESTIONS_MAX)
    throw new Error(`meta.questions asks ${meta.questions.length} questions; at most ${QUESTIONS_MAX}`);
  for (const [i, c] of meta.questions.entries()) {
    const q = (c as { question?: unknown })?.question,
      a = (c as { answer?: unknown })?.answer;
    if (typeof q !== 'string' || !q.trim()) throw new Error(`meta.questions[${i}] has no question`);
    if (typeof a !== 'string' || !a.trim()) throw new Error(`meta.questions[${i}] ("${q}") has no answer`);
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

/** A step as the reading-path rule reads it: a trace's step record, a scene's step, or anything with their `meta`. */
export type TeachingStep = { readonly meta: Readonly<Record<string, unknown>> };
type Step = TeachingStep & { step: string };
/** Whether a step is marked `detail`: reference, linkable and reviewable, outside the reading path. */
export const isDetail = (step: TeachingStep): boolean => step.meta.kind === 'detail';
/**
 * The indices of the teaching steps, the reading path the player steps through and numbers:
 * every step not marked `detail`, or every step when all of them are.
 */
export function teachingIndices(steps: readonly TeachingStep[]): number[] {
  const main = steps.flatMap((s, i) => (isDetail(s) ? [] : [i]));
  return main.length ? main : steps.map((_, i) => i);
}
/** The teaching steps themselves (teachingIndices). */
export function teaching<T extends TeachingStep>(steps: readonly T[]): T[] {
  return teachingIndices(steps).map((i) => steps[i]!);
}
/** Whether `steps[index]` is off the reading path: a detail step, while some step is not one. */
export const offPath = (steps: readonly TeachingStep[], index: number): boolean =>
  !!steps[index] && isDetail(steps[index]) && steps.some((s) => !isDetail(s));

/**
 * Where a scenario's steps first state `answer`: the teaching step (1-based) whose title, line or
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
  /** How many reader questions the page asks after its last step. */
  questions: number;
  /** What the scene's script leaves undeclared: `answer`, `questions`. */
  missing: ('answer' | 'questions')[];
  /** Why the scenario fails the script gate; empty when it passes. */
  problems: string[];
}
/**
 * The script gate for one scenario: some teaching step must state a declared answer. Where it first
 * does is reported (`answer.at`), not gated: whether it arrives before the explanation elaborates
 * is a reader's judgement, and a fixed step number would only stand in for it. An undeclared
 * answer or question list is reported as missing, not failed, so older scenes still check; new
 * scenes start with both (`rayner init`).
 */
export function scriptReport(meta: ScriptMeta | undefined, steps: readonly Step[]): ScriptReport {
  checkScriptMeta(meta);
  const missing: ScriptReport['missing'] = [],
    problems: string[] = [];
  let found: ScriptReport['answer'];
  if (typeof meta?.answer === 'string') {
    found = answerStep(meta.answer, steps);
    if (!found) problems.push(`No step states meta.answer ("${meta.answer}"); put it in a title, line or caption, before the explanation elaborates`);
  } else missing.push('answer');
  const questions = Array.isArray(meta?.questions) ? meta.questions.length : 0;
  if (!questions) missing.push('questions');
  return { ...(found === undefined ? {} : { answer: found }), questions, missing, problems };
}
