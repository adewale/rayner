import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectProject } from '../../../tools/lib/explain-project.ts';
import { PRINCIPLES, guidelinesIn } from './model.ts';

test('every authored scenario is collected, and the mind map reads as its outline', async () => {
  const project = await collectProject('scenes/explainers/wcag-map', { write: false });
  assert.equal(project.scenarios.length, 12);
  // Step-state fidelity for every scenario lives in fidelity.ts.
  // The description lists a mind map's topics depth first, each principle followed by its own
  // guidelines, rather than alternating between the root's two sides (1.1, 2.1, 1.2, …).
  const v20 = project.scenarios[0]!.trace.steps.find((s) => s.step === 'v20')!;
  const items = (v20.shown!.picture as { entries: { items: string[] }[] }).entries[0]!.items.filter((x) => !x.includes('→'));
  const outline = [
    `WCAG 2.0`,
    ...PRINCIPLES.flatMap((p) => [`${p.num} ${p.name}`, ...guidelinesIn('2.0').filter((g) => g.num.startsWith(p.num + '.')).map((g) => `${g.num} ${g.name}`)]),
  ];
  assert.deepEqual(
    items.map((x) => x.replace(/ · \d+$/, '')),
    outline,
  );
});
