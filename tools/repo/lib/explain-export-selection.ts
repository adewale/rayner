import type {Catalog as ExportCatalog, CatalogEvidence as ExportEvidence} from '../../lib/explain-artifacts.ts';
import { EXPLAINERS, SHOWCASE } from '../../../scenes/explainers/catalog.ts';
import { uniquePageIds } from '../../lib/explain-artifacts.ts';
export type {CatalogTotals as ExportTotals, Catalog as ExportCatalog, CatalogEvidence as ExportEvidence} from '../../lib/explain-artifacts.ts';
/** The ids `--only` names, as selectedIds reads them: `showcase` stands for the showcase explainers. */
export const onlyIds = (only: string | undefined): string | undefined => only === 'showcase' ? SHOWCASE.join(',') : only;
/** Whether a selection is the whole collection, which also gets the embed lab. */
export const isWholeCollection = (ids: readonly unknown[]): boolean => ids.length === EXPLAINERS.length;
// Builds and exports select from the same declared ids; no unrelated page is required. The ids
// are page ids in one site, so two that differ only in case are refused (uniquePageIds).
export function selectedIds(only: string | undefined, known: readonly string[]): string[] {
  uniquePageIds(known);
  const requested = only === undefined ? [...known] : only.split(',');
  if (!requested.length || requested.some(id => !id)) throw new Error('--only cannot be empty');
  const seen = new Set<string>();
  for (const id of requested) {
    if (seen.has(id)) throw new Error(`--only has duplicate explainer: ${id}`);
    if (!known.includes(id)) throw new Error(`--only has unknown explainer: ${id}`);
    seen.add(id);
  }
  return requested;
}
export function selectExport(
  only: string | undefined,
  catalog: ExportCatalog,
  evidence: ExportEvidence,
  entry?: string,
) {
  if (
    catalog.version !== 2 ||
    evidence.version !== 2 ||
    catalog.scenes.length !== evidence.scenes.length ||
    catalog.scenes.some(
      (scene, i) => scene.id !== evidence.scenes[i]?.id || scene.scenarios !== evidence.scenes[i]?.scenarios.length,
    ) ||
    catalog.totals.explainers !== catalog.scenes.length ||
    catalog.totals.scenarios !== catalog.scenes.reduce((n, scene) => n + scene.scenarios, 0) ||
    JSON.stringify(catalog.totals) !== JSON.stringify(evidence.totals)
  )
    throw new Error('Catalog and checked evidence mismatch');
  const requested = selectedIds(only, catalog.scenes.map(s => s.id));
  const seen = new Set(requested);
  const entryId = entry ?? (seen.has(catalog.product.entry.id) ? catalog.product.entry.id : requested[0]!);
  if (!seen.has(entryId)) throw new Error(`--entry must name a selected explainer: ${entryId}`);
  const scenes = catalog.scenes.filter((s) => seen.has(s.id));
  const selectedEvidence = evidence.scenes.filter((s) => seen.has(s.id));
  const totals = {
    explainers: scenes.length,
    scenarios: scenes.reduce((n, s) => n + s.scenarios, 0),
    diagrams: selectedEvidence.reduce((n, s) => n + s.diagrams, 0),
    styles: new Set(selectedEvidence.flatMap((s) => s.styles)).size,
    families: new Set(selectedEvidence.flatMap((s) => s.families)).size,
  };
  const first = scenes.find((scene) => scene.id === entryId)!;
  const product = {
    ...catalog.product,
    entry:
      entryId === catalog.product.entry.id
        ? catalog.product.entry
        : {
            id: entryId,
            step: first.entry?.step ?? '',
            settings: first.entry?.settings ?? {},
            label: first.title ?? entryId,
          },
  };
  return {
    ids: scenes.map((s) => s.id),
    catalog: { ...catalog, product, totals, scenes },
    evidence: { ...evidence, totals, scenes: selectedEvidence },
  };
}
/**
 * Refuse a collected scene whose `meta.id` is not the catalog id it is built under: the site
 * writes its page as `<catalog id>.html`, and its description, share pages and receipts name it
 * by `meta.id`, so the two must be one page id.
 */
export function checkPageId(catalogId: string, sceneId: string | undefined): void {
  if (sceneId !== catalogId)
    throw new Error(`site: scenes/explainers/${catalogId} has the meta.id ${JSON.stringify(sceneId)}, but the catalog builds its page as ${JSON.stringify(catalogId + '.html')}; drop the meta.id, or make it the folder's name`);
}
