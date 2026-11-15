// Drawing helpers for the round-3 method-only pages (round 1's pages carry their own copies).
// Pure functions from numbers and strings to SVG strings; nothing here reads the DOM.
export const W = 400;
export const C = {
  ink: '#1d1d1f',
  soft: '#6e6e73',
  line: '#c7c7cc',
  good: '#2e7d32',
  bad: '#c62828',
  goodFill: '#dcefdc',
  badFill: '#f6d5d5',
  a: '#c9d7f2',
  b: '#f6c17a',
  c: '#b9e0c4',
  d: '#ececec',
  e: '#e4d4f4',
  hi: '#fff4c2',
};
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const svg = (h: number, body: string, label: string) =>
  `<svg viewBox="0 0 ${W} ${Math.ceil(h)}" width="100%" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">${body}</svg>`;
export interface TextOpts {
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: string;
  mono?: boolean;
}
export const text = (x: number, y: number, s: string, o: TextOpts = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 13}" fill="${o.fill ?? C.ink}" text-anchor="${o.anchor ?? 'start'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.mono ? ' font-family="ui-monospace, Menlo, monospace"' : ''}>${esc(s)}</text>`;
export const rect = (x: number, y: number, w: number, h: number, fill: string, o: { stroke?: string; sw?: number; dash?: boolean; rx?: number } = {}) =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${fill}" stroke="${o.stroke ?? C.ink}" stroke-width="${o.sw ?? 1}"${o.rx ? ` rx="${o.rx}"` : ''}${o.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
export const line = (x1: number, y1: number, x2: number, y2: number, o: { stroke?: string; sw?: number; dash?: boolean } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke ?? C.ink}" stroke-width="${o.sw ?? 1}"${o.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
export const swatch = (x: number, y: number, fill: string, label: string) => rect(x, y, 12, 12, fill) + text(x + 16, y + 11, label, { size: 12 });
/** A two-column table of label and value rows, each on a ruled line. */
export function rows(y0: number, list: [string, string][], o: { size?: number; gap?: number } = {}): { body: string; h: number } {
  const gap = o.gap ?? 24;
  let body = '';
  list.forEach(([k, v], i) => {
    const y = y0 + i * gap;
    body += text(8, y, k, { size: o.size ?? 12.5 }) + text(W - 8, y, v, { size: o.size ?? 12.5, anchor: 'end', mono: true });
    body += line(8, y + 7, W - 8, y + 7, { stroke: C.line });
  });
  return { body, h: list.length * gap };
}
/** A horizontal bar chart: label, bar scaled to max, value text. */
export function bars(y0: number, list: { label: string; value: number; text: string; fill: string; heavy?: boolean }[], max: number, o: { labelW?: number; gap?: number } = {}): { body: string; h: number } {
  const lw = o.labelW ?? 130,
    gap = o.gap ?? 26,
    bw = W - lw - 70;
  let body = '';
  list.forEach((b, i) => {
    const y = y0 + i * gap;
    body += text(8, y + 14, b.label, { size: 12.5, weight: b.heavy ? '600' : undefined });
    body += rect(lw, y + 2, (b.value / max) * bw, 16, b.fill, { stroke: b.heavy ? C.ink : C.line, sw: b.heavy ? 2 : 1 });
    body += text(lw + (b.value / max) * bw + 6, y + 15, b.text, { size: 12.5, mono: true });
  });
  return { body, h: list.length * gap };
}
export const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
