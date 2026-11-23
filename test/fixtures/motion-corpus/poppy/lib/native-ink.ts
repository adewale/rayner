import {renderAsync} from '@resvg/resvg-js';
import {toSvgString} from '../../../src/index.ts';
import type {Mobject, Scene} from '../../../src/index.ts';

/** Native composited contribution, independent of keys and geometry heuristics.
 * Mutations are restored before another frame can run. This is not a movement proof. */
export async function paintedPixels(scene: Scene, subject: Mobject | undefined, width = 358): Promise<number> {
  if (!subject) return 0;
  const draw = () => renderAsync(toSvgString(scene, {width, cull:false}), {font:{loadSystemFonts:false}});
  const actual = (await draw()).pixels;
  const family = subject.family(), opacity = family.map(part => part.style.opacity);
  let absent: Uint8Array;
  try {
    for (const part of family) part.setStyle({opacity:0}, false);
    absent = (await draw()).pixels;
  } finally {for (let n=0;n<family.length;n++) family[n]!.setStyle({opacity:opacity[n]!},false);}
  let count = 0;
  for (let i=0;i<actual.length;i+=4)
    if (Math.max(Math.abs(actual[i]!-absent[i]!),Math.abs(actual[i+1]!-absent[i+1]!),Math.abs(actual[i+2]!-absent[i+2]!)) > 16) count++;
  return count;
}
