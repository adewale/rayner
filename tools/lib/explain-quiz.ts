import { describeCase } from '../../explain/describe.ts';
import type { StepDescription } from '../../explain/describe.ts';
import type { Project } from './explain-project.ts';
import type { Settings } from '../../explain/index.ts';

/**
 * `rayner quiz`: the explainer as a fresh reader meets it, in text, and the scene's check
 * questions without their answers. Hand the packet to a reader who has not seen the scene, its
 * script or its source (a new agent session, or a person); grade their answers against the key.
 * If they cannot answer from the explainer alone, the explainer does not teach what its script
 * says, whatever its pictures look like. The packet holds only what the page shows a reader: each
 * teaching step's title, line, caption, resting picture in words and drawn as text.
 */
export interface Quiz {
  /** The packet for the reader: Markdown, the explanation then the questions, no answers. */
  packet: string;
  /**
   * The same questions answered from what a second fresh reader already knows. A question counts as taught
   * only when the packet's reader gets it right and the control's reader does not: a reader who
   * already knows the topic answers either way, which says nothing about the explainer.
   */
  control: string;
  /** The key for the grader: the questions with the scene's answers and the grading rule. */
  key: { scene: string; title: string; case: string; questions: { question: string; answer: string }[]; rule: string };
}

export const GRADING_RULE =
  'Grade each answer against the key as right (states the key\'s point), partial (on the way, missing a needed part) or wrong (absent, contradicts the key, "I cannot say" or "I don\'t know"). ' +
  'Judge the idea, not the wording. A question counts as taught when the packet\'s reader is right and the control\'s reader is not. ' +
  'A question the packet\'s reader gets wrong points at the step that should have taught it; one both readers get right does not test the explainer: ask a question only this explainer answers.';

const teaching = (steps: StepDescription[], detail: Set<string>) => {
  const main = steps.filter((s) => !detail.has(s.step));
  return main.length ? main : steps;
};

/** The quiz for `values` (one case, by default the default case) of `project`. */
export async function quiz(project: Project, values: Settings, { drawings = true } = {}): Promise<Quiz> {
  const Scene = project.Scene,
    meta = Scene.meta ?? {},
    checks = meta.checks ?? [];
  if (!checks.length)
    throw new Error('quiz needs check questions: add meta.checks, the questions a reader should be able to answer afterwards (see the script)');
  const variant = project.variants.find((v) => JSON.stringify(v.values) === JSON.stringify(values))!;
  // Reference steps (meta.detail) sit outside the reading path the player steps through.
  const detail = new Set(variant.trace.steps.filter((s) => s.meta.detail === true).map((s) => s.step));
  const described = await describeCase(Scene, values, { snapshots: project.store, drawings });
  const steps = teaching(described.steps, detail);
  const title = meta.title ?? meta.id ?? '';
  const lines = [
    `# ${title}`,
    '',
    'You are reading an explainer you have not seen before. Below is everything its page shows, step by step:',
    'each step\'s title, its line, its caption, and its picture described in words and drawn as text.',
    '',
    ...(described.name ? [`Case shown: ${described.name}`, ''] : []),
  ];
  for (const [i, s] of steps.entries()) {
    lines.push(`## Step ${i + 1} of ${steps.length}: ${s.title}`, '');
    if (s.line) lines.push(`*${s.line}*`, '');
    lines.push(s.caption, '');
    if (s.picture) lines.push(`Picture: ${s.picture}`, '');
    if (s.drawing) lines.push('```text', s.drawing.replace(/\s+$/gm, ''), '```', '');
  }
  const questions = (source: string) => [
    '## Questions',
    '',
    `Answer each question in one to three sentences, using only ${source}, not what you knew before.`,
    `If ${source} does not let you answer a question, write "I cannot say" rather than guessing.`,
    '',
    ...checks.map((c, i) => `${i + 1}. ${c.question}`),
    '',
  ];
  lines.push(...questions('the explainer above'));
  // The control measures what a reader brings: the same questions, answered from what they already know.
  const control = [
    `# ${title}`,
    '',
    '## Questions',
    '',
    'Answer each question in one to three sentences from what you already know. Write "I don\'t know" rather than guessing.',
    '',
    ...checks.map((c, i) => `${i + 1}. ${c.question}`),
    '',
  ];
  return {
    packet: lines.join('\n'),
    control: control.join('\n'),
    key: { scene: meta.id ?? '', title, case: described.name, questions: checks.map((c) => ({ question: c.question, answer: c.answer })), rule: GRADING_RULE },
  };
}
