// What the fidelity checks of story-driven machines share (the Poppy chapters use it). Such an
// explainer's model names its story: a start, a `next` and the story's events. The explainer's
// steps must rest on the worlds that story reaches, in the story's order, and its picture's words
// must say what the model computed for the world a step rests on.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { isRefusal } from '../../explain/index.ts';
import type { Refusal } from '../../explain/index.ts';
import { pictureWordsAt } from '../../explain/testing.ts';
import type { Trace } from '../../explain/testing.ts';

/** A world as a trace records it: through JSON, so a key holding undefined is absent. */
const recorded = <W>(world: W): unknown => JSON.parse(JSON.stringify(world));

/** The model's worlds along a story: the start, then the world after each event. A refused event fails. */
export function worldsOf<W extends object, E extends string>(start: W, next: (world: W, event: E) => W | Refusal, story: readonly E[]): W[] {
  const worlds = [start];
  for (const event of story) {
    const world = next(worlds.at(-1)!, event);
    assert.ok(!isRefusal(world), `the model refuses the story's ${event}${isRefusal(world) ? `: ${world.reason}` : ''}`);
    worlds.push(world as W);
  }
  return worlds;
}

/** Every HTTP answer inside a value: an object with a numeric status, and its error code if it has one. */
export function answersIn(value: unknown): { status: number; error?: string; reason?: string }[] {
  if (!value || typeof value !== 'object') return [];
  const own = typeof (value as { status?: unknown }).status === 'number' ? [value as { status: number; error?: string; reason?: string }] : [];
  return [...own, ...Object.values(value).flatMap(answersIn)];
}

/**
 * Holds a scenario's steps to the model's story. Each step's state is one of `worlds`, at or after
 * the world the step before it rested on, and the last step rests on the story's last world.
 * Wherever `says` gives words for the world a step rests on, the picture's words there hold each.
 * Steps named in `apart` are off the story (a detail drawn from another history) and are skipped;
 * the chapter checks those itself. Returns how many events each step had played.
 */
export function assertFollowsStory<W extends object>(
  trace: Trace,
  worlds: readonly W[],
  says: (world: W, step: string) => readonly string[] = () => [],
  apart: readonly string[] = [],
): Map<string, number> {
  const played = new Map<string, number>(),
    plain = worlds.map(recorded);
  let at = 0;
  for (const { step, after } of trace.steps) {
    if (apart.includes(step)) continue;
    const found = plain.findIndex((world, i) => i >= at && isDeepStrictEqual(world, after));
    assert.ok(found >= 0, `step "${step}" rests on a state the model's story does not reach after its event ${at}: ${JSON.stringify(after)}`);
    played.set(step, (at = found));
    const words = pictureWordsAt(trace, step).full;
    for (const said of says(worlds[found]!, step)) assert.ok(words.includes(said), `step "${step}": the picture's words lack ${JSON.stringify(said)}\n${words}`);
  }
  assert.equal(at, worlds.length - 1, `the story's last step rests after ${at} of its ${worlds.length - 1} events`);
  return played;
}
