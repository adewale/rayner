import assert from 'node:assert/strict';
import test from 'node:test';
import { Mobject, Scene, Text, renderFrame, toSvgString } from '../../../src/index.ts';
import { loadFonts, loadProject, withSettings } from '../../../explain/testing.ts';
import { renderAsync } from '@resvg/resvg-js';
import Sessions from './scene.ts';
import { start, TAMPERS } from './model.ts';

await loadFonts();

// This author-facing test uses only the installed package's public boundaries.
// Native motion, private reader transport and historical poison controls run from
// the chapter's repository fidelity.ts through test/explain-fidelity.test.ts.
test('frame zero starts in the selected Sessions memory policy before the guided story', async () => {
  const project = await loadProject(Sessions, import.meta.dirname);
  assert.deepEqual(project.scenarios.map(s => s.values.company).sort(), ['remembers', 'required']);
  for (const company of ['remembers', 'required'] as const) {
    const Bound = withSettings(Sessions, {company});
    let frames = 0;
    const scene = await renderFrame(Bound, 0, {async frame(actual) {
      assert.equal(actual.frameCount, 0);
      assert.deepEqual(actual.stateJson(), start(company));
      frames++;
    }});
    assert.deepEqual(scene.state, start(company));
    assert.equal(frames, 1);
  }
});

/** Native composited contribution, including all later paint and the actual camera. */
async function painted(scene: Scene, subject: Mobject): Promise<number> {
  const actual = (await renderAsync(toSvgString(scene, {width: 800}), {font: {loadSystemFonts: false}})).pixels;
  const family = subject.family(), opacity = family.map(part => part.style.opacity);
  let absent: Uint8Array;
  try {
    family.forEach(part => part.setStyle({opacity: 0}, false));
    absent = (await renderAsync(toSvgString(scene, {width: 800}), {font: {loadSystemFonts: false}})).pixels;
  } finally { family.forEach((part, i) => part.setStyle({opacity: opacity[i]!}, false)); }
  let ink = 0;
  for (let i = 0; i < actual.length; i += 4)
    if (Math.max(...[0, 1, 2].map(channel => Math.abs(actual[i + channel]! - absent[i + channel]!))) > 16) ink++;
  return ink;
}

async function assertLatePicture(scene: Scene): Promise<void> {
  for (const value of ['00:13:20', '00:15:20', 'Too old', '400', 'invalid_session', 'iat', 'when', 'until 06:00']) {
    const words = scene.familyMembers().filter((part): part is Text => part instanceof Text && part.text === value);
    assert.equal(words.length, 1, `late-copy has one ${value}`);
    assert.ok(await painted(scene, words[0]!) > 0, `late-copy paints ${value}`);
    for (const glyph of words[0]!.children.filter(part => part.hasPoints()))
      assert.ok(await painted(scene, glyph) > 0, `late-copy paints every glyph of ${value}`);
  }
  const tears = scene.familyMembers().filter(part => part.key?.startsWith('tear:'));
  assert.deepEqual(tears.map(part => part.key), ['tear:iat@3'], 'the header time row is the only failed row');
  assert.ok(await painted(scene, tears[0]!) > 0, 'late-copy paints the time-row tear');
}

test('both policies expose a late-copy detail with painted signing time, arrival time and iat failure, keeping eight controls', async () => {
  const project = await loadProject(Sessions, import.meta.dirname);
  assert.equal(project.scenarios.length, 2, 'both memory policies');
  assert.equal(TAMPERS.length, 8, 'the detail adds no phone button');
  assert.equal(TAMPERS.includes('late'), false);
  let pictures = 0, inverse = 0, partial = 0;
  for (const scenario of project.scenarios) {
    const expected = ['stranger', 'address', 'delegation', 'send', 'moved', 'signer', 'clock', 'one-user',
      ...(scenario.values.company === 'remembers' ? ['first-use'] : []), 'late-copy'];
    assert.deepEqual(scenario.trace.steps.map(step => step.step), expected, 'exact authored step inventory');
    const detail = scenario.trace.steps.find(step => step.step === 'late-copy')!;
    assert.equal(detail.meta.kind, 'detail');
    assert.equal(detail.after.last?.tamper, 'late');
    assert.equal(detail.after.last?.verdict.failed, 'time');
    assert.match(detail.after.last!.verdict.answer.reason!, /120 s .* outside the 60 s window/);
    const scene = await renderFrame(scenario.Scene, detail.frame1);
    await assertLatePicture(scene); pictures++;
    // The negative control starts with native visible ink and changes only its paint.
    // A correct model and description cannot hide a missing arrival time.
    const arrival = scene.familyMembers().find((part): part is Text => part instanceof Text && part.text === '00:15:20')!;
    const family = arrival.family(), opacity = family.map(part => part.style.opacity);
    try {
      family.forEach(part => part.setStyle({opacity: 0}, false));
      await assert.rejects(assertLatePicture(scene), /late-copy paints 00:15:20/); inverse++;
    } finally { family.forEach((part, i) => part.setStyle({opacity: opacity[i]!}, false)); }
    await assertLatePicture(scene);
    const signing = scene.familyMembers().find((part): part is Text => part instanceof Text && part.text === '00:13:20')!;
    const digit = signing.children.find(part => part.hasPoints())!, alpha = digit.style.opacity;
    try {
      digit.setStyle({opacity: 0}, false);
      await assert.rejects(assertLatePicture(scene), /late-copy paints every glyph of 00:13:20/); partial++;
    } finally { digit.setStyle({opacity: alpha}, false); }
    await assertLatePicture(scene);
  }
  assert.equal(pictures, 2, 'one exact public step frame per policy');
  assert.equal(inverse, 2, 'both native missing-time controls rejected and restored');
  assert.equal(partial, 2, 'both native partial-time controls rejected and restored');
});
