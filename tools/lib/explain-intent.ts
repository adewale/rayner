import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * A script's intent: what the explainer must achieve, written for its author. The script states
 * the question (its `#` heading), a few labelled lines, and the questions a reader should be able
 * to answer afterwards (`## Check yourself`); the rest is the author's own prose. Rayner holds the
 * scene to the parts it can check: the page's title is the question, some step states the answer,
 * and the player asks the check questions. A script with no `**Answer:**` line has no intent
 * header and is not read, so scripts written as reader prose keep working.
 *
 *     # How few moves can carry a tower to another peg?
 *
 *     - **Reader:** knows the rules, has never asked why the answer is 7.
 *     - **Answer:** the smaller tower moves twice and the largest disk once.
 *     - **Checked against:** a search of every arrangement of three, four and five disks.
 *
 *     ## Check yourself
 *
 *     1. How few moves carry five disks?
 *        31: the four-disk tower moves twice, and disk 5 once.
 */
export interface Intent {
  /** The `#` heading: the reader's question, which is the page's title. */
  question: string;
  /** Every labelled line, by its label as written (`Reader`, `Answer`, `Changed condition`, …). */
  fields: Record<string, string>;
  /** The `## Check yourself` items: each question, then its answer on the indented lines under it. */
  checks: { question: string; answer: string }[];
}

/** The labels an intent header must have: the answer the scene must state, and what the model is checked against. */
export const REQUIRED = ['Answer', 'Checked against'] as const;

/** The intent in a script's text, or null when it has no `**Answer:**` line. Throws on a header that cannot work. */
export function parseIntent(text: string, where = 'script.md'): Intent | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const fields: Record<string, string> = {};
  let question = '', section = '', last: string | undefined, item: { question: string; answer: string[] } | undefined;
  const items: { question: string; answer: string[] }[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h1 = /^#\s+(.+)$/.exec(line), h2 = /^##\s+(.+)$/.exec(line);
    if (h1 && !question) { question = h1[1]!.trim(); continue; }
    if (h2) { section = h2[1]!.trim().toLowerCase(); last = undefined; continue; }
    const field = /^[-*]\s+\*\*([^*:]+):\*\*\s*(.*)$/.exec(line);
    if (field && !section) { last = field[1]!.trim(); fields[last] = field[2]!.trim(); continue; }
    if (last && !section && /^\s+\S/.test(line)) { fields[last] += ' ' + line.trim(); continue; }
    if (section === 'check yourself') {
      const q = /^\d+\.\s+(.+)$/.exec(line);
      if (q) { item = { question: q[1]!.trim(), answer: [] }; items.push(item); continue; }
      if (item && /^\s+\S/.test(line)) { item.answer.push(line.trim()); continue; }
    }
    if (!line.trim()) last = undefined;
  }
  if (!('Answer' in fields)) return null;
  const missing = REQUIRED.filter((label) => !fields[label]?.trim());
  if (!question) missing.unshift('the # question' as never);
  if (missing.length) throw new Error(`${where}: the intent header has no ${missing.join(', ')}`);
  const checks = items.map((c) => ({ question: c.question, answer: c.answer.join(' ') }));
  for (const c of checks) if (!c.answer) throw new Error(`${where}: check "${c.question}" has no answer under it`);
  return { question, fields, checks };
}

/** What the scene's metadata takes from an intent: its title, answer, checks and what its model is checked against. */
export function intentMeta(intent: Intent): { title: string; answer: string; checks?: Intent['checks']; checkedAgainst: string } {
  return {
    title: intent.question,
    answer: intent.fields['Answer']!.replace(/\.$/, ''),
    ...(intent.checks.length ? { checks: intent.checks } : {}),
    checkedAgainst: intent.fields['Checked against']!,
  };
}

/** The intent of the script beside `sceneFile`, or null when there is no script or it has no intent header. */
export async function readIntent(sceneFile: string): Promise<Intent | null> {
  const file = join(dirname(sceneFile), 'script.md');
  const text = await readFile(file, 'utf8').catch(() => null);
  return text === null ? null : parseIntent(text, file);
}

/**
 * Put the intent into the scene's metadata, so check, describe, build and review read it as they
 * read a scene's own. Each part has one home: a scene that also declares one throws.
 */
export function adoptIntent(Scene: { meta?: Record<string, unknown> }, intent: Intent, where: string): ReturnType<typeof intentMeta> {
  const meta = intentMeta(intent);
  const twice = Object.keys(meta).filter((k) => Scene.meta?.[k] !== undefined);
  if (twice.length) throw new Error(`${where}: ${twice.join(', ')} declared in both script.md and the scene; the script's intent is their one home`);
  Scene.meta = { ...Scene.meta, ...meta };
  return meta;
}
