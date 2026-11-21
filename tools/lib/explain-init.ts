import { join } from 'node:path';
import { ROOT } from './roots.ts';
import { packageImports as toPackageImports } from './entry-points.ts';

/** `rayner init` writes the tutorial's explainer (docs/TUTORIAL.md): its script, scene, model and the model's test. */
export const STARTER = join(ROOT, 'scenes/tutorial/lru-mru');
export const STARTER_FILES = ['script.md', 'scene.ts', 'model.ts', 'model.test.ts'] as const;

/**
 * `rayner init --machine` writes a machine explainer (docs/MACHINES.md): its intent script, a model whose
 * `next` refuses events with reasons, the model's test, a scene whose view (picture.ts) draws the state
 * and whose last step is live, and the review's subjects. It passes `rayner check` and `rayner review` as written.
 */
export const MACHINE_STARTER = join(ROOT, 'scenes/tutorial/door');
export const MACHINE_STARTER_FILES = ['script.md', 'scene.ts', 'picture.ts', 'model.ts', 'model.test.ts', 'scene.review.json'] as const;

/** A starter file as an author's project holds it: the repository's engine imports become the package's. */
export const packageImports = (source: string): string => toPackageImports(source);

/**
 * `rayner init --blank` writes the start of an explainer of the author's own: a script whose intent
 * header says on each line what to write, a model stub, a model test whose oracle test fails until it
 * compares the model with something real, and a scene that draws one step from the model's state.
 * Every part still to write says TODO:, and `rayner check` fails with a to-do list until none does
 * (tools/lib/explain-evidence.ts, placeholderTodo). `question`, when given, is the script's `#` heading.
 */
export const BLANK_FILES = ['script.md', 'model.ts', 'model.test.ts', 'scene.ts'] as const;
export function blankStarter(question?: string): Record<(typeof BLANK_FILES)[number], string> {
  if (question !== undefined && (!question.trim() || /[\r\n]/.test(question)))
    throw new TypeError('--question takes the reader\'s question as one line of text, such as --question "Why does [10, 9, 1].sort() give [1, 10, 9]?"');
  return {
    'script.md': `# ${question?.trim() ?? 'TODO: the reader\'s question, as they would ask it; it is the page\'s title'}

- **Reader:** TODO: who asks the question, and what they know or wrongly assume.
- **Answer:** TODO: the one sentence that answers the question; some step must say it.
- **Changed condition:** TODO: the one input a second scenario changes to test the reader's guess, or "none: one scenario" and why.
- **Reader's own work:** TODO: what the reader predicts, presses or answers along the way.
- **Checked against:** TODO: the real system the model is compared with, and where: \`model.test.ts\`.
- **Grounding:** TODO: live, recorded, read or none, then a colon and the system with its version (recorded: Postgres 18.6, run on 2026-10-25).
- **Leaves out:** TODO: what the explainer does not cover, so its last step can say where the claim stops.

## Check yourself

1. TODO: a question a reader can answer after the last step, about a case the steps did not show.
   TODO: its answer, worked out with the model.

## Why this explainer

TODO: why steps explain this better than a still picture or a paragraph. Rayner does not read this section.
`,
    'model.ts': `// The model: the system this explainer is about, as plain TypeScript. It draws nothing, so
// model.test.ts can run it and compare its answers with the real system's, and scene.ts draws what
// it gives. Replace this stub with your system's state and rules.

/** One moment of the system: what the reader watches change. */
export type State = { count: number };

/** Where the system starts. */
export const start = (): State => ({ count: 0 });

/** The state after one event. */
export const next = (state: State): State => ({ count: state.count + 1 });
`,
    'model.test.ts': `import test from 'node:test';
import assert from 'node:assert/strict';

// The oracle test: compare the model with something real, never with itself. Run a reference
// implementation here each time (Grounding: live), compare with published test vectors (read), or
// with answers recorded once from the real system, kept in fixtures/ (recorded). Name what it is in
// script.md's Checked against and Grounding lines. rayner check runs this file first.
//
// For example, with a reference implementation run live:
//   assert.deepEqual(model(input), reference(input));
test('the model agrees with the real system', () => {
  assert.fail('TODO: replace this placeholder with a comparison of the model against something real: a reference implementation run live, published test vectors, or a recorded run of the real system');
});
`,
    'scene.ts': `import { Scene, Text } from 'rayner';
import { stage, view } from 'rayner/explain';
import { start, type State } from './model.ts';

// The scene explains the model: each step sets this.state from the model, and a view draws it.
// This one step shows where the model starts. Write its words, draw the state as a picture of
// your system, and add a step for each change the reader should see.
export default class Explainer extends Scene {
  override state: State = start();

  override async construct() {
    const s = stage(this);
    // A view draws the state. After a step changes this.state, await picture.sync() redraws it.
    const picture = view(this, (st, _shown, drawing) => new Text(\`count: \${st.count}\`, { fontSize: 0.8, color: drawing.look.ink, shaping: drawing.shaping }), { drawing: s.drawing });

    await this.step('start', {
      title: 'TODO: what this picture proves',
      line: 'TODO: where to look',
      caption: 'TODO: what the reader sees, and what follows from it. Some step must say the Answer.',
    });
    await s.enter(picture);
  }
}
`,
  };
}
