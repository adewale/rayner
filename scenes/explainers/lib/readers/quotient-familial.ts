import { Group } from '../../../../src/index.ts';
import { impot, euros, partsTexte } from '../quotient-familial.ts';
import { flow, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(revenu: number, enfants: number): ReaderFrame[] {
  const r = impot(revenu, enfants),
    no = impot(revenu, 0);
  return [
    {
      id: 'reader-quotient',
      title: 'Pourquoi diviser le revenu ?',
      line: `Couple marié ou pacsé, ${enfants} enfant${enfants > 1 ? 's' : ''} à charge.`,
      caption: `Pour les revenus 2024, ${euros(revenu)} divisés par ${partsTexte(r.parts)} parts donnent ${euros(r.quotient, 2)} par part. Le barème progressif s’applique à ce quotient ; on multiplie ensuite l’impôt par le nombre de parts. Chaque tranche ne taxe que sa fraction du revenu.`,
      values: { revenu, enfants, parts: r.parts, quotient: r.quotient, brut: r.brut },
      draw: (s) =>
        new Group(
          flow(s, ['Revenu', '÷ parts', 'Barème', '× parts']),
          label(`${euros(revenu)} ÷ ${partsTexte(r.parts)} = ${euros(r.quotient, 2)}`, 0, -1.2, s.palette.ink, 0.7),
          label(`Avant plafonnement : ${euros(r.brut, 2)}`, 0, -2.8, s.palette.ink, 0.7),
        ),
    },
    {
      id: 'reader-cap',
      title: 'Les parts donnent-elles une réduction illimitée ?',
      line: 'Comparer le calcul avec enfants au même couple sans enfant.',
      caption: `Le calcul brut donne ${euros(r.brut, 2)}, contre ${euros(no.brut, 2)} pour le même couple sans enfant. Le plafond ${r.plafonne ? 'limite' : 'ne limite pas'} l’avantage lié aux enfants. Après plafonnement et décote, le modèle obtient ${euros(r.impot)}, avant réductions, crédits et seuil de recouvrement.`,
      values: {
        sansEnfants: r.sansEnfants,
        plafond: r.plafond,
        plafonne: r.plafonne,
        decote: r.decoteGain,
        impot: r.impot,
      },
      draw: (s) =>
        table(
          ['Étape', 'Montant'],
          [
            ['Calcul brut', euros(r.brut, 2)],
            ['Après plafond', euros(r.plafQf, 2)],
            ['Après décote', euros(r.impot)],
          ],
          s,
          { xs: [-3.4, 4.3], y: 2.6, gap: 1.55 },
        ),
    },
  ];
}
