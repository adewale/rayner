// The script's answer and check answers, computed from the model: rayner check holds script.md's to these.
import { BAREME, NNBSP, PARAMS, euros, impot, partsTexte, pourcent, tranche } from './model.ts';

const nb = NNBSP,
  deux = `${nb}:`,
  pv = `${nb};`;
const eur2 = (x: number) => euros(x, 2);
const tauxTexte = (q: number) => pourcent(BAREME[2024][tranche(q)]!.rate);
/** The households the check answers compare: the default, one child at 30 000 € and 150 000 €, and no child at 30 000 €. */
export const DEFAUT = impot(65673.88, 1),
  UN30 = impot(30000, 1),
  UN150 = impot(150000, 1),
  BAS = impot(30000, 0),
  PLAT = BAREME[2024][1]!.rate,
  FIN_DECOTE = Math.ceil((PARAMS[2024].decoteSeuil - 0.5) / PARAMS[2024].decoteTaux);

export const answer = () =>
  `Diviser change l’impôt parce que le barème est progressif${deux} chaque part repart du bas du barème, donc moins d’euros atteignent les tranches les plus taxées que sur le revenu entier`;

export const checks = {
  1: () => ({
    question: `Si l’impôt prenait ${pourcent(PLAT)} de chaque euro, sans tranches, un enfant de plus changerait-il l’impôt du couple à ${eur2(65673.88)}${nb}? Pourquoi${nb}?`,
    answer: `Non${deux} ${pourcent(PLAT)} × (${eur2(65673.88)} ÷ ${partsTexte(DEFAUT.parts)}) × ${partsTexte(DEFAUT.parts)} = ${pourcent(PLAT)} × ${eur2(65673.88)} = ${eur2(PLAT * 65673.88)}, quel que soit le nombre de parts. Diviser ne change l’impôt que parce que le taux monte avec le revenu${deux} avec un seul taux, aucune part ne fait redescendre d’euros vers un taux plus bas.`,
  }),
  2: () => ({
    question: `Avec un enfant, l’avantage de la demi-part reste sous le plafond de ${euros(PARAMS[2024].plafond)} à ${euros(30000)} mais le dépasse à ${eur2(65673.88)}. Pourquoi grandit-il avec le revenu, alors que le plafond reste fixe${nb}?`,
    answer: `La demi-part retire des euros du haut du quotient. À ${euros(30000)}, ces euros étaient taxés à ${tauxTexte(30000 / 2)}, et l’avantage vaut ${eur2(UN30.avantage)}. À ${eur2(65673.88)}, le quotient sans enfant, ${eur2(65673.88 / 2)}, atteint la tranche à ${tauxTexte(65673.88 / 2)}${pv} la demi-part le ramène à ${eur2(DEFAUT.quotient)}, dans la tranche à ${tauxTexte(DEFAUT.quotient)}, et l’avantage vaut ${eur2(DEFAUT.avantage)}. Le plafond reprend donc ${eur2(DEFAUT.avantage - DEFAUT.plafond)} ici, et ${eur2(UN150.avantage - UN150.plafond)} à ${euros(150000)}.`,
  }),
  3: () => ({
    question: `À ${euros(30000)} sans enfant, le barème donne ${eur2(BAS.plafQf)} d’impôt, et le couple ne paie rien. Quelle étape annule cet impôt, et l’annulerait-elle s’il valait ${euros(4000)}${nb}?`,
    answer: `La décote${deux} ${euros(PARAMS[2024].decoteSeuil)} − ${pourcent(PARAMS[2024].decoteTaux)} × ${eur2(BAS.plafQf)} = ${euros(BAS.decote)}, plus que l’impôt, qui tombe à 0. Pour ${euros(4000)}, elle vaudrait ${euros(PARAMS[2024].decoteSeuil)} − ${euros(PARAMS[2024].decoteTaux * 4000)}, moins que zéro${deux} elle ne retire plus rien dès ${euros(FIN_DECOTE)} d’impôt.`,
  }),
};
