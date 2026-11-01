import { Group, Rectangle } from '../../../../src/index.ts';
import { caseOf, SWAP, BLCKSZ } from '../pg-page.ts';
import type { Column } from '../pg-page.ts';
import { label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(column: Column, fillfactor: number): ReaderFrame[] {
  const a = caseOf(column, fillfactor),
    b = caseOf(SWAP[column], fillfactor),
    color = { header: '#9a9087', padding: '#e8dcc4', data: '#d9480f' };
  return [
    {
      id: 'reader-row',
      title: 'Does doubling an integer double its row?',
      line: 'Headers and padding also take space.',
      caption: `${a.label} stores ${a.tuple.data} data bytes in ${a.tuple.perRow} bytes per row, including its line pointer. ${b.label} stores ${b.tuple.data} in ${b.tuple.perRow}. Header alignment and padding account for the remaining bytes. Each square represents one tuple byte; the four-byte line pointer is counted separately.`,
      values: { column, a: a.tuple, b: b.tuple },
      draw: (s) => {
        const g = new Group();
        [a, b].forEach((c, r) => {
          const y = 1.5 - r * 3;
          g.add(label(`${c.label}: ${c.tuple.perRow} bytes / row`, 0, y + 0.9, s.palette.ink, 0.7));
          c.tuple.bytes.forEach((v, i) => {
            const w = 13 / Math.max(a.tuple.stored, b.tuple.stored);
            g.add(
              new Rectangle({
                width: w * 0.92,
                height: 0.6,
                fill: color[v],
                stroke: s.palette.ink,
                strokeWidth: 0.01,
              }).moveTo([-6.5 + (i + 0.5) * w, y]),
            );
          });
        });
        g.add(label('Grey: header  ·  Pale: padding  ·  Orange: data', 0, -3.5, s.palette.ink, 0.65));
        return g;
      },
    },
    {
      id: 'reader-page',
      title: 'How many rows fit in one page?',
      line: `8192 bytes per page; fillfactor ${fillfactor}.`,
      caption: `At fillfactor ${fillfactor}, one page holds ${a.page.rows} ${a.label} rows or ${b.page.rows} ${b.label} rows. The page header, line pointers and reserved free space reduce that capacity. These results assume non-null values, short text where present and the source build’s alignment.`,
      values: { column, fillfactor, rows: a.page.rows, otherRows: b.page.rows, pages: a.pagesFor10000 },
      draw: (s) =>
        table(
          ['Type', 'Rows/page', '10,000 rows'],
          [
            [a.label, a.page.rows, `${a.pagesFor10000} pages`],
            [b.label, b.page.rows, `${b.pagesFor10000} pages`],
          ],
          s,
          { xs: [-5.1, 0, 5.1], y: 2.3, gap: 1.6 },
        ),
    },
  ];
}
