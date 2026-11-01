import type {TextShaping} from '../../../src/text-context.ts';
// Build-only SVG lowering. Chromium resolves CSS variables, colour-mix and transforms;
// svgpath normalizes curves. Runtime snapshots contain only Lantern cubic points.
import svgpath from 'svgpath';
import type { Page } from 'playwright-core';
import { loadFonts, VMobject } from '../../../src/index.ts';
import type { Style } from '../../../src/index.ts';
import { SVG_PX_PER_UNIT } from '../snapshot.ts';
import type { SnapshotShape, SnapshotTextRun } from '../snapshot.ts';
import { importedFont, importedText, outlineText } from '../text.ts';

interface RawShape {
  owner: number;
  d?: string;
  text?: string;
  x?: number;
  y?: number;
  size?: number;
  anchor?: string;
  baseline?: string;
  width?: number;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  matrix: number[];
  style: Style;
}

export async function readSvg(page: Page, svg: string, natural = false, shaping?: TextShaping): Promise<Map<number, SnapshotShape[]>> {
  await loadFonts();
  await page.setContent(svg);
  const raw = await page.evaluate((natural) => {
    const root = document.querySelector('svg')!;
    const base = root.getCTM()!.inverse();
    const result: RawShape[] = [];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const color = (v: string): string => {
      if (v === 'none') return v;
      if (v.includes('url(')) throw new Error(`Unsupported paint: ${v}`);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 1, 1);
      const c = ctx.getImageData(0, 0, 1, 1).data;
      if (c[3] !== 255) throw new Error(`Alpha colour needs explicit opacity: ${v}`);
      return (
        '#' +
        [...c]
          .slice(0, 3)
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')
      );
    };
    const number = (el: Element, key: string, fallback = 0) => {
      const value = el.getAttribute(key);
      if (value == null) return fallback;
      if (/^-?[\d.]+(?:e[-+]?\d+)?$/i.test(value)) return Number(value);
      if (/^-?[\d.]+em$/.test(value)) return parseFloat(value) * parseFloat(getComputedStyle(el).fontSize);
      if (/^-?[\d.]+px$/.test(value)) return parseFloat(value);
      throw new Error(`Unsupported SVG length ${key}=${value}`);
    };
    const pathOf = (el: Element): string => {
      const n = (s: string, f = 0) => number(el, s, f);
      switch (el.localName) {
        case 'path':
          return el.getAttribute('d') ?? '';
        case 'line':
          return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
        case 'polyline':
        case 'polygon': {
          const nums = (el.getAttribute('points') ?? '').trim().split(/[ ,]+/).map(Number);
          const pairs: string[] = [];
          for (let i = 0; i < nums.length; i += 2) pairs.push(`${nums[i]} ${nums[i + 1]}`);
          return 'M' + pairs.join('L') + (el.localName === 'polygon' ? 'Z' : '');
        }
        case 'rect': {
          const x = n('x'),
            y = n('y'),
            w = n('width'),
            h = n('height');
          const rx = Math.min(n('rx', n('ry')), w / 2),
            ry = Math.min(n('ry', rx), h / 2);
          return rx && ry
            ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
            : `M${x} ${y}h${w}v${h}h${-w}Z`;
        }
        case 'circle':
        case 'ellipse': {
          const x = n('cx'),
            y = n('cy'),
            rx = n('rx', n('r')),
            ry = n('ry', n('r'));
          return `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
        }
        default:
          throw new Error(`Unread SVG element: ${el.localName}`);
      }
    };
    const visit = (el: Element, owner: number, extra?: DOMMatrix, inheritedOpacity = 1): void => {
      const tag = el.localName;
      if (['defs', 'style', 'title', 'desc', 'metadata'].includes(tag)) return;
      if (el.hasAttribute('data-lantern-part')) owner = number(el, 'data-lantern-part');
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      for (const prop of ['filter', 'clip-path', 'mask'] as const)
        if (cs.getPropertyValue(prop) && cs.getPropertyValue(prop) !== 'none')
          throw new Error(`Unsupported ${prop} on ${tag}: refusing to lose artwork`);
      const opacity = inheritedOpacity * Number(cs.opacity);
      if (tag === 'svg' || tag === 'g' || tag === 'a') {
        for (const ch of el.children) visit(ch, owner, extra, opacity);
        return;
      }
      const matrix = extra ?? base.multiply((el as SVGGraphicsElement).getCTM()!);
      const scale = Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
      const style: Style = {
        fill: color(cs.fill),
        stroke: color(cs.stroke),
        strokeWidth: (parseFloat(cs.strokeWidth) * scale) / 100,
        fillOpacity: Number(cs.fillOpacity),
        strokeOpacity: Number(cs.strokeOpacity),
        opacity,
        lineCap: cs.strokeLinecap as 'butt',
        lineJoin: cs.strokeLinejoin as 'round',
        fillRule: cs.fillRule as 'nonzero',
        miterLimit: Number(cs.strokeMiterlimit),
        paintOrder: cs.paintOrder,
        ...(cs.strokeDasharray !== 'none'
          ? {
              dashArray: cs.strokeDasharray
                .split(/[ ,]+/)
                .map((v) => (parseFloat(v) * scale) / 100)
                .join(' '),
              dashOffset: (parseFloat(cs.strokeDashoffset) * scale) / 100,
            }
          : {}),
      };
      const record: RawShape = {
        owner,
        matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
        style,
      };
      if (tag === 'text') {
        if (el.querySelector('tspan')) {
          for (const child of el.children) {
            // Mermaid multiline tspans carry explicit baseline positions.
            const clone = document.createElementNS(root.namespaceURI, 'text');
            for (const attr of el.attributes) clone.setAttribute(attr.name, attr.value);
            for (const attr of child.attributes) clone.setAttribute(attr.name, attr.value);
            clone.textContent = child.textContent;
            el.parentNode!.appendChild(clone);
            visit(clone, owner, matrix, inheritedOpacity);
            clone.remove();
          }
          return;
        }
        result.push({
          ...record,
          text: el.textContent ?? '',
          x: number(el, 'x') + number(el, 'dx'),
          y: number(el, 'y') + number(el, 'dy'),
          size: parseFloat(cs.fontSize),
          anchor: cs.textAnchor,
          ...(cs.dominantBaseline === 'auto' ? {} : { baseline: cs.dominantBaseline }),
          ...(el.hasAttribute('textLength') ? { width: number(el, 'textLength') } : {}),
          ...(natural ? {
            fontFamily: cs.fontFamily,
            fontWeight: Number(cs.fontWeight),
            italic: cs.fontStyle === 'italic',
          } : {}),
        });
        return;
      }
      record.d = pathOf(el);
      result.push(record);
      if (!(el instanceof SVGGeometryElement)) return;
      const length = el.getTotalLength();
      for (const [prop, at] of [
        ['marker-start', 0],
        ['marker-end', length],
      ] as const) {
        const ref = cs.getPropertyValue(prop);
        if (ref === 'none') continue;
        const id = ref.match(/#([^)"]+)/)?.[1];
        const marker = id && (document.getElementById(id) as unknown as SVGMarkerElement);
        if (!marker) throw new Error(`Unread marker ${ref}`);
        const p = el.getPointAtLength(at),
          q = el.getPointAtLength(at === 0 ? Math.min(0.1, length) : Math.max(0, length - 0.1));
        let angle =
          (Math.atan2(at === 0 ? q.y - p.y : p.y - q.y, at === 0 ? q.x - p.x : p.x - q.x) * 180) / Math.PI;
        const orient = marker.getAttribute('orient') ?? '0';
        if (!orient.startsWith('auto')) angle = Number(orient);
        else if (orient === 'auto-start-reverse' && at === 0) angle += 180;
        const unit = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : parseFloat(cs.strokeWidth);
        let m = matrix.translate(p.x, p.y).rotate(angle).scale(unit);
        const vb = marker.viewBox.baseVal;
        if (vb.width)
          m = m
            .scale(marker.markerWidth.baseVal.value / vb.width, marker.markerHeight.baseVal.value / vb.height)
            .translate(-vb.x, -vb.y);
        m = m.translate(-marker.refX.baseVal.value, -marker.refY.baseVal.value);
        for (const ch of marker.children) visit(ch, owner, m, opacity);
      }
      if (cs.markerMid !== 'none') throw new Error('marker-mid is not supported; refusing to drop it');
    };
    visit(root, -1);
    return result;
  }, natural);
  const out = new Map<number, SnapshotShape[]>();
  for (const r of raw) {
    if (r.text != null) {
      const run: SnapshotTextRun = {
        text: r.text,
        x: r.x!,
        y: r.y!,
        size: r.size!,
        anchor: r.anchor,
        ...(r.baseline ? { baseline: r.baseline } : {}),
        matrix: r.matrix,
        ...(r.width != null ? { width: r.width } : {}),
        ...(natural ? {
          natural: true as const,
          font: importedFont(r.fontFamily!),
          ...(r.fontWeight! >= 600 ? { weight: 'bold' as const } : {}),
          ...(r.italic ? { italic: true as const } : {}),
        } : {}),
      };
      if (natural) {
        const advance = importedText(run, undefined, shaping).advance();
        if (run.width === undefined || Math.abs(run.width - advance) > 0.02)
          throw new Error(`Natural diagram metrics do not match the rendered label ${JSON.stringify(run.text)}; this family or font style is not supported`);
      }
      const outlined = outlineText(run, r.style, shaping);
      if (outlined.some((p) => p.subpaths.some((a) => !a.every(Number.isFinite))))
        throw new Error(`Non-finite imported text: ${r.text}`);
      const [a, b, c, d] = r.matrix as [number, number, number, number];
      const shape: SnapshotShape = {
        subpaths: [],
        closed: [],
        style: r.style,
        text: r.text,
        fontSize: (r.size! * Math.sqrt(Math.abs(a * d - b * c))) / SVG_PX_PER_UNIT,
        textRun: run,
      };
      const list = out.get(r.owner) ?? [];
      list.push(shape);
      out.set(r.owner, list);
      continue;
    }
    const path = pathFromSvgD(r.d!, r.style);
    const [a, b, c, d, e, f] = r.matrix.map((v) => v / SVG_PX_PER_UNIT) as [number, number, number, number, number, number];
    path.applyAffine(a, -b, c, -d, e, -f, { aboutPoint: [0, 0] });
    if (path.subpaths.some((p) => !p.every(Number.isFinite))) throw new Error(`Non-finite imported geometry: ${r.d}`);
    const list = out.get(r.owner) ?? [];
    list.push({ subpaths: path.subpaths.map((p) => Array.from(p)), closed: [...path.closed], style: { ...r.style } });
    out.set(r.owner, list);
  }
  return out;
}

/**
 * SVG path data as a Lantern path, in the path's own coordinates. svgpath makes
 * every command absolute and turns arcs and shorthand curves into cubics and
 * quadratics. After a close (Z), a drawing command that is not a move starts a
 * new subpath at the closed one's start point, as SVG specifies.
 */
export function pathFromSvgD(d: string, style: Style = {}): VMobject {
  const mob = new VMobject(style);
  const p = svgpath(d).abs().unarc().unshort();
  if ('err' in p && typeof p.err === 'string' && p.err) throw new Error(p.err);
  let x = 0,
    y = 0,
    closed = false;
  // A drawing command right after Z begins a fresh subpath where the closed one began
  const open = () => {
    if (closed || !mob.subpaths.length) mob.startNewPath([x, y]);
    closed = false;
  };
  p.iterate((seg) => {
    const a = seg as [string, ...number[]];
    switch (a[0]) {
      case 'M':
        x = a[1]!;
        y = a[2]!;
        mob.startNewPath([x, y]);
        closed = false;
        break;
      case 'L':
        open();
        x = a[1]!;
        y = a[2]!;
        mob.addLineTo([x, y]);
        break;
      case 'H':
        open();
        x = a[1]!;
        mob.addLineTo([x, y]);
        break;
      case 'V':
        open();
        y = a[1]!;
        mob.addLineTo([x, y]);
        break;
      case 'C':
        open();
        mob.addCubic([a[1]!, a[2]!], [a[3]!, a[4]!], [a[5]!, a[6]!]);
        x = a[5]!;
        y = a[6]!;
        break;
      case 'Q': {
        open();
        const cx = a[1]!,
          cy = a[2]!,
          nx = a[3]!,
          ny = a[4]!;
        mob.addCubic(
          [x + ((cx - x) * 2) / 3, y + ((cy - y) * 2) / 3],
          [nx + ((cx - nx) * 2) / 3, ny + ((cy - ny) * 2) / 3],
          [nx, ny],
        );
        x = nx;
        y = ny;
        break;
      }
      case 'Z':
        if (!mob.subpaths.length || closed) break;
        mob.closePath();
        {
          const first = mob.subpaths.at(-1)!;
          x = first[0]!;
          y = first[1]!;
        }
        closed = true;
        break;
      default:
        throw new Error(`Unread SVG command ${a[0]}`);
    }
  });
  return mob;
}
