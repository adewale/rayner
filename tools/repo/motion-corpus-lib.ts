// The motion defect corpus (test/fixtures/motion-corpus/corpus.ts): each entry brings back one motion
// defect that filming the Poppy series found and `rayner check` passed (issue #101, item 14), as a few
// text edits to the current Poppy scenes. This builds each variant on the fly, in a copy of the Poppy
// folders under out/, and checks keyed motion and authored travel rules, so the corpus costs the repository a
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
 * Every keyed motion and authored travel finding in `file`, as `rayner check` would make them, without the
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
    const playback = new v.Scene(sink);
    const ran = await sink.rules.during(playback, () => playback.run());
    for (const line of sink.rules.findings) out.push({scenario, line});
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

function parseFinding(line: string) {
  const contract = /^(.*): motion contract: during "([^"]+)", (.*)$/.exec(line);
  if (contract) return { transition: contract[1]!, kind: 'motion contract', path: contract[2]!, observation: contract[3]!.replace(/ at \+[\d.]+ s$/, '') };
  const m = /^(.*?): ([a-z ]+): part “(.*?)”(?: \((.*?)\))? at [\d.]+ s (.*)$/.exec(line);
  if (!m) return undefined;
  return { transition: m[1]!, kind: m[2]!, path: m[4] ?? m[3]!, observation: m[5]!.split('; fix: ')[0]! };
}

/** A finding's identity across two variants, without its time and changing measurements. */
export function findingId(f: Found): string {
  const item = parseFinding(f.line);
  if (!item) return JSON.stringify([f.scenario, f.line]);
  if (item.kind === 'motion contract') return JSON.stringify([f.scenario, item.transition, item.kind, item.path, item.observation]);
  // Different foreground shapes can hide different words on the same keyed card.
  const subjects = item.kind === 'occluded words' ? item.observation.match(/“[^”]*”/g) : undefined;
  return JSON.stringify([f.scenario, item.transition, item.kind, item.path, subjects]);
}

/** Fresh evidence for entries with a filmed, attributed observation. */
export function attributedFindings(fresh: readonly Found[], expected: NonNullable<CorpusEntry['expectedFinding']>): Found[] {
  return fresh.filter(f => {
    const item = parseFinding(f.line);
    return item && f.scenario === expected.scenario && item.kind === expected.kind && item.path === expected.path &&
      expected.transition.test(item.transition) && expected.subjects.every(name => item.observation.includes(item.kind === 'motion contract' ? `"${name}"` : `“${name}”`)) &&
      (expected.requirement === undefined || item.observation.includes(`must be ${expected.requirement}`));
  });
}

/**
 * What the check makes of one variant: every finding in it, and of those the ones its chapter's
 * baseline does not have (`fresh`). Entries with an expected observation count only
 * matches in `attributed`; the historical metric counts any fresh finding.
 */
export interface EntryResult { id: string; caught: boolean; findings: Found[]; fresh: Found[]; attributed?: Found[]; ms: number; error?: string }
/** `full`: every event's transitions, as `rayner check`; otherwise only the entry's `events`. */
export async function runEntry(entry: Variant, { full = false, root = ROOT }: { full?: boolean; root?: string } = {}): Promise<EntryResult> {
  const t = Date.now();
  try {
    const file = await buildVariant(entry, root);
    const findings = await keyedMotionFindings(file, full ? undefined : entry.events);
    return { id: entry.id, caught: findings.length > 0, findings, fresh: findings, ms: Date.now() - t };
  } catch (e) {
    // Compression defects now reject before a bad frame can be rendered. Count only
    // this exact production duration guard; unrelated build/runtime exceptions remain errors.
    if (e instanceof RangeError && /^machine\.send\(".*"\): authored transition lasts [\d.]+ s but the event allows [\d.]+ s;/.test(e.message)) {
      const findings=[{scenario:'during authored replay',line:`duration guard: ${e.message}`}];
      return {id:entry.id,caught:true,findings,fresh:findings,ms:Date.now()-t};
    }
    return { id: entry.id, caught: false, findings: [], fresh: [], ms: Date.now() - t, error: String((e as Error)?.stack ?? e) };
  } finally {
    await rm(join(root, 'out', `motion-corpus-${entry.id}`), { recursive: true, force: true });
  }
}

/** `result` with the findings its chapter's baseline (run with every event) also has taken out of `fresh`. */
export function againstBaseline(result: EntryResult, base: EntryResult | undefined, expected?: CorpusEntry['expectedFinding']): EntryResult {
  // A failed baseline (including a duration guard that ended its replay early)
  // cannot establish which findings are new. Keep the observations for diagnosis.
  if (base?.error || base?.findings.some(f => f.line.startsWith('duration guard: '))) {
    const why = base.error ?? 'a duration guard stopped its replay';
    return { ...result, fresh: [], caught: false, error: [result.error, `${base.id}: ${why}`].filter(Boolean).join('\n') };
  }
  if (result.error) return { ...result, fresh: [], caught: false };
  const known = new Set(base?.findings.map(findingId));
  const fresh = base ? result.findings.filter(f => !known.has(findingId(f))) : result.findings;
  if (!expected) return { ...result, fresh, caught: fresh.length > 0 };
  const attributed = attributedFindings(fresh, expected);
  return { ...result, fresh, attributed, caught: attributed.length > 0 };
}
