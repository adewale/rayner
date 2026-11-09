import {readFile} from 'node:fs/promises';
import { jsonObject } from '../../explain/testing.ts';
import { isIdentifier } from '../../explain/internal.ts';
import type {NarrowOpeningObligation} from './explain-review-plan.ts';

export interface SceneInputs {
  version: '3'; sourceHash: string; files: string; buildHash: string;
}
export interface CatalogTotals { explainers: number; scenarios: number; diagrams: number; styles: number; families: number }
export interface CatalogEntry { id: string; step?: string; settings?: Record<string, string>; label?: string }
export interface SceneEntry { step: string; settings: Record<string, string> }
export interface CatalogProduct {
  entry: CatalogEntry;
  home?: string; summary?: string; audience?: string; description?: string; requirements?: string;
  tutorial?: string; reference?: string; skill?: string;
}
export interface CatalogScene {
  id: string; scenarios: number; title?: string; lang?: string; group?: 'topic' | 'toolchain';
  step?: string; entry?: SceneEntry;
  /** Accepted when reading older catalogs; new catalogs use tier alone. */
  showcase?: boolean;
  /** Where the gallery lists it (scenes/explainers/catalog.ts): showcase cards, the gallery behind "More", or no card for coverage. */
  tier?: 'showcase' | 'gallery' | 'coverage';
}
export interface Catalog { version: 2; product: CatalogProduct; totals: CatalogTotals; scenes: CatalogScene[] }
export interface EvidenceScene {
  id: string; scenarios: Record<string, string>[]; diagrams: number; styles: string[]; families: string[];
  title?: string; lang?: string; entry?: SceneEntry; sourceHash?: string; snapshotHashes?: string[];
  narrowOpenings?: {settings: Record<string, string>; steps: NarrowOpeningObligation[]}[];
}
export interface CatalogEvidence { version: 2; checked: boolean; totals: CatalogTotals; scenes: EvidenceScene[] }

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const stringMap = (value: unknown) => object(value) && Object.values(value).every(v => typeof v === 'string');
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const strings = (value: unknown) => Array.isArray(value) && value.every(v => typeof v === 'string');
const entry = (value: unknown) => object(value) && typeof value.step === 'string' && stringMap(value.settings);
const totals = (value: unknown) => object(value) && ['explainers','scenarios','diagrams','styles','families'].every(key => count(value[key]));

/**
 * Refuse a site whose pages share an id, ignoring case: a site writes each page as `<id>.html`
 * beside the others (with `<id>.png`, `<id>.json` and a folder of share pages), and on a
 * case-insensitive file system or host `Fork.html` is `fork.html`, so one page would replace the other.
 */
export function uniquePageIds(ids: readonly string[]): void {
  const seen = new Map<string, string>();
  for (const id of ids) {
    const folded = id.toLowerCase(), other = seen.get(folded);
    if (other !== undefined)
      throw new Error(other === id
        ? `site: the page id ${JSON.stringify(id)} is listed twice; list each explainer once`
        : `site: the page ids ${JSON.stringify(other)} and ${JSON.stringify(id)} differ only in case, so one page would be written over the other; give one of them another id`);
    seen.set(folded, id);
  }
}

