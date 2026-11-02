import type {TextShaping} from '../../src/text-context.ts';
import { Group, Text } from '../../src/index.ts';
import { ItalicText } from '../../src/italic.ts';
import type { VMobject, Style } from '../../src/index.ts';
import { SVG_PX_PER_UNIT as PX } from './snapshot.ts';
import type { SnapshotTextRun } from './snapshot.ts';


/** SVG styles select a family; the scene's lettering request selects its actual face. */
export function importedFont(family: string, monospace = false): 'sans' | 'mono' {
  const first = family.split(',')[0]!.replace(/["']/g, '').trim();
  return monospace || /mono|share\s*tech/i.test(first) ? 'mono' : 'sans';
}

export function importedText(run: Pick<SnapshotTextRun, 'text' | 'size' | 'font' | 'weight' | 'italic'>, color?: string, shaping?: TextShaping): Text {
  const Type = run.italic ? ItalicText : Text;
  return new Type(run.text, { fontSize: run.size, font: run.font ?? 'sans', weight: run.weight ?? 'normal', color, shaping });
}

/** Shared lowering of a resolved SVG text run to embedded glyph outlines.
 * Store text/placement once, not thousands of repeated font control points. */
export function outlineText(run: SnapshotTextRun, style: Style, shaping?: TextShaping): VMobject[] {
  const text = run.natural ? importedText(run, style.fill, shaping) : new Text(run.text, { fontSize: run.size, color: style.fill, shaping });
  text.build(run.text, run.size, { ...style, strokeWidth: (style.strokeWidth ?? 0) * PX });
  if (!run.natural && run.width != null && text.advance())
    text.stretch(run.width / text.advance(), 0, { aboutPoint: [0, 0] });
  const advance = text.advance();
  let offset = 0;
  switch (run.baseline ?? 'alphabetic') {
    case 'auto':
    case 'alphabetic':
      break;
    case 'middle':
      if (run.natural) {
        const x = importedText({ ...run, text: 'x', size: 1 }, undefined, shaping);
        offset = (new Group(...x.children).height() * run.size) / 2;
      }
      else {
        const xHeightEm = new Text('x', {fontSize: 1, shaping: text.shaping}).children[0]!.height();
        offset = (xHeightEm * run.size) / 2;
      }
      break;
    case 'central':
      offset = (text.run.ascent - text.run.descent) / 2;
      break;
    case 'text-before-edge':
      offset = text.run.ascent;
      break;
    case 'text-after-edge':
      offset = -text.run.descent;
      break;
    default:
      throw new Error(`Unsupported imported text baseline: ${run.baseline}`);
  }
  const baseline = run.y + offset;
  text.shift([
    run.x - (run.anchor === 'middle' ? advance / 2 : run.anchor === 'end' ? advance : 0),
    baseline,
  ]);
  text.applyAffine(1, 0, 0, -1, 0, 2 * baseline, { aboutPoint: [0, 0] });
  const [a, b, c, d, e, f] = run.matrix as [number, number, number, number, number, number];
  for (const path of text.children) {
    path.applyAffine(a / PX, -b / PX, c / PX, -d / PX, e / PX, -f / PX, { aboutPoint: [0, 0] });
    path.style = { ...path.style, ...style };
  }
  return text.children as VMobject[];
}
