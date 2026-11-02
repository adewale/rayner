import type {Catalog as ExportCatalog, CatalogEvidence as ExportEvidence} from './explain-artifacts.ts';
export type {CatalogTotals as ExportTotals, Catalog as ExportCatalog, CatalogEvidence as ExportEvidence} from './explain-artifacts.ts';
// Builds and exports select from the same declared ids; no unrelated page is required.
export function selectedIds(only: string | undefined, known: readonly string[]): string[] {
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
    catalog.version !== 1 ||
    evidence.version !== 2 ||
    catalog.scenes.length !== evidence.scenes.length ||
    catalog.scenes.some(
      (scene, i) => scene.id !== evidence.scenes[i]?.id || scene.cases !== evidence.scenes[i]?.cases.length,
    ) ||
    catalog.totals.explainers !== catalog.scenes.length ||
    catalog.totals.cases !== catalog.scenes.reduce((n, scene) => n + scene.cases, 0) ||
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
    cases: scenes.reduce((n, s) => n + s.cases, 0),
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
