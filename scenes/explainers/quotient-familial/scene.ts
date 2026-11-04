import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import { impot, bareme, tranche, repartition, BAREME, PARAMS, euros, pourcent, partsTexte, NNBSP } from '../lib/quotient-familial.ts';
import type { Impot } from '../lib/quotient-familial.ts';

// Every rule is read from openfisca-france at tag 176.1.3 (commit 5cc6563); the model in
// ../lib/quotient-familial.ts quotes file and line for each one.
const OF =
  'https://github.com/openfisca/openfisca-france/blob/5cc6563749b88254b479ef89c98099cb9513d6cb/openfisca_france/';
const STYLE = 'pen-and-ink';
const nb = NNBSP;
/** French « » with narrow no-break spaces inside. */
const guillemets = (t: string) => `«${nb}${t}${nb}»`;
/** A French colon, semicolon or question mark takes a narrow no-break space before it. */
const deux = `${nb}:`,
  pv = `${nb};`;
/**
 * Card values are set in JetBrains Mono, which has no U+202F; every space in a monospaced face
 * is one cell wide anyway, so values take the plain no-break space instead.
 */
const mono = (t: string) => t.replace(/\u202f/g, '\u00a0');
const ENFANTS = ['sans enfant', 'un enfant', 'deux enfants', 'trois enfants'];
const eur2 = (x: number) => euros(x, 2);
const tauxTexte = (q: number) => pourcent(BAREME[2024][tranche(q)]!.rate);

/** The script's one-sentence answer, stated in the multiplie step of every case. */
const REPONSE = `Diviser change l’impôt parce que le barème est progressif${deux} chaque part repart du bas du barème, donc moins d’euros atteignent les tranches les plus taxées que sur le revenu entier`;
// The check questions' cases: one child at three incomes, and the childless couple at 30 000 €.
const DEFAUT = impot(65673.88, 1),
  UN30 = impot(30000, 1),
  UN150 = impot(150000, 1),
  BAS = impot(30000, 0),
  PLAT = BAREME[2024][1]!.rate,
  // around(1 470 − 0,4525 × impôt) is 0 once the impôt passes 1 469,5 / 0,4525 = 3 247,51 €.
  FIN_DECOTE = Math.ceil((PARAMS[2024].decoteSeuil - 0.5) / PARAMS[2024].decoteTaux);
if (UN30.plafonne || !DEFAUT.plafonne || !UN150.plafonne)
  throw new Error('The second check assumes the plafond binds at 65 673,88 € and 150 000 € with one child, not at 30 000 €');
if (tranche(65673.88 / 2) !== 2 || tranche(DEFAUT.quotient) !== 1 || tranche(30000 / 2) !== 1)
  throw new Error('The second check assumes the half-part pulls the quotient out of the 30 % tranche at 65 673,88 € only');
if (BAS.impot !== 0 || BAS.decote <= BAS.plafQf || BAS.plafQf === 0 || 4000 <= FIN_DECOTE)
  throw new Error('The third check assumes the décote cancels the childless couple’s tax at 30 000 € and stops before 4 000 €');
const RANG = ['1er enfant', '2e enfant', '3e enfant'];

// The pipeline the steps walk along: ir_brut, ir_ss_qf, ir_plaf_qf, decote and ip_net in ir.py.
// Tighter ranks than Mermaid's default and two-line labels keep its 13 px labels near 18 px on the stage.
const FLOW = [
  '---\nconfig:\n  flowchart:\n    rankSpacing: 24\n    nodeSpacing: 16\n---',
  'graph LR',
  'RNI["Revenu net<br/>imposable"] --> QUOT["÷ parts"]',
  'QUOT --> BAR["Barème"]',
  'BAR --> FOIS["× parts"]',
  'FOIS --> PLAF["Plafonnement"]',
  'RNI --> REF["Sans enfants<br/>2 parts"]',
  'REF --> PLAF',
  'PLAF --> DEC["Décote"]',
  'DEC --> IMP["Impôt"]',
].join('\n');

// bareme.yaml, the four thresholds' 2024-01-01 entries, then with the 2025-01-01 entries commit
// a59104153d added (lines 134–137, 290–293, 448–451, 608–611 at 176.1.3). The first tranche starts at 0 since 1945.
const yaml = (year: 2024 | 2025) =>
  BAREME[2024]
    .slice(1)
    .flatMap((b, i) => [
      '- threshold:',
      '    2024-01-01:',
      `      value: ${b.from}`,
      ...(year === 2025 ? ['    2025-01-01:', `      value: ${BAREME[2025][i + 1]!.from}`] : []),
    ]);

