// meta.scenarioNavigation 'first' (explain/settings.ts, tools/lib/explain-build.ts, app/embed.ts): a scene
// may start every scenario at its first step. The transcript then links each scenario's first step only, so
// a reader entering from it starts at the beginning; a scene without it links every step. The browser half
// (choosing another option opens its first step, a direct link to a later step still opens that step) is in
// test/browser/explain-embed.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectProject } from '../tools/lib/explain-project.ts';
import { buildExplainer } from '../tools/lib/explain-build.ts';

/** Each transcript section's steps: the step a link opens, or null for a title that links nowhere. */
const transcript = (html: string) => Object.fromEntries([...html.matchAll(/<section data-scenario="([^"]*)">(.*?)<\/section>/g)].map(([, key, body]) => [
  key!,
  [...body!.matchAll(/<li>(?:<a href="([^"]*)">|<span>)/g)].map(([, href]) => (href ? new URLSearchParams(href.replace(/&amp;/g, '&').slice(1)).get('step') : null)),
]));

test('scenarioNavigation first: every scenario is built from its first step, and the transcript links that step only', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-scenario-navigation-'));
  try {
    const project = await collectProject('test/fixtures/scenario-navigation', { write: false });
    assert.equal(project.Scene.meta?.scenarioNavigation, 'first');
    // The step list is the point here: each scenario has the same two steps, the first being where a new scenario opens.
    assert.deepEqual(project.scenarios.map(({ values, trace }) => [values.pick, trace.steps.map((s) => s.step)]),
      [['one', ['question', 'answer']], ['two', ['question', 'answer']], ['three', ['question', 'answer']]]);
    const { html } = await buildExplainer(project, join(folder, 'navigation.html'));
    assert.deepEqual(transcript(html), { 'pick=one': ['question', null], 'pick=two': ['question', null], 'pick=three': ['question', null] });
    // Without it, every step is linked: the fixture is what makes the difference.
    const { html: plain } = await buildExplainer(await collectProject('test/fixtures/reference-steps', { write: false }), join(folder, 'plain.html'));
    const steps = Object.values(transcript(plain));
    assert.ok(steps.length > 1 && steps.every((s) => s.length > 1 && s.every((step) => step !== null)), JSON.stringify(steps));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
