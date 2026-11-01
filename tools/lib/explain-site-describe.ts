// What `site:export` publishes for agents: each explainer's describeExplainer object as <id>.json
// beside its page, and one llms.txt at the site root that lists them (https://llmstxt.org). Lantern's
// Worker served the same facts at /index.json, /trace.json and /text; these are static files.
// demos:build already runs every scene, so it writes the JSON as out/explainers/<id>/describe.json
// and site:export copies it.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describeExplainer } from '../../explain/describe.ts';
import type { ExplainerDescription } from '../../explain/describe.ts';
import { loadScene, sceneInputs } from './explain-project.ts';
import type { Project } from './explain-project.ts';

export interface SiteItem {
  id: string;
  group: 'topic' | 'toolchain';
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

const CHANGED: Record<string, string> = { version: 'the build manifest format', sourceHash: "the scene's code", engineHash: 'the engine', importer: 'the snapshot importer', files: "the scene's folder", buildHash: 'the player, build tools or dependencies' };

/**
 * Throw unless demos:build built the explainer's folder in out/explainers (`folder`) from the scene in
 * `scene` as the checkout has it now (see sceneInputs for what that covers). demos:build records what
 * it built from in <folder>/inputs.json, after the folder's other files and its checks.
 */
export async function checkBuilt(folder: string, scene: string, buildHash?: string): Promise<void> {
  const record = join(folder, 'inputs.json'),
    was = JSON.parse((await readBuilt(record)).toString('utf8')) as Record<string, string>,
    now = await sceneInputs(await loadScene(scene), buildHash),
    changed = Object.keys(now).filter((k) => was[k] !== now[k]);
  if (changed.length)
    throw new Error(`${folder} is stale: ${changed.map((k) => CHANGED[k] ?? k).join(', ')} changed since it was built. Run npm run demos:build`);
}

/** The explainer's opening words: the first sentence of the default case's first caption. */
export function summaryOf(d: ExplainerDescription): string {
  const c = d.cases.find((c) => d.settings.every((s) => c.values[s.id] === s.default)) ?? d.cases[0],
    caption = (c?.steps[0]?.caption ?? '').replace(/\s+/g, ' ').trim();
  return /^.+?[.!?](?=\s+\p{Lu}|$)/u.exec(caption)?.[0] ?? caption;
}

const linkText = (text: string) => text.replace(/[[\]\\]/g, '\\$&');

/** llms.txt: an H1, a one-line blockquote, then each explainer's page, opening sentence and JSON, by group. `base` prefixes every link. */
export function llmsTxt(entries: { item: SiteItem; d: ExplainerDescription }[], base: string): string {
  const sections = (Object.keys(GROUPS) as SiteItem['group'][])
    .map((group) => {
      const lines = entries
        .filter((e) => e.item.group === group)
        .map(({ item: { id }, d }) => `- [${linkText(d.title)}](${base}/${id}): ${summaryOf(d)} JSON: [${id}.json](${base}/${id}.json)`);
      return lines.length ? `## ${GROUPS[group]}\n\n${lines.join('\n')}\n` : '';
    })
    .filter(Boolean);
  return [
    TITLE,
    '',
    "> Step-through explainers made with Rayner. Each page has a JSON file beside it, from `describeExplainer`: every case and step, with its title, caption, the state the scene recorded, what the step changed, and the resting picture in words and drawn as text.",
    '',
    'Each item links the page, gives the first sentence of its first caption, and links its JSON.',
    '',
    sections.join('\n'),
  ].join('\n');
}

/**
 * Copy each explainer's <built>/<id>/describe.json to <siteRoot><path>/<id>.json, write
 * <siteRoot>/llms.txt, and return their sizes in bytes. Links are absolute with `origin`, else
 * root-relative. An llms.txt that this did not write is the site's own, so it is left alone and the
 * export fails.
 */
export async function writeDescriptions(
  siteRoot: string,
  path: string,
  items: readonly SiteItem[],
  built: string,
  origin?: string,
): Promise<{ json: number; llms: number }> {
  const llmsFile = join(siteRoot, 'llms.txt'),
    existing = await readFile(llmsFile, 'utf8').catch(() => null);
  if (existing != null && !existing.startsWith(TITLE + '\n'))
    throw new Error(`${llmsFile} is not one site:export wrote; merge the explainers into it by hand or remove it`);
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
  const llms = llmsTxt(entries, (origin ?? '').replace(/\/$/, '') + path);
  await writeFile(llmsFile, llms);
  return { json, llms: Buffer.byteLength(llms) };
}
