import assert from 'node:assert/strict';
import {liveBase, liveSteps, LiveSink, runLive} from '../../../explain/internal.ts';
import type {FidelityRun} from '../../../test/lib/fidelity.ts';
import {routeInkCheck} from '../lib/route-ink/fidelity.ts';
import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import { STORY, next, start } from './model.ts';

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>, {scenario}: FidelityRun): Promise<void> {
  assertFollowsStory(trace, worldsOf(start(), next, STORY), (world) => answersIn(world.last).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]));
  await documentClearance(scenario);
}

/** Protect both sides of the document corridor, including the held MCP-key caption. */
export async function documentClearance(scenario: FidelityRun['scenario']): Promise<void> {
  const capture = () => {
    const route = routeInkCheck();
    return {route, sink: {async frame(scene: import('../../../src/index.ts').Scene) {
      const labels = ['agent:name','lane:api:name','lane:mcp-api:name','lane:mcp-mcp:name','agent:mcp-key:name']
        .flatMap(key => scene.findAll(key));
      await route.frame(scene,'document',labels);
    }}};
  };
  const story = capture();await new scenario.Scene(story.sink).run();
  story.route.assertClear('authored returned document',['your agent','API']);
  const host = await new scenario.Scene(new LiveSink()).run(), place=liveSteps(host).get('pace');assert.ok(place);
  const {base}=await liveBase(scenario.Scene,'pace',place);assert.ok(base);
  const reader=capture();
  await runLive(scenario.Scene,'pace',place,['old-copy','answer'],{from:base.from,animate:reader.sink});
  reader.route.assertClear('reader returned document',['your agent','API','for MCP']);
}
