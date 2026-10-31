import { Group, Rectangle } from '../../../../src/index.ts';
import { space, SIZES, percent, bytesOf } from '../ext4-space.ts';
import type { Size } from '../ext4-space.ts';
import { label, bars } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(size: Size, reserve: number): ReaderFrame[] {
  const sp = space(SIZES[size].bytes, reserve),
    old = space(SIZES[size].bytes, 5),
    comparisonReserve = reserve === 5 ? 1 : reserve,
    comparison = space(SIZES[size].bytes, comparisonReserve),
    total = sp.layout.blocks;
  const allocation = [
    { name: 'Metadata', n: sp.layout.metadata },
    { name: 'Kernel reserve', n: sp.kernel },
    { name: 'Root reserve', n: sp.root },
    { name: 'Users can write', n: sp.users },
  ];
  return [
    {
      id: 'reader-allocation',
      title: 'Where did the empty disk’s space go?',
      line: `${SIZES[size].label} ext4 model; ${reserve}% root reserve.`,
      caption:
        'Formatting allocates inode tables, a journal and other metadata before any user file is stored. Reserved blocks remain free, but ordinary users cannot write them. Each segment accounts for its share of 4 KiB blocks under this model’s mkfs defaults.',
      values: { size, reserve, allocation },
      draw: (s) => {
        let x = -7;
        const g = new Group();
        allocation.forEach((a, i) => {
          const w = (a.n / total) * 14;
          if (w > 0)
            g.add(
              new Rectangle({
                width: w,
                height: 1,
                fill: [s.bad, s.soft, s.emphasis, s.good][i]!,
                stroke: s.palette.paper,
                strokeWidth: 0.02,
              }).moveTo([x + w / 2, 1.9]),
            );
          x += w;
          g.add(label(`${a.name}: ${percent(a.n, total)}`, 0, 0.1 - i * 1.15, s.palette.ink, 0.65, `allocation:${i}`));
        });
        return g;
      },
    },
    {
      id: 'reader-reserve',
      title: 'Does reducing reserve remove metadata?',
      line: `Same filesystem size; reserve changes from 5% to ${comparisonReserve}%.`,
      caption: `Reducing reserve from 5% to ${comparisonReserve}% increases ordinary users’ writable space from ${bytesOf(old.users)} to ${bytesOf(comparison.users)}. The ${sp.layout.metadata} metadata blocks stay allocated: changing reserve grants access to free blocks without shrinking inode tables or the journal.`,
      values: { oldUsers: old.users, users: comparison.users, comparisonReserve, metadata: sp.layout.metadata },
      draw: (s) =>
        bars(
          s,
          [
            { label: 'Users at 5% reserve', value: old.users, display: percent(old.users, total) },
            {
              label: `Users at ${comparisonReserve}% reserve`,
              value: comparison.users,
              display: percent(comparison.users, total),
            },
          ],
          total,
        ),
    },
  ];
}
