// The motion defect corpus (test/fixtures/motion-corpus/corpus.ts): each entry brings back one motion
// defect that filming the Poppy series found and `rayner check` passed (issue #101, item 14), as a few
// text edits to the current Poppy scenes. This builds each variant on the fly, in a copy of the Poppy
// folders under out/, and runs the keyed motion check alone on it, so the corpus costs the repository a
// few kilobytes of edits rather than a copy of eight explainers per defect.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { keyedMotionLine } from '../../src/internal.ts';
import { loadFonts } from '../../explain/testing.ts';
import { exploreMachines, keyedMotionSink } from '../lib/explain-check.ts';
import { collectProject } from '../lib/explain-project.ts';
import { ROOT } from '../lib/roots.ts';
import type { CorpusEntry, Edit } from '../../test/fixtures/motion-corpus/corpus.ts';

/** The folders a variant copies: every Poppy chapter (they import each other's models) and the shared kit. */
export const POPPY_FOLDERS = ['lib', 'poppy', 'poppy-browser', 'poppy-conversations', 'poppy-coverage', 'poppy-discovery', 'poppy-refusals', 'poppy-sessions', 'poppy-sign-in'] as const;

/** One finding: the scenario's settings, and the line `rayner check` prints for it (`<transition>: <kind>: part “key” …`). */
export interface Found { scenario: string; line: string }

let fonts: ReturnType<typeof loadFonts> | undefined;
/**
 * Every keyed motion finding in the scene at `file`, as `rayner check` would make them, without the
 * check's other gates and without its cap of eight: each play of each scenario's run, and every
 * transition a reader can press from every reachable state; with `events`, only those events'
 * transitions (a subset of the check's findings, so what it catches the check catches).
 */
export async function keyedMotionFindings(file: string, events?: readonly string[]): Promise<Found[]> {
  await (fonts ??= loadFonts());
  const project = await collectProject(file, { write: false });
  const out: Found[] = [];
  for (const v of project.scenarios) {
    const scenario = JSON.stringify(v.values);
    const sink = keyedMotionSink();
    const ran = await new v.Scene(sink).run();
    for (const f of sink.finish()) out.push({ scenario, line: `${f.segment}: ${keyedMotionLine(f)}` });
    for (const m of await exploreMachines(ran, v.Scene, undefined, { events })) for (const line of m.motion) out.push({ scenario, line });
  }
  return out;
}

/** `text` with each edit made; an edit whose `find` is not there exactly once is a corpus entry the scenes have moved past. */
export function applyEdits(text: string, edits: readonly Edit[], where: string): string {
  for (const e of edits) {
    const n = text.split(e.find).length - 1;
    if (n !== 1) throw new Error(`${where}: the corpus edit's text is found ${n} times, not once, so the scene has changed since the entry was written; re-derive it from the current scene:\n${e.find}`);
    text = text.replace(e.find, () => e.replace);
  }
  return text;
}

/** What a variant is built from: an entry, or a chapter with no edits (its baseline). */
export type Variant = Pick<CorpusEntry, 'id' | 'chapter' | 'edits' | 'events'>;
/** The baseline of `chapter`: its scene as it is, which the catalog's gate keeps free of findings. */
export const baseline = (chapter: string): Variant => ({ id: `base-${chapter}`, chapter, edits: [] });

/**
 * Builds a variant: the Poppy folders copied to out/motion-corpus-<id>/ (three levels below the root,
 * as scenes/explainers/<id>/ is, so the scenes' relative imports resolve) with its edits made.
 * Returns the path of the edited chapter's scene.
 */
export async function buildVariant(entry: Variant, root = ROOT): Promise<string> {
  const dir = join(root, 'out', `motion-corpus-${entry.id}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const f of POPPY_FOLDERS) await cp(join(root, 'scenes/explainers', f), join(dir, f), { recursive: true });
  const byFile = new Map<string, Edit[]>();
  for (const e of entry.edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
  for (const [file, edits] of byFile) {
    const path = join(dir, file);
    await writeFile(path, applyEdits(await readFile(path, 'utf8'), edits, `${entry.id}, ${file}`));
  }
  return join(dir, entry.chapter, 'scene.ts');
}

/**
 * A finding's identity across two variants of one scene: its scenario, transition, kind and part,
 * without what was measured (the time, the distance), which an edit elsewhere may shift.
 */
export function findingId(f: Found): string {
  const m = /^(.*?): ([a-z ]+): (?:part “([^”]*)”( \(([^)]*)\))?)?/.exec(f.line);
  return m ? `${f.scenario} | ${m[1]} | ${m[2]} | ${m[5] ?? m[3] ?? ''}` : `${f.scenario} | ${f.line}`;
}

/**
 * What the check makes of one variant: every finding in it, and of those the ones its chapter's
 * baseline does not have (`fresh`): the defect's. The entry is caught when any is fresh.
 */
export interface EntryResult { id: string; caught: boolean; findings: Found[]; fresh: Found[]; ms: number; error?: string }
/** `full`: every event's transitions, as `rayner check`; otherwise only the entry's `events`. */
export async function runEntry(entry: Variant, { full = false, root = ROOT }: { full?: boolean; root?: string } = {}): Promise<EntryResult> {
  const t = Date.now();
  try {
    const file = await buildVariant(entry, root);
    const findings = await keyedMotionFindings(file, full ? undefined : entry.events);
    return { id: entry.id, caught: findings.length > 0, findings, fresh: findings, ms: Date.now() - t };
  } catch (e) {
    return { id: entry.id, caught: false, findings: [], fresh: [], ms: Date.now() - t, error: String((e as Error)?.stack ?? e) };
  } finally {
    await rm(join(root, 'out', `motion-corpus-${entry.id}`), { recursive: true, force: true });
  }
}

/** `result` with the findings its chapter's baseline (run with every event) also has taken out of `fresh`. */
export function againstBaseline(result: EntryResult, base: EntryResult | undefined): EntryResult {
  if (!base) return result;
  const known = new Set(base.findings.map(findingId));
  const fresh = result.findings.filter((f) => !known.has(findingId(f)));
  return { ...result, fresh, caught: !result.error && fresh.length > 0 };
}