/** Validate serialized producer boundaries once; consumers use the same contracts. */
export function catalog(value: unknown): Catalog {
  const fail = (): never => {throw new Error('catalog(): the catalog artifact does not match its version 2 format; write it again with the site build');};
  if (!object(value) || value.version !== 2 || !totals(value.totals) || !object(value.product) ||
      !object(value.product.entry) || typeof value.product.entry.id !== 'string' || !Array.isArray(value.scenes)) return fail();
  for (const key of ['home','summary','audience','description','requirements','tutorial','reference','skill'])
    if (value.product[key] !== undefined && typeof value.product[key] !== 'string') return fail();
  const opening = value.product.entry;
  if ((opening.step !== undefined && typeof opening.step !== 'string') || (opening.label !== undefined && typeof opening.label !== 'string') ||
      (opening.settings !== undefined && !stringMap(opening.settings))) return fail();
  for (const scene of value.scenes) {
    if (!object(scene) || !isIdentifier('id', scene.id) || !count(scene.scenarios)) return fail();
    if (['title','lang','step'].some(key => scene[key] !== undefined && typeof scene[key] !== 'string') ||
        (scene.group !== undefined && scene.group !== 'topic' && scene.group !== 'toolchain') ||
        (scene.showcase !== undefined && typeof scene.showcase !== 'boolean') ||
        (scene.tier !== undefined && scene.tier !== 'showcase' && scene.tier !== 'gallery' && scene.tier !== 'coverage') || (scene.entry !== undefined && !entry(scene.entry))) return fail();
  }
  try { uniquePageIds(value.scenes.map((scene) => (scene as {id: string}).id)); }
  catch (error) { throw new Error(`catalog(): ${(error as Error).message.replace(/^site: /, '')}`); }
  return value as unknown as Catalog;
}
export function catalogEvidence(value: unknown): CatalogEvidence {
  if (!object(value) || value.version !== 2 || typeof value.checked !== 'boolean' || !totals(value.totals) || !Array.isArray(value.scenes))
    throw new Error('catalogEvidence(): the evidence artifact does not match its version 2 format; write it again with rayner check');
  const ids = new Set<string>();
  for (const scene of value.scenes) {
    if (!object(scene) || !isIdentifier('id', scene.id) || ids.has(scene.id) ||
        !Array.isArray(scene.scenarios) || !scene.scenarios.every(stringMap) || !count(scene.diagrams) || !strings(scene.styles) || !strings(scene.families))
      throw new Error('catalogEvidence(): a scene of the evidence artifact does not match its format; write it again with rayner check');
    ids.add(scene.id);
    if (scene.entry !== undefined && !entry(scene.entry)) throw new Error('catalogEvidence(): a scene\'s entry in the evidence artifact does not match its format; write it again with rayner check');
    if (['title','lang','sourceHash'].some(key => scene[key] !== undefined && typeof scene[key] !== 'string') ||
        (scene.snapshotHashes !== undefined && !strings(scene.snapshotHashes))) throw new Error('catalogEvidence(): a scene\'s metadata in the evidence artifact does not match its format; write it again with rayner check');
    if (scene.narrowOpenings !== undefined) {
      if (!Array.isArray(scene.narrowOpenings)) throw new Error('catalogEvidence(): a scene\'s narrowOpenings in the evidence artifact is not a list; write it again with rayner check');
      for (const opening of scene.narrowOpenings) {
        if (!object(opening) || !stringMap(opening.settings) || !Array.isArray(opening.steps)) throw new Error('catalogEvidence(): a scenario of narrowOpenings in the evidence artifact does not match its format; write it again with rayner check');
        for (const step of opening.steps) {
          if (!object(step) || typeof step.step !== 'string' || typeof step.reviewed !== 'boolean' ||
              (step.reviewed ? !strings(step.targets) || !step.targets.length || !strings(step.labels)
                : step.reason !== 'detail-step' && step.reason !== 'no-opening-subject')) throw new Error('catalogEvidence(): a step of narrowOpenings in the evidence artifact does not match its format; write it again with rayner check');
        }
      }
    }
  }
  return value as unknown as CatalogEvidence;
}
export function sceneInputs(value: unknown): SceneInputs {
  if (!object(value) || value.version !== '3' || !['sourceHash','files','buildHash'].every(key => typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key])))
    throw new Error('sceneInputs(): the scene inputs artifact does not match its version 3 format; write it again with rayner build');
  return value as unknown as SceneInputs;
}
export async function readArtifact<T>(file: string, parse: (value: unknown) => T): Promise<T> {
  // Validate JSON, including non-finite numeric literals, before the artifact's own contract.
  return parse(jsonObject(JSON.parse(await readFile(file, 'utf8')), file));
}