/** A round top for a value axis: 1, 2 or 5 times a power of ten, at least 100. */
const arrondi = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 100)));
  return [1, 2, 5, 10].map((k) => k * p).find((t) => t >= v) ?? 10 * p;
};
/** A bar chart source with a fixed canvas, so its labels keep their size on the stage, and a value axis from 0. */
const chart = (opts: { width: number; height: number; x: string[]; y: string; bars: number[]; line?: number[] }) =>
  `---\nconfig:\n  xyChart:\n    width: ${opts.width}\n    height: ${opts.height}\n---\n` +
  `xychart-beta\n x-axis [${opts.x.map((x) => `"${x}"`).join(', ')}]\n y-axis "${opts.y}" 0 --> ${arrondi(Math.max(...opts.bars, ...(opts.line ?? [])))}\n` +
  ` bar [${opts.bars.map((v) => v.toFixed(2)).join(', ')}]` +
  (opts.line ? `\n line [${opts.line.map((v) => v.toFixed(2)).join(', ')}]` : '');

export default class QuotientFamilialExplainer extends Scene {
  static meta = {
    id: 'quotient-familial',
    title: 'Comment les parts changent-elles l’impôt d’un couple ?',
    lang: 'fr',
    watch: { rni: 'Revenu net imposable', parts: 'Parts', quotient: 'Quotient', impot: 'Impôt' },
    sources: [
      OF + 'parameters/impot_revenu/bareme_ir_depuis_1945/bareme.yaml',
      OF + 'parameters/impot_revenu/calcul_impot_revenu/plaf_qf/plafond_avantages_procures_par_demi_part/general.yaml',
      OF + 'parameters/impot_revenu/calcul_impot_revenu/plaf_qf/decote/seuil_couple.yaml',
      OF + 'parameters/impot_revenu/calcul_impot_revenu/plaf_qf/decote/taux.yaml',
      OF + 'model/prelevements_obligatoires/impot_revenu/ir.py#L1326-L1403',
      OF + 'model/prelevements_obligatoires/impot_revenu/ir.py#L1499-L1554',
      OF + 'model/prelevements_obligatoires/impot_revenu/ir.py#L1615-L1652',
      OF + 'model/prelevements_obligatoires/impot_revenu/ir.py#L3744-L3830',
      'https://github.com/openfisca/openfisca-france/commit/a59104153d67db9c269ad02b57dcefb10206e034',
      'https://github.com/openfisca/openfisca-france/tree/5cc6563749b88254b479ef89c98099cb9513d6cb/tests/leximpact/2024',
    ],
    // La réponse du script (script.md), énoncée par l’étape multiplie dans chaque cas, et trois questions
    // qui demandent d’appliquer le mécanisme à un cas que la scène ne déroule pas.
    answer: REPONSE,
    checks: [
      {
        question: `Si l’impôt prenait ${pourcent(PLAT)} de chaque euro, sans tranches, un enfant de plus changerait-il l’impôt du couple à ${eur2(65673.88)}${nb}? Pourquoi${nb}?`,
        answer: `Non${deux} ${pourcent(PLAT)} × (${eur2(65673.88)} ÷ ${partsTexte(DEFAUT.parts)}) × ${partsTexte(DEFAUT.parts)} = ${pourcent(PLAT)} × ${eur2(65673.88)} = ${eur2(PLAT * 65673.88)}, quel que soit le nombre de parts. Diviser ne change l’impôt que parce que le taux monte avec le revenu${deux} avec un seul taux, aucune part ne fait redescendre d’euros vers un taux plus bas.`,
      },
      {
        question: `Avec un enfant, l’avantage de la demi-part reste sous le plafond de ${euros(PARAMS[2024].plafond)} à ${euros(30000)} mais le dépasse à ${eur2(65673.88)}. Pourquoi grandit-il avec le revenu, alors que le plafond reste fixe${nb}?`,
        answer: `La demi-part retire des euros du haut du quotient. À ${euros(30000)}, ces euros étaient taxés à ${tauxTexte(30000 / 2)}, et l’avantage vaut ${eur2(UN30.avantage)}. À ${eur2(65673.88)}, le quotient sans enfant, ${eur2(65673.88 / 2)}, atteint la tranche à ${tauxTexte(65673.88 / 2)}${pv} la demi-part le ramène à ${eur2(DEFAUT.quotient)}, dans la tranche à ${tauxTexte(DEFAUT.quotient)}, et l’avantage vaut ${eur2(DEFAUT.avantage)}. Le plafond reprend donc ${eur2(DEFAUT.avantage - DEFAUT.plafond)} ici, et ${eur2(UN150.avantage - UN150.plafond)} à ${euros(150000)}.`,
      },
      {
        question: `À ${euros(30000)} sans enfant, le barème donne ${eur2(BAS.plafQf)} d’impôt, et le couple ne paie rien. Quelle étape annule cet impôt, et l’annulerait-elle s’il valait ${euros(4000)}${nb}?`,
        answer: `La décote${deux} ${euros(PARAMS[2024].decoteSeuil)} − ${pourcent(PARAMS[2024].decoteTaux)} × ${eur2(BAS.plafQf)} = ${euros(BAS.decote)}, plus que l’impôt, qui tombe à 0. Pour ${euros(4000)}, elle vaudrait ${euros(PARAMS[2024].decoteSeuil)} − ${euros(PARAMS[2024].decoteTaux * 4000)}, moins que zéro${deux} elle ne retire plus rien dès ${euros(FIN_DECOTE)} d’impôt.`,
      },
    ],
    // The French sentences that reach beyond the case on screen, and the tests that hold them.
    claims: [
      {
        says: 'moins d’euros atteignent les tranches les plus taxées que sur le revenu entier',
        test: 'test/explain-quotient-familial.test.ts: fewer euros reach each tranche',
      },
      { says: 'ne peuvent réduire l’impôt de plus de', test: 'test/explain-quotient-familial.test.ts: each year’s cap bounds' },
    ],
  };
  static settings = [
    {
      id: 'enfants',
      label: 'Enfants à charge',
      default: '1',
      options: [
        { value: '0', label: '0' },
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
      ],
    },
    {
      id: 'revenu',
      label: 'Revenu net imposable',
      default: '65673.88',
      options: [
        { value: '30000', label: euros(30000) },
        { value: '65673.88', label: euros(65673.88, 2) },
        { value: '150000', label: euros(150000) },
      ],
    },
  ];
  override async construct() {
    const values = settingsOf(this),
      enfants = Number(values.enfants),
      rni = Number(values.revenu);
    const r: Impot = impot(rni, enfants),
      tous = [0, 1, 2, 3].map((n) => impot(rni, n)),
      r25 = impot(rni, enfants, 2025);
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    type Rows = Parameters<typeof s.card>[0];
    const card = (rows: Rows, opts: Parameters<typeof s.card>[1]) =>
      s.card(
        rows.map(([label, value]) => [label, mono(String(value))] as const),
        opts,
      );
    const rniTexte = Number.isInteger(rni) ? euros(rni) : eur2(rni);

    // The pipeline sits on top for the first ten steps; each step's picture is below it.
    const TOP = regionBox('top', { bottom: -0.3 }),
      BELOW = regionBox('bottom', { top: -0.5 }),
      LEFT = regionBox(BELOW, { right: 1.2 }),
      RIGHT = regionBox(BELOW, { left: 1.5 });

    // ------------------------------------------------------------- revenu
    await this.step('revenu', {
      title: `Un couple ${enfants ? `avec ${ENFANTS[enfants]}` : 'sans enfant'} déclare ${rniTexte}`,
      line: `Prédire${deux} diviser par des parts puis multiplier, cela change-t-il l’impôt${nb}?`,
      caption: `Un couple marié ou pacsé, ${enfants ? `avec ${ENFANTS[enfants]}` : 'sans enfant'}, déclare ${rniTexte} de revenu net imposable pour 2024. Le calcul divise ce revenu par un nombre de parts, applique le barème au résultat, puis multiplie par ce même nombre. Si l’on finit par multiplier, pourquoi commencer par diviser${nb}? Le schéma s’arrête avant les réductions et crédits d’impôt${pv} il suit les parts, le barème, le plafond et la décote.`,
    });
    await s.clear();
    const flow = await s.show({ source: FLOW }, { box: TOP });
    /** A step's arithmetic, said under the node of the pipeline that does it. */
    const sous = (id: string, texte: string) => {
      const b = flow.get(id).box()!,
        bas = flow.get('REF').box()![1] - 0.4;
      return s.callout(b, texte, { side: 'below', gap: b[1] - bas, size: 0.32, color: s.emphasis });
    };
    await flow.mark(['RNI'], { as: 'étape en cours' });
    await card(
      [
        ['Foyer', 'couple marié ou pacsé'],
        ['Enfants à charge', String(enfants)],
        ['Revenu net imposable', rniTexte],
        ['Revenus de l’année', '2024'],
      ],
      { at: LEFT, title: 'Ce foyer' },
    );
    await card(
      [
        ['Réductions, crédits d’impôt', 'non'],
        ['Seuil de recouvrement de 61 €', 'non'],
        ['Célibataires, veufs, invalidité', 'non'],
      ],
      { at: RIGHT, title: 'Hors du modèle' },
    );
    this.state = { rni, enfants };

    // -------------------------------------------------------------- parts
    await this.step('parts', {
      title: `Ce revenu fait vivre ${2 + enfants} personnes${deux} ${partsTexte(r.parts)} parts`,
      line: !enfants
        ? 'Le couple compte 2 parts et aucun enfant n’en ajoute.'
        : `Le couple compte 2 parts, ${enfants > 1 ? 'les enfants' : 'l’enfant'} ${RANG.slice(0, enfants)
            .map((_, i) => (i < 2 ? '0,5' : '1'))
            .join(' + ')}.`,
      caption:
        `Les parts comptent les personnes qui vivent de ce revenu. Le couple compte pour deux parts. Les deux premiers enfants à charge ajoutent une demi-part chacun, et chaque enfant à partir du troisième une part entière. ` +
        (enfants
          ? `Avec ${ENFANTS[enfants]}, ce foyer a ${partsTexte(r.parts)} parts.`
          : 'Sans enfant, ce foyer en reste à deux parts.') +
        ` Ce nombre sert deux fois${deux} on divise le revenu par lui, puis on multiplie l’impôt par lui.`,
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.mark(['QUOT'], { as: 'étape en cours' });
    await sous(
      'QUOT',
      [`2 pour le couple`, ...RANG.slice(0, enfants).map((_, i) => (i < 2 ? '0,5' : '1'))].join(' + ') +
        ` = ${partsTexte(r.parts)} parts`,
    );
    this.state.parts = r.parts;

    // ----------------------------------------------------------- quotient
    await this.step('quotient', {
      title: `Le quotient${deux} ${eur2(r.quotient)} par part`,
      line: `${rniTexte} ÷ ${partsTexte(r.parts)} parts${deux} le barème s’applique à une seule part.`,
      caption: `Le barème s’applique au revenu d’une seule part, le quotient${deux} ${rniTexte} ÷ ${partsTexte(r.parts)} = ${eur2(r.quotient)}. Plus le foyer a de parts, plus ce quotient est bas, et plus il reste dans les tranches du bas.`,
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.walk([['RNI', 'QUOT']], { trail: true });
    await sous('QUOT', `${rniTexte} ÷ ${partsTexte(r.parts)} = ${eur2(r.quotient)}`);
    this.state.quotient = r.quotient;

    // ------------------------------------------------------------ barème
    const b = bareme(r.quotient),
      TRANCHES = BAREME[2024].map((x) => pourcent(x.rate)),
      reached = b.slices.filter((x) => x.base > 0),
      top = reached.at(-1)!,
      moyen = r.parPart / r.quotient;
    await this.step('bareme', {
      title:
        top.rate > 0
          ? `Une part paie ${eur2(b.total)}, tranche par tranche`
          : `Un quotient sous ${euros(BAREME[2024][1]!.from)} ne paie rien`,
      line:
        top.rate > 0
          ? `Seuls ${eur2(top.base)} dépassent ${euros(top.from)} et paient ${pourcent(top.rate)}${pv} taux moyen ${pourcent(moyen, 1)}.`
          : `Ce quotient de ${eur2(r.quotient)} reste dans la tranche à ${pourcent(top.rate)}.`,
      caption:
        top.rate > 0
          ? `Le barème découpe le quotient en tranches, et chaque taux ne frappe que les euros de sa tranche. Ce quotient atteint la tranche à ${pourcent(top.rate)}, mais seuls ses ${eur2(top.base)} au-dessus de ${euros(top.from)} y sont taxés${deux} ${guillemets(`passer dans la tranche à ${pourcent(top.rate)}`)} ne change rien aux euros d’en dessous. Chaque barre est l’impôt d’une tranche${pv} leur somme, ${eur2(b.total)}, vaut ${pourcent(moyen, 1)} du quotient${deux} c’est le taux moyen d’une part.`
          : `Le barème découpe le quotient en tranches, et chaque taux ne frappe que les euros de sa tranche. Ce quotient de ${eur2(r.quotient)} reste dans la première, taxée à 0${nb}%. Aucune barre ne monte et l’impôt d’une part est nul${pv} les parts des enfants ont fait descendre le quotient sous ${euros(BAREME[2024][1]!.from)}.`,
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.walk([['QUOT', 'BAR']], { trail: true });
    const bars = await s.show(
      {
        source: chart({
          width: 540,
          height: 210,
          x: TRANCHES,
          y: 'Impôt sur une part (€)',
          bars: b.slices.map((x) => x.tax),
        }),
      },
      { box: BELOW },
    );
    // Each tranche the quotient reaches says its tax over its own bar.
    for (const x of reached)
      await s.callout(bars.get(`bar:0:${pourcent(x.rate)}`), eur2(x.tax), { side: 'above', gap: 0.2, size: 0.26 });
    // The quotient's top tranche, not the household's taux marginal: when the plafond binds, OpenFisca's
    // ir_taux_marginal is the two-part calculation's, which can be higher.
    await bars.mark([`bar:0:${pourcent(top.rate)}`], { as: 'dernière tranche du quotient' });
    this.state.parPart = r.parPart;
    this.state.tranche = top.rate;
    this.state.tauxMoyenPart = moyen;

    // --------------------------------------------------------- tranches: the same euros, whole and by parts
    const rep = repartition(rni, enfants),
      haut = tranche(rni),
      tHaut = pourcent(BAREME[2024][haut]!.rate),
      wHaut = rep[haut]!.entier,
      pHaut = rep[haut]!.parts;
    await this.step('tranches', {
      title: pHaut > 0 ? `Par parts, ${euros(pHaut)} atteignent la tranche à ${tHaut}, contre ${euros(wHaut)}` : `Par parts, aucun euro n’atteint la tranche à ${tHaut}`,
      line: `Les deux barres font ${rniTexte}${deux} en haut le revenu entier, en bas les ${partsTexte(r.parts)} parts.`,
      caption:
        `Les deux barres contiennent les mêmes ${rniTexte}, rangés par tranche du barème. En haut, le barème s’applique au revenu entier${deux} ${eur2(wHaut)} dépassent ${euros(BAREME[2024][haut]!.from)} et tombent dans la tranche à ${tHaut}. ` +
        `En bas, il s’applique à chacune des ${partsTexte(r.parts)} parts${deux} chaque quotient de ${eur2(r.quotient)} repart du bas du barème, et ${pHaut > 0 ? `${eur2(pHaut)} seulement atteignent la tranche à ${tHaut}` : `aucun euro n’atteint la tranche à ${tHaut}`}. ` +
        `Les euros qui manquent en haut descendent dans les tranches moins taxées${deux} ${eur2(rep[0]!.parts)} à 0${nb}% au lieu de ${eur2(rep[0]!.entier)}.`,
    });
    await s.clearOverlays();
    await bars.hide();
    await flow.unmark();
    // Two rulers on one scale of euros, each cut at the barème's thresholds and coloured by rate.
    const RATE_FILL = ['#efe6d2', '#e3b47c', '#c8582a', '#8f2d1a', '#4d160d'],
      RW = 6.4,
      RX = -RW / 2,
      RH = 0.45,
      TXT = 0.3;
    const mot = (t: string, color = s.palette.ink, bold = false) => new Text(t, { fontSize: TXT, color, weight: bold ? 'bold' : 'normal' });
    const regle = (cle: 'entier' | 'parts', titre: string, y: number) => {
      const g = new Group(mot(titre, s.palette.ink, true).moveTo([RX, y + RH + 0.28], [-1, 0]));
      let x = RX;
      rep.forEach((t, k) => {
        const w = (t[cle] / rni) * RW;
        if (w <= 0) return;
        const c = [x + w / 2, y + RH / 2] as [number, number];
        g.add(new Rectangle({ width: w, height: RH, fill: RATE_FILL[k]!, stroke: s.palette.ink, strokeWidth: 0.02 }).moveTo(c));
        const taux = mot(pourcent(t.rate), k >= 2 ? s.palette.paper : s.palette.ink);
        if (taux.width() + 0.1 <= w) g.add(taux.moveTo(c));
        const somme = mot(euros(t[cle]));
        if (somme.width() + 0.15 <= w) g.add(somme.moveTo([c[0], y - 0.25]));
        x += w;
      });
      g.key = `qf-tranches:${cle}`;
      return g;
    };
    const regles = [
      regle('entier', `Revenu entier, ${rniTexte}`, -1.5),
      regle('parts', `Par parts, ${partsTexte(r.parts)} × ${eur2(r.quotient)}`, -2.95),
    ];
    const ligne = (cle: 'entier' | 'parts') =>
      rep
        .filter((t) => t[cle] > 0)
        .map((t) => `${eur2(t[cle])} à ${pourcent(t.rate)}`)
        .join(', ');
    await s.enter(...regles, {
      describe: () =>
        `Deux barres de ${rniTexte} à la même échelle, coupées par tranche du barème${deux} revenu entier, ${ligne('entier')}${pv} par parts, ${ligne('parts')}.`,
    });
    s.reading(...regles);
    this.state.tranches = rep;

    // --------------------------------------------------------- multiplie
    const gros = bareme(rni),
      enGros = gros.total;
    await this.step('multiplie', {
      title: `Réponse${deux} ${euros(r.brut)} par parts, ${euros(enGros)} sur le revenu entier`,
      line: `Barres${deux} ${partsTexte(r.parts)} × l’impôt d’une part, par tranche${pv} ligne${deux} le barème sur le revenu entier.`,
      caption: `${REPONSE}. Sur le revenu entier, ${rniTexte} monte jusqu’à la tranche à ${tauxTexte(rni)} et paierait ${eur2(enGros)}${deux} c’est la ligne. Par parts, chaque quotient de ${eur2(r.quotient)} s’arrête à la tranche à ${tauxTexte(r.quotient)}, et ${eur2(r.parPart)} × ${partsTexte(r.parts)} = ${eur2(r.brut)}${deux} ce sont les barres.`,
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.dim(['RNI', 'QUOT', 'BAR', 'FOIS']);
    await flow.walk([['BAR', 'FOIS']], { trail: true });
    await sous('FOIS', `${eur2(r.parPart)} × ${partsTexte(r.parts)} = ${eur2(r.brut)}`);
    // Tranche by tranche: the parts' tax (bars) against the barème on the whole income (line).
    const entier = await s.show(
      {
        source: chart({
          width: 540,
          height: 210,
          x: TRANCHES,
          y: 'Parts (barres), entier (ligne), €',
          bars: b.slices.map((x) => x.tax * r.parts),
          line: gros.slices.map((x) => x.tax),
        }),
      },
      { box: BELOW, build: 'frame' },
    );
    // The y-axis title names the bars and the line, so the renderer's legend stays out.
    await entier.reveal(entier.order.filter((id) => id !== 'legend' && !entier.visible.has(id)));
    this.state.brut = r.brut;

    // --------------------------------------------------------- reference
    await this.step('reference', {
      title: enfants
        ? `Sans enfants, ce revenu paierait ${euros(r.sansEnfants)}`
        : 'Sans enfant, la référence est ce calcul',
      line: enfants
        ? `2 × barème(${eur2(rni / 2)})${pv} l’écart de ${eur2(r.avantage)} vient des enfants.`
        : `Les deux calculs donnent ${eur2(r.sansEnfants)}${pv} l’écart est nul.`,
      caption: enfants
        ? `Pour mesurer l’avantage des enfants, on compare au même revenu pour un couple sans enfant, sur deux parts. L’écart entre les deux impôts est le gain apporté par les parts supplémentaires. C’est ce gain que le plafond va limiter.`
        : `La référence est le même revenu pour un couple sur deux parts. Sans enfant, ce foyer a déjà deux parts${deux} les deux calculs sont identiques et l’avantage des enfants est nul.`,
    });
    await s.clearOverlays();
    await entier.hide();
    await flow.dim(['RNI', 'REF', 'QUOT', 'BAR', 'FOIS', 'PLAF']);
    await flow.walk([['RNI', 'REF']], { trail: true });
    await card(
      [
        ['Impôt sur 2 parts (sans enfants)', eur2(r.sansEnfants)],
        [`Impôt sur ${partsTexte(r.parts)} parts`, eur2(r.brut)],
        ['Avantage des enfants', eur2(r.avantage)],
      ],
      { at: regionBox(BELOW, { left: -3.8, right: 3.8 }) },
    ).then((c) => c.mark('Avantage des enfants'));
    this.state.sansEnfants = r.sansEnfants;
    this.state.avantage = r.avantage;

    // ----------------------------------------------------------- plafond
    const lies = tous.filter((t) => t.plafonne).map((t) => t.enfants);
    const liesTexte = !lies.length
      ? 'Pour ce revenu, aucune barre ne dépasse la ligne.'
      : `Pour ce revenu, la barre dépasse la ligne avec ${lies.join(', ').replace(/, (\d)$/, ' et $1')} enfant${lies.length > 1 || lies[0]! > 1 ? 's' : ''}.`;
    const plafondTexte = euros(PARAMS[2024].plafond);
    await this.step('plafond', {
      title: !enfants
        ? 'Sans enfant, le plafond n’a rien à reprendre'
        : r.plafonne
          ? `Le plafond reprend ${eur2(r.avantage - r.plafond)}`
          : `L’avantage reste sous le plafond de ${euros(r.plafond)}`,
      line: !enfants
        ? 'Les barres sont l’avantage des enfants, la ligne est le plafond.'
        : r.plafonne
          ? `${eur2(r.sansEnfants)} − ${euros(r.plafond)} = ${eur2(r.plafQf)} d’impôt retenu.`
          : `Plafond${deux} ${r.demiParts} demi-part${r.demiParts > 1 ? 's' : ''} × ${plafondTexte}${pv} l’impôt reste ${eur2(r.brut)}.`,
      caption:
        `Les enfants ne peuvent réduire l’impôt de plus de ${plafondTexte} pour chaque demi-part ajoutée aux deux parts du couple. Les barres sont l’avantage des enfants, la ligne est ce plafond. ${liesTexte}` +
        (!enfants
          ? ''
          : ' ' +
            (r.plafonne
              ? `Ici l’impôt retenu est ${eur2(r.sansEnfants)} − ${euros(r.plafond)} = ${eur2(r.plafQf)}.`
              : `Ici l’impôt sur ${partsTexte(r.parts)} parts, ${eur2(r.brut)}, est retenu.`)),
    });
    await s.clearOverlays();
    await flow.dim(['REF', 'FOIS', 'PLAF']);
    await flow.walk(
      [
        ['FOIS', 'PLAF'],
        ['REF', 'PLAF'],
      ],
      { parallel: true, trail: true },
    );
    const COUNTS = ['0 enfant', '1 enfant', '2 enfants', '3 enfants'];
    const cap = await s.show(
      {
        source: chart({
          width: 540,
          height: 210,
          x: COUNTS,
          y: 'Avantage (barres), plafond (ligne), €',
          bars: tous.map((t) => t.avantage),
          line: tous.map((t) => t.plafond),
        }),
      },
      { box: LEFT, build: 'frame' },
    );
    // The y-axis title names the bars and the line, so the renderer's legend ("Bar 1", "Line 1") stays out.
    await cap.reveal(cap.order.filter((id) => id !== 'legend' && !cap.visible.has(id)));
    await cap.mark([`bar:0:${COUNTS[enfants]}`], { as: 'ce foyer' });
    await card(
      [
        [`Plafond (${r.demiParts} demi-part${r.demiParts > 1 ? 's' : ''} × ${plafondTexte})`, euros(r.plafond)],
        ['Avantage des enfants', eur2(r.avantage)],
        ['Impôt après plafonnement', eur2(r.plafQf)],
      ],
      { at: RIGHT },
    ).then((c) => c.mark('Impôt après plafonnement'));
    this.state.plafond = r.plafond;
    this.state.plafonne = r.plafonne;
    this.state.plafQf = r.plafQf;

    // ------------------------------------------------------------ décote
    const seuil = PARAMS[2024].decoteSeuil,
      taux = PARAMS[2024].decoteTaux,
      fin = FIN_DECOTE;
    await this.step('decote', {
      title:
        r.plafQf === 0
          ? 'Pas d’impôt, rien à décoter'
          : r.decoteGain > 0 && r.impot === 0
            ? 'La décote annule l’impôt'
            : r.decoteGain > 0
              ? `La décote retire ${euros(r.decoteGain)}${deux} impôt ${euros(r.impot)}`
              : `Pas de décote${deux} impôt ${euros(r.impot)}`,
      line: `Décote${deux} ${euros(seuil)} − ${pourcent(taux)} de l’impôt, nulle dès ${euros(fin)}.`,
      caption: `La décote allège les petits impôts${deux} ${euros(seuil)} moins ${pourcent(taux)} de l’impôt, sans dépasser l’impôt lui-même. Elle vaut zéro dès ${euros(fin)} d’impôt. ${
        r.plafQf === 0
          ? 'Ici l’impôt est déjà nul.'
          : r.decoteGain > 0
            ? `Ici elle retire ${euros(r.decoteGain)}, et l’impôt est de ${euros(r.impot)}.`
            : `Ici l’impôt de ${eur2(r.plafQf)} est au-dessus${deux} il reste ${euros(r.impot)}.`
      } Le tableau donne l’impôt de ce revenu pour chaque nombre d’enfants.`,
    });
    await s.clearOverlays();
    await cap.hide();
    await flow.dim(['PLAF', 'DEC', 'IMP']);
    await flow.walk(
      [
        ['PLAF', 'DEC'],
        ['DEC', 'IMP'],
      ],
      { trail: true },
    );
    await card(
      [
        ['Impôt après plafonnement', eur2(r.plafQf)],
        ['Décote', '− ' + euros(r.decoteGain)],
        ['Impôt', euros(r.impot)],
        ['Part du revenu', pourcent(r.tauxMoyen, 1)],
      ],
      { at: LEFT, title: 'Ce foyer' },
    ).then((c) => c.mark('Impôt'));
    await card(
      tous.map((t) => [COUNTS[t.enfants]!, euros(t.impot)] as const),
      { at: RIGHT, title: `Impôt, revenu de ${rniTexte}` },
    ).then((c) => c.mark(COUNTS[enfants]!, { as: 'ce foyer' }));
    this.state.decote = r.decoteGain;
    this.state.impot = r.impot;
    this.state.parEnfants = tous.map((t) => t.impot);

    // ----------------------------------------------------- revenus 2025
    // Each threshold rises by 0,896 % to 0,901 %; the title names the rounded figure only if all four share it.
    const hausses = [1, 2, 3, 4].map((i) => pourcent(BAREME[2025][i]!.from / BAREME[2024][i]!.from - 1, 1)),
      hausse = hausses.every((h) => h === hausses[0]) ? hausses[0]! : `${hausses[0]} à ${hausses.at(-1)}`;
    await this.step('revenus-2025', {
      kind: 'detail',
      title: `Pour les revenus 2025, les seuils montent de ${hausse}`,
      line:
        r25.impot === r.impot
          ? `Taux inchangés${pv} ce foyer paierait le même impôt, ${euros(r.impot)}.`
          : `Taux inchangés${pv} ce foyer paierait ${euros(r25.impot)} au lieu de ${euros(r.impot)}.`,
      caption: `Pour les revenus 2025, les seuils du barème montent mais les taux ne changent pas. Le fichier du barème ajoute à chaque seuil une valeur pour 2025. Avec aussi le plafond (${euros(PARAMS[2025].plafond)}) et la décote (${euros(PARAMS[2025].decoteSeuil)}) de 2025, le même revenu paierait ${r25.impot === r.impot ? `le même impôt, ${euros(r.impot)}` : `${euros(r25.impot)} au lieu de ${euros(r.impot)}`}.`,
    });
    await s.clear();
    const code = await s.code(yaml(2024), {
      at: regionBox('full', { right: 0.2 }),
      align: 'top',
      fontSize: 0.21,
    });
    await code.morph(yaml(2025), { markAdded: true });
    await card(
      [
        ['Seuils', '+' + hausse],
        ['Taux', 'inchangés'],
        ['Plafond par demi-part', `${euros(PARAMS[2024].plafond)} → ${euros(PARAMS[2025].plafond)}`],
        ['Décote, couple', `${euros(PARAMS[2024].decoteSeuil)} → ${euros(PARAMS[2025].decoteSeuil)}`],
        ['Impôt de ce foyer', `${euros(r.impot)} → ${euros(r25.impot)}`],
      ],
      { at: regionBox('full', { left: 0.6 }), title: 'bareme.yaml et paramètres, 2024 → 2025' },
    ).then((c) => c.mark('Impôt de ce foyer'));
    this.state.impot2025 = r25.impot;
  }
}
