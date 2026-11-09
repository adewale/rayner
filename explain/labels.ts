// Labels, native or imported: a label's words and size, and the size a reader sees it at once
// it is scaled or moved. The diagrams draw their imported labels with ImportedLabel; the player's
// close-ups and the checks read any picture's labels with labelOf and readingLabelSize. A page
// without diagram code still carries this module, and none of explain/diagrams.ts.

import { Group, Text, VMobject } from '../src/index.ts';
import type { Mobject, Vec } from '../src/index.ts';
import { matchingFrameFor, interpolateData } from '../src/mobject.ts';
import { textRun, advanceBox } from '../src/text.ts';
import type { TextShaping } from '../src/text-context.ts';
import { SVG_PX_PER_UNIT } from './diagram-snapshot.ts';
import type { SnapshotShape } from './diagram-snapshot.ts';

/** The words and size of a label: a native Text, or a diagram label imported as outlines. */
export interface LabelInfo {
  text: string;
  fontSize: number;
  /** Original font size per unit of ink height. Use readingLabelSize after transforming a label. */
  emRatio: number;
}
/** A label's words and size, or undefined for a mobject that is not a label. */
export function labelOf(m: Mobject): LabelInfo | undefined {
  if (m instanceof Text) return { text: m.text, fontSize: m[textRun].fontSize, emRatio: m[textRun].fontSize / (m[textRun].ascent + m[textRun].descent) };
  const info = m as Partial<LabelInfo>;
  return typeof info.text === 'string' && info.emRatio ? (info as LabelInfo) : undefined;
}

/** The smaller affine scale: rotation preserves size; squash and shear reduce it. */
function smallestScale(a: number, b: number, c: number, d: number): number {
  const x = a * a + b * b, y = c * c + d * d;
  const largest = Math.sqrt((x + y + Math.hypot(x - y, 2 * (a * c + b * d))) / 2);
  return largest > 0 ? Math.abs(a * d - b * c) / largest : 0;
}

/** A canonical one-em parallelogram, centred on the label. Its point order
 * matches Text's frame indexing, but its dimensions are always one font em. */
function emFrame(center: Vec, a: number, b: number, c: number, d: number): Float32Array {
  const x = center[0] - (a + c) / 2, y = center[1] - (b + d) / 2;
  return new Float32Array([x, y, x + a + c, y + b + d, x + c, y + d, x + a, y + b]);
}
function nativeEmBasis(text: Text): [number, number, number, number] {
  const f = text[advanceBox], height = text[textRun].ascent + text[textRun].descent, size = text[textRun].fontSize;
  if (!(height > 0 && size > 0 && Number.isFinite(height) && Number.isFinite(size))) return [0, 0, 0, 0];
  const c = (f[4]! - f[0]!) / height, d = (f[5]! - f[1]!) / height;
  const a = text[textRun].width > 0 ? (f[6]! - f[0]!) / text[textRun].width : d;
  const b = text[textRun].width > 0 ? (f[7]! - f[1]!) / text[textRun].width : -c;
  return [a * size, b * size, c * size, d * size];
}
/** Imported glyphs have no Text advance box. A separate one-em basis follows
 * affine maps and animation, including captured SVG transforms and forced
 * text widths, without contributing to glyph geometry or any layout bounds. */
export class ImportedLabel extends Group implements LabelInfo {
  text: string;
  fontSize: number;
  emRatio: number;
  private basis: Float32Array = new Float32Array();

  constructor(paths: VMobject[], shape: SnapshotShape, shaping?: TextShaping) {
    super(...paths);
    this.text = shape.text!;
    this.fontSize = shape.fontSize!;
    this.emRatio = this.fontSize / Math.max(0.001, this.height());
    const run = shape.textRun;
    let [a, b, c, d] = [this.fontSize, 0, 0, this.fontSize];
    if (run) {
      const advance = !run.natural && run.width != null ? new Text(run.text, {fontSize: run.size, shaping}).advance() : 0;
      const width = advance ? run.width! / advance : 1;
      // outlineText maps SVG's downward y axis into the scene's upward y axis.
      a = run.matrix[0]! * run.size * width / SVG_PX_PER_UNIT;
      b = -run.matrix[1]! * run.size * width / SVG_PX_PER_UNIT;
      c = -run.matrix[2]! * run.size / SVG_PX_PER_UNIT;
      d = run.matrix[3]! * run.size / SVG_PX_PER_UNIT;
    }
    this.basis = emFrame(this.center(), a, b, c, d);
  }
  override pointArrays(): Float32Array[] { return [this.basis]; }
  override boundingPointArrays(): Float32Array[] { return []; }
  override pointKind(): string { return 'imported-label-basis'; }
  protected override copyData(src: Mobject): void { this.basis = new Float32Array((src as ImportedLabel).basis); }
  /** @internal */
  override [matchingFrameFor](source: Mobject): Mobject {
    if (!(source instanceof Text)) return this;
    if (!(source[textRun].fontSize > 0 && Number.isFinite(source[textRun].fontSize))) return this;
    const p = this.basis, frame = source.copy(), run = source[textRun];
    const width = run.width / run.fontSize, height = (run.ascent + run.descent) / run.fontSize;
    frame[advanceBox] = emFrame(this.center(), (p[6]! - p[0]!) * width, (p[7]! - p[1]!) * width,
      (p[4]! - p[0]!) * height, (p[5]! - p[1]!) * height);
    frame.invalidateBox();
    return frame;
  }
  /** @internal */
  override [interpolateData](a: Mobject, b: Mobject, alpha: number): void {
    super[interpolateData](a, b, alpha);
    if (a instanceof ImportedLabel && (b instanceof ImportedLabel || b instanceof Text)) {
      if (b instanceof Text) {
        // Text's advance frame is a different kind of point data. Only this
        // imported label opts into it; native Text interpolation stays intact.
        const target = emFrame(b.center(), ...nativeEmBasis(b));
        for (let i = 0; i < this.basis.length; i += 2) {
          const from: Vec = [a.basis[i]!, a.basis[i + 1]!], to: Vec = [target[i]!, target[i + 1]!];
          const point = alpha === 0 ? from : alpha === 1 ? to : [from[0] + (to[0] - from[0]) * alpha, from[1] + (to[1] - from[1]) * alpha];
          this.basis[i] = point[0]!; this.basis[i + 1] = point[1]!;
        }
      }
      if (alpha >= 1) {
        const label = labelOf(b)!;
        this.text = label.text; this.fontSize = label.fontSize; this.emRatio = label.emRatio;
      }
    }
  }
  readingSize(): number {
    if (!this.basis.length) return 0;
    const p = this.basis;
    const x = p[6]! - p[0]!, y = p[7]! - p[1]!, z = p[4]! - p[0]!, w = p[5]! - p[1]!;
    return smallestScale(x, y, z, w);
  }
}

/** Conservative font em in world units, for native and imported labels; undefined for other artwork. */
export function readingLabelSize(m: Mobject): number | undefined {
  if (m instanceof ImportedLabel) return m.readingSize();
  if (m instanceof Text) return smallestScale(...nativeEmBasis(m));
  const label = labelOf(m);
  return label ? m.height() * label.emRatio : undefined;
}
