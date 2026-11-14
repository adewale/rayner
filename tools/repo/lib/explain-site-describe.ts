// What `site:export` publishes for agents: each explainer's describeExplainer object as <id>.json
// beside its page, and one llms.txt at the site root that lists them (https://llmstxt.org), in one
// marked section per exported collection. Lantern's Worker served the same facts at /index.json,
// /trace.json and /text; these are static files.
// demos:build already runs every scene, so it writes the JSON as out/explainers/<id>/describe.json
// and site:export copies it.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describeExplainer } from '../../../explain/describe.ts';
import type { ExplainerDescription } from '../../../explain/describe.ts';
import {sceneInputs as parseSceneInputs} from '../../lib/explain-artifacts.ts';
import { loadScene, sceneInputs } from '../../lib/explain-project.ts';
import type { Project } from '../../lib/explain-project.ts';
import { llmsMarkers, markedSection, replaceSection } from './site-headers.ts';

export interface SiteItem {
  id: string;
  group: 'topic' | 'toolchain';
  /** A coverage-tier explainer keeps its page and JSON but is not listed (scenes/explainers/catalog.ts). */
  tier?: 'showcase' | 'gallery' | 'coverage';
}

const TITLE = '# Rayner explainers';
const GROUPS = { topic: 'Explainers', toolchain: 'How these are made' } as const;

/** What demos:build writes as <id>/describe.json: the explainer as `rayner describe` gives it, drawings included. */
export async function describeProject(project: Project): Promise<string> {
  return JSON.stringify(await describeExplainer(project.Scene, { snapshots: project.store }));
}

/** A file demos:build writes, or an error that says to run it. */
async function readBuilt(file: string): Promise<Buffer> {
  return readFile(file).catch((error: NodeJS.ErrnoException) => {
    throw error.code === 'ENOENT' ? new Error(`Missing ${file}: run npm run demos:build first`) : error;
  });
}

const CHANGED: Record<string, string> = { version: 'the build manifest format', sourceHash: "the scene's code", files: "the scene's folder", buildHash: 'the engine, player, build tools or dependencies' };

/**
 * Throw unless demos:build built the explainer's folder in out/explainers (`folder`) from the scene in
 * `scene` as the checkout has it now (see sceneInputs for what that covers). demos:build records what
 * it built from in <folder>/inputs.json, after the folder's other files and its checks.
 */
export async function checkBuilt(folder: string, scene: string, buildHash?: string): Promise<void> {
  const record = join(folder, 'inputs.json'),
    was = parseSceneInputs(JSON.parse((await readBuilt(record)).toString('utf8'))),
    now = await sceneInputs(await loadScene(scene), buildHash),
    changed = (Object.keys(now) as (keyof typeof now)[]).filter((k) => was[k] !== now[k]);
  if (changed.length)
    throw new Error(`${folder} is stale: ${changed.map((k) => CHANGED[k] ?? k).join(', ')} changed since it was built. Run npm run demos:build`);
}

/** The explainer's opening words: the first sentence of the default scenario's first caption. */
export function summaryOf(d: ExplainerDescription): string {
  const c = d.scenarios.find((c) => d.settings.every((s) => c.values[s.id] === s.default)) ?? d.scenarios[0],
    caption = (c?.steps[0]?.caption ?? '').replace(/\s+/g, ' ').trim();
  return /^.+?[.!?](?=\s+\p{Lu}|$)/u.exec(caption)?.[0] ?? caption;
}

const linkText = (text: string) => text.replace(/[[\]\\]/g, '\\$&');

/** The collection's heading in llms.txt when `--llms-heading` does not name one. */
export const DEFAULT_HEADING: string = GROUPS.topic;

/** The H1, blockquote and line under it that open an llms.txt that site:export creates; a host may edit them. */
export const LLMS_PREAMBLE = [
  TITLE,
  '',
  "> Step-through explainers made with Rayner. Each page has a JSON file beside it, from `describeExplainer`: every scenario and step, with its title, caption, the state the scene recorded, what the step changed, and the resting picture in words and drawn as text.",
  '',
  'Each item links the page, gives the first sentence of its first caption, and links its JSON.',
  '',
].join('\n');

