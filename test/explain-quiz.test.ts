// `rayner quiz`: the packet a fresh reader answers holds the teaching steps and the questions, never the answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectProject } from '../tools/lib/explain-project.ts';
import { quiz } from '../tools/lib/explain-quiz.ts';

test('the packet shows every step and asks every check question without its answer; the key holds the answers', async () => {
  const project = await collectProject('scenes/tutorial/lru-mru/', { write: false });
  const reuse = project.variants.find((v) => v.values.next === 'reuse')!;
  const { packet, control, key } = await quiz(project, reuse.values, { drawings: false });
  const checks = project.Scene.meta!.checks!;
  for (const s of reuse.trace.steps) {
    assert.ok(packet.includes(String(s.meta.title)), `packet shows ${s.step}'s title`);
    assert.ok(packet.includes(String(s.meta.caption)), `packet shows ${s.step}'s caption`);
  }
  for (const c of checks) {
    assert.ok(packet.includes(c.question), 'packet asks the question');
    assert.ok(!packet.includes(c.answer), 'packet never shows the answer');
  }
  assert.match(packet, /Case shown: After A B C D, request: C D C D/);
  assert.match(packet, /I cannot say/);
  // The control asks the same questions with nothing but the title.
  for (const c of checks) assert.ok(control.includes(c.question));
  for (const s of reuse.trace.steps) assert.ok(!control.includes(String(s.meta.caption)), 'control shows no step');
  assert.deepEqual(key.questions, checks.map((c) => ({ question: c.question, answer: c.answer })));
  assert.equal(key.case, 'After A B C D, request: C D C D');
});

test('a scene without check questions cannot be quizzed', async () => {
  const project = await collectProject('scenes/tutorial/lru-mru/', { write: false });
  const Bare = class extends project.Scene {
    static override meta = { ...project.Scene.meta, checks: undefined };
  };
  await assert.rejects(quiz({ ...project, Scene: Bare }, project.variants[0]!.values, { drawings: false }), /meta.checks/);
});
