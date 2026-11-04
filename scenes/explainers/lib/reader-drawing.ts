import { Scene } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { presentFrame } from './lesson-drawing.ts';
export { label, table, tile, flow, bars } from '../../../explain/drawing.ts';
import type {NarrativeFrame} from './lesson-drawing.ts';
export interface ReaderFrame extends NarrativeFrame { values: Record<string, unknown> }
/** A short explanation precedes the detailed program walkthrough in the same
 * scene. Both use the domain model; neither reads values back from captions. */
export async function readerFirst(
  scene: Scene,
  s: Stage,
  frames: readonly ReaderFrame[] | Promise<readonly ReaderFrame[]>,
) {
  for (const frame of await frames) await presentFrame(scene, s, frame, () => {
    scene.state.reader = {...frame.values};
  }, true);
}
