// Node 24 runner. Native SVG/text/trace generation needs no browser.
import { mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { StringSink, renderFrame, renderText, renderElements, toSvgString } from 'rayner/output';
import { traceScene } from 'rayner/testing';
import type { SceneClass } from 'rayner';
import DocumentScene from './document.ts';
import ExtensionScene from './extensions.ts';
import ContinuousScene from './continuous.ts';
import ChoreographyScene from './choreography.ts';
import InvariantScene from './invariants.ts';

export const recipes: Readonly<Record<string, SceneClass>> = {
  document: DocumentScene, extensions: ExtensionScene, continuous: ContinuousScene, choreography: ChoreographyScene,
  invariants: InvariantScene,
};

export async function outputs(SceneClass: SceneClass, frame = 15) {
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError('frame must be a whole number, 0 or more');
  const scene = await renderFrame(SceneClass, frame);
  return {
    svg: toSvgString(scene), text: renderText(scene), elements: renderElements(scene),
    state: scene.stateJson(), trace: await traceScene(SceneClass),
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    out: { type: 'string', default: 'out/recipes' }, scene: { type: 'string' },
    frame: { type: 'string', default: '15' }, step: { type: 'string' }, frames: { type: 'boolean', default: false },
  } });
  const selected = values.scene ? [values.scene] : Object.keys(recipes);
  for (const name of selected) if (!Object.hasOwn(recipes, name)) throw new Error(`Unknown recipe: ${name}`);
  const folder = resolve(values.out!);
  await mkdir(folder, { recursive: true });
  for (const name of selected) {
    const SceneClass = recipes[name]!;
    let frame = Number(values.frame);
    if (values.step) {
      const found = (await traceScene(SceneClass)).steps.find((s) => s.step === values.step);
      if (!found) throw new Error(`Unknown step ${values.step} in ${name}`);
      frame = found.frame1; // the step's resting picture
    }
    const result = await outputs(SceneClass, frame);
    for (const [suffix, body] of Object.entries({
      svg: result.svg, txt: result.text, 'elements.json': JSON.stringify(result.elements, null, 2),
      'trace.json': JSON.stringify(result.trace, null, 2),
    })) await writeFile(join(folder, `${name}.${suffix}`), body + '\n');
    if (values.frames) {
      const sink = new StringSink(); await new SceneClass(sink).run();
      await writeFile(join(folder, `${name}.frames.json`), JSON.stringify(sink.frames));
    }
    console.log(`${name}: SVG, text, elements and trace written to ${folder}`);
  }
}

// Compare real paths: macOS's temporary folders sit behind a symlink (/var -> /private/var), and Node
// runs the module from its real path, so a plain comparison would skip main() and write nothing.
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main();