/**
 * One collection's llms.txt section, between llmsMarkers(path): each explainer's page, opening
 * sentence and JSON, by group. Subjects go under `## <heading>`; toolchain lessons under
 * `## How these are made` with the default heading, else `## <heading>: how these are made`.
 * `base` prefixes every link.
 */
export function llmsSection(entries: { item: SiteItem; d: ExplainerDescription }[], base: string, path: string, heading = DEFAULT_HEADING): string {
  const titles = { topic: heading, toolchain: heading === DEFAULT_HEADING ? GROUPS.toolchain : `${heading}: how these are made` };
  const sections = (Object.keys(GROUPS) as SiteItem['group'][])
    .map((group) => {
      const lines = entries
        .filter((e) => e.item.group === group && e.item.tier !== 'coverage')
        .map(({ item: { id }, d }) => `- [${linkText(d.title)}](${base}/${id}): ${summaryOf(d)} JSON: [${id}.json](${base}/${id}.json)`);
      return lines.length ? `## ${titles[group]}\n\n${lines.join('\n')}\n` : '';
    })
    .filter(Boolean);
  return markedSection(llmsMarkers(path), sections.join('\n'));
}

/** llms.txt for one collection alone: the preamble, then the collection's section. `base` prefixes every link. */
export function llmsTxt(entries: { item: SiteItem; d: ExplainerDescription }[], base: string, path = '/projects/rayner', heading?: string): string {
  return LLMS_PREAMBLE + '\n' + llmsSection(entries, base, path, heading);
}

/** The headings of the sections an export wrote before each collection had its own markers. */
const LEGACY_HEADINGS = new Set(Object.values(GROUPS).map((title) => `## ${title}`));

/**
 * The site's llms.txt with the collection at `path` given `section`: the preamble and the section
 * for a new file; otherwise the collection's previous section replaced where it was, or `section`
 * appended, keeping the host's lines and other collections' sections. A file an export wrote before
 * sections were marked (it opens with the H1 and has no markers) first loses its unmarked
 * `## Explainers` and `## How these are made` sections, which each collection's export now writes
 * inside its own markers; the file's other sections stay.
 */
export function mergeLlms(existing: string | null, path: string, section: string): string {
  if (existing == null || !existing.trim()) return LLMS_PREAMBLE + '\n' + section;
  let text = existing;
  if (text.startsWith(TITLE + '\n') && !text.includes('<!-- rayner:begin ')) {
    const kept: string[] = [];
    let skip = false;
    for (const line of text.split('\n')) {
      if (line.startsWith('## ')) skip = LEGACY_HEADINGS.has(line.trimEnd());
      if (!skip) kept.push(line);
    }
    text = kept.join('\n');
  }
  return replaceSection(text, llmsMarkers(path), section);
}

/**
 * Copy each explainer's <built>/<id>/describe.json to <siteRoot><path>/<id>.json, merge the
 * collection's section into <siteRoot>/llms.txt (mergeLlms), and return the JSON's and llms.txt's
 * sizes in bytes, with the section as written. Links are absolute with `origin`, else root-relative.
 */
export async function writeDescriptions(
  siteRoot: string,
  path: string,
  items: readonly SiteItem[],
  built: string,
  origin?: string,
  heading?: string,
): Promise<{ json: number; llms: number; section: string }> {
  const llmsFile = join(siteRoot, 'llms.txt'),
    existing = await readFile(llmsFile, 'utf8').catch(() => null);
  const entries: { item: SiteItem; d: ExplainerDescription }[] = [];
  let json = 0;
  for (const item of items) {
    const file = join(built, item.id, 'describe.json'),
      body = await readBuilt(file),
      d = JSON.parse(body.toString('utf8')) as ExplainerDescription;
    // The bytes demos:build wrote, unchanged.
    await writeFile(join(siteRoot, path, item.id + '.json'), body);
    json += body.byteLength;
    entries.push({ item, d });
  }
  const section = llmsSection(entries, (origin ?? '').replace(/\/$/, '') + path, path, heading);
  const llms = mergeLlms(existing, path, section);
  await writeFile(llmsFile, llms);
  return { json, llms: Buffer.byteLength(llms), section };
}
