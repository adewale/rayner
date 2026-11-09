import { Group, Rectangle, Text, keyed } from '../../../src/index.ts';
import { euros, pourcent } from './model.ts';

/** The income's euros in each tranche of the barème, on the whole income and by parts (repartition() in the model). */
export interface Tranches { rni: number; tranches: { rate: number; entier: number; parts: number }[] }

/** Each tranche's fill, from 0 % (pale) to 45 % (dark), in the order of the barème. */
const RATE_FILL = ['#efe6d2', '#e3b47c', '#c8582a', '#8f2d1a', '#4d160d'],
  RW = 6.4,
  RX = -RW / 2,
  RH = 0.45,
  TXT = 0.3;

/**
 * One ruler of the income's euros, tranche by tranche, on a scale where the whole income is RW wide, so
 * the two rulers (whole income and by parts) share one scale and differ only in where they are cut. Each
 * segment says its rate inside it and its euros under it, when they fit.
 */
export function drawRegle(st: Tranches, cle: 'entier' | 'parts', titre: string, y: number, { ink, paper }: { ink: string; paper: string }): Group {
  const mot = (t: string, color = ink, bold = false) => new Text(t, { fontSize: TXT, color, weight: bold ? 'bold' : 'normal' });
  const g = new Group(mot(titre, ink, true).moveTo([RX, y + RH + 0.28], [-1, 0]));
  let x = RX;
  st.tranches.forEach((t, k) => {
    const w = (t[cle] / st.rni) * RW;
    if (w <= 0) return;
    const c = [x + w / 2, y + RH / 2] as [number, number];
    g.add(new Rectangle({ width: w, height: RH, fill: RATE_FILL[k]!, stroke: ink, strokeWidth: 0.02 }).moveTo(c));
    const taux = mot(pourcent(t.rate), k >= 2 ? paper : ink);
    if (taux.width() + 0.1 <= w) g.add(taux.moveTo(c));
    const somme = mot(euros(t[cle]));
    if (somme.width() + 0.15 <= w) g.add(somme.moveTo([c[0], y - 0.25]));
    x += w;
  });
  keyed(g, `qf-tranches:${cle}`);
  return g;
}
