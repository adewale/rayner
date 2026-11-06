import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import type { FidelityCheck, Walk } from './lib/fidelity.ts';

// Each explainer's fidelity check lives in its folder (scenes/explainers/<id>/fidelity.ts) and holds every
// authored scenario's steps to the program the explainer explains. This test collects each explainer
// once, checks what every explainer shares, and calls the folder's check for every scenario.
for (const entry of EXPLAINERS)
  test(`${entry.id}: every authored scenario exposes the program's answers at step boundaries`, async () => {
    const file = join(ROOT, 'scenes/explainers', entry.id, 'fidelity.ts');
    assert.ok(existsSync(file), `${entry.id} has no fidelity oracle: compare its step state with the program it explains in scenes/explainers/${entry.id}/fidelity.ts`);
    const { check } = (await import(pathToFileURL(file).href)) as { check: FidelityCheck };
    const project = await collectProject(`scenes/explainers/${entry.id}`, { write: false });
    for (const scenario of project.scenarios) {
      const { values, trace } = scenario,
        last = trace.steps.at(-1)!;
      // Every visible token (including sequence build-ins) names a link in a captured diagram.
      const links = Object.values(project.store)
        .flatMap((s) => s.parts)
        .filter((p) => p.from && p.to);
      const walks = (last.after?.walks ?? []) as Walk[];
      for (const walk of walks)
        assert.ok(
          links.some((p) => p.id === walk.edge && p.from === walk.from && p.to === walk.to),
          `Trace invents link ${walk.from}->${walk.to}`,
        );
      await check(trace, values, { scenario, project, walks });
    }
  });
