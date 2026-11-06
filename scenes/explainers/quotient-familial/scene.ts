import { Scene, Group, Create, view } from '../../../src/index.ts';
import { callout } from '../../../explain/drawing.ts';
import type { View } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, Card, mermaid } from '../../../explain/index.ts';
import type { CardRow, CardOptions } from '../../../explain/index.ts';
import { impot, bareme, tranche, repartition, BAREME, PARAMS, euros, pourcent, partsTexte, NNBSP } from './model.ts';
import type { Impot } from './model.ts';
import { drawRegle } from './picture.ts';

// Every rule is read from openfisca-france at tag 176.1.3 (commit 5cc6563); the model in
// model.ts quotes file and line for each one.
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

/** The script's one-sentence answer, stated in the multiplie step of every scenario. */
const REPONSE = `Diviser change l’impôt parce que le barème est progressif${deux} chaque part repart du bas du barème, donc moins d’euros atteignent les tranches les plus taxées que sur le revenu entier`;
// around(1 470 − 0,4525 × impôt) is 0 once the impôt passes 1 469,5 / 0,4525 = 3 247,51 €.
const FIN_DECOTE = Math.ceil((PARAMS[2024].decoteSeuil - 0.5) / PARAMS[2024].decoteTaux);
const RANG = ['1er enfant', '2e enfant', '3e enfant'];
const COUNTS = ['0 enfant', '1 enfant', '2 enfants', '3 enfants'];

/** What the steps record, accumulated: the fields the cards and the rulers below draw from. */
interface QfState {
  rni: number;
  enfants: number;
  parts: number;
  quotient: number;
  tranches: { rate: number; entier: number; parts: number }[];
  brut: number;
  sansEnfants: number;
  avantage: number;
  demiParts: number;
  plafond: number;
  plafQf: number;
  decote: number;
  impot: number;
  tauxMoyen: number;
  parEnfants: number[];
  impot2025: number;
}
/** The income as the scene writes it: whole euros, or with cents when it has them. */
const rniTexteDe = (rni: number) => (Number.isInteger(rni) ? euros(rni) : eur2(rni));

// The pipeline the steps walk along: ir_brut, ir_ss_qf, ir_plaf_qf, decote and ip_net in ir.py.
// Tighter ranks than Mermaid's default and two-line labels keep its 13 px labels near 18 px on the stage.
const FLOW = [
  mermaid.frontMatter({ flowchart: { rankSpacing: 24, nodeSpacing: 16 } }),
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
  `${mermaid.frontMatter({ xyChart: { width: opts.width, height: opts.height } })}\n` +
  `xychart-beta\n x-axis [${opts.x.map((x) => `"${x}"`).join(', ')}]\n y-axis "${opts.y}" 0 --> ${arrondi(Math.max(...opts.bars, ...(opts.line ?? [])))}\n` +
  ` bar [${opts.bars.map((v) => v.toFixed(2)).join(', ')}]` +
  (opts.line ? `\n line [${opts.line.map((v) => v.toFixed(2)).join(', ')}]` : '');

export default class QuotientFamilialExplainer extends Scene {
  static meta = {
    id: 'quotient-familial',
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
    // The French sentences that reach beyond the scenario on screen, and the tests that hold them.
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
    const rniTexte = rniTexteDe(rni);
    const st = () => this.state as unknown as QfState;
    /**
     * A card drawn from the state: a view that builds it from `rows(state)`, values in the card's
     * monospaced face, so check holds it to the state. `mark` names the row it lights, if any; the
     * lit row is part of the drawn card, so check holds the bar too.
     */
    const cardOf = (rows: (st: QfState) => readonly CardRow[], opts: CardOptions | ((st: QfState) => CardOptions)) => ({ rows, opts });
    /** Enter a card view as s.card enters a card, with its row `mark` lit. */
    const enterCard = async ({ rows, opts }: ReturnType<typeof cardOf>, mark?: string, as?: string) => {
      const v: View<Card> = view(
        this,
        (state) => {
          const st = state as unknown as QfState;
          return new Card(this, s.palette, rows(st).map(([label, value]) => [label, mono(String(value))] as const), {
            ...(typeof opts === 'function' ? opts(st) : opts),
            ...(mark ? { lit: mark, ...(as ? { litAs: as } : {}) } : {}),
          });
        },
        { place: false },
      );
      await s.enter(v, { runTime: 0.35, shift: [0, -0.08] });
    };

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
    /** A callout drawn from the state, drawn in as s.callout draws one. */
    const calloutOf = async (draw: (st: Record<string, unknown>) => Group) => {
      const v = view(this, (st) => draw(st), { place: false });
      s.keep(v);
      await this.play(new Create(v, { runTime: 0.6, lagRatio: 0.15 }));
      return v;
    };
    /** A step's arithmetic, from the state, said under the node of the pipeline that does it. */
    const sous = (id: string, texte: (st: Record<string, number>) => string) => {
      const b = flow.get(id).box()!,
        bas = flow.get('REF').box()![1] - 0.4;
      return calloutOf((st) => callout(s, b, texte(st as Record<string, number>), { side: 'below', gap: b[1] - bas, size: 0.32, color: s.emphasis }));
    };
    await flow.mark(['RNI'], { as: 'étape en cours' });
    this.state = { rni, enfants };
    await enterCard(
      cardOf(
        (st) => [
          ['Foyer', 'couple marié ou pacsé'],
          ['Enfants à charge', String(st.enfants)],
          ['Revenu net imposable', rniTexteDe(st.rni)],
          ['Revenus de l’année', '2024'],
        ],
        { at: LEFT, title: 'Ce foyer' },
      ),
    );
    await card(
      [
        ['Réductions, crédits d’impôt', 'non'],
        ['Seuil de recouvrement de 61 €', 'non'],
        ['Célibataires, veufs, invalidité', 'non'],
      ],
      { at: RIGHT, title: 'Hors du modèle' },
    );

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
    this.state.parts = r.parts;
    await sous(
      'QUOT',
      (st) =>
        [`2 pour le couple`, ...RANG.slice(0, st.enfants).map((_, i) => (i < 2 ? '0,5' : '1'))].join(' + ') +
        ` = ${partsTexte(st.parts!)} parts`,
    );

    // ----------------------------------------------------------- quotient
    await this.step('quotient', {
      title: `Le quotient${deux} ${eur2(r.quotient)} par part`,
      line: `${rniTexte} ÷ ${partsTexte(r.parts)} parts${deux} le barème s’applique à une seule part.`,
      caption: `Le barème s’applique au revenu d’une seule part, le quotient${deux} ${rniTexte} ÷ ${partsTexte(r.parts)} = ${eur2(r.quotient)}. Plus le foyer a de parts, plus ce quotient est bas, et plus il reste dans les tranches du bas.`,
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.walk([['RNI', 'QUOT']], { trail: true });
    this.state.quotient = r.quotient;
    await sous('QUOT', (st) => `${rniTexte} ÷ ${partsTexte(st.parts!)} = ${eur2(st.quotient!)}`);

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
    for (const [i, x] of b.slices.entries())
      if (x.base > 0)
        await calloutOf((st) => callout(s, bars.get(`bar:0:${pourcent(x.rate)}`), eur2(bareme(st.quotient as number).slices[i]!.tax), { side: 'above', gap: 0.2, size: 0.26 }));
    // The quotient's top tranche, not the household's taux marginal: when the plafond binds, OpenFisca's
    // ir_taux_marginal is the two-part calculation's, which can be higher. The default couple's quotient is
    // in the 11 % tranche while its taux marginal is 30 % (test/explain-quotient-familial.test.ts holds both).
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
    this.state.tranches = rep;
    // Both rulers are one view of the tranches, the income, its parts and its quotient.
    const regles = view(
      this,
      (state) => {
        const st = state as unknown as QfState;
        return new Group(
          drawRegle(st, 'entier', `Revenu entier, ${rniTexteDe(st.rni)}`, -1.5, s.palette),
          drawRegle(st, 'parts', `Par parts, ${partsTexte(st.parts)} × ${eur2(st.quotient)}`, -2.95, s.palette),
        );
      },
      { place: false },
    );
    const ligne = (cle: 'entier' | 'parts') =>
      st()
        .tranches.filter((t) => t[cle] > 0)
        .map((t) => `${eur2(t[cle])} à ${pourcent(t.rate)}`)
        .join(', ');
    await s.enter(regles, {
      describe: () =>
        `Deux barres de ${rniTexteDe(st().rni)} à la même échelle, coupées par tranche du barème${deux} revenu entier, ${ligne('entier')}${pv} par parts, ${ligne('parts')}.`,
    });
    s.opening(...regles.current.children);

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
    this.state.brut = r.brut;
    await sous('FOIS', (st) => `${eur2(st.parPart!)} × ${partsTexte(st.parts!)} = ${eur2(st.brut!)}`);
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
    this.state.sansEnfants = r.sansEnfants;
    this.state.avantage = r.avantage;
    await enterCard(
      cardOf(
        (st) => [
          ['Impôt sur 2 parts (sans enfants)', eur2(st.sansEnfants)],
          [`Impôt sur ${partsTexte(st.parts)} parts`, eur2(st.brut)],
          ['Avantage des enfants', eur2(st.avantage)],
        ],
        { at: regionBox(BELOW, { left: -3.8, right: 3.8 }) },
      ),
      'Avantage des enfants',
    );

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
    this.state.plafond = r.plafond;
    this.state.plafonne = r.plafonne;
    this.state.plafQf = r.plafQf;
    // The half-parts the plafond counts, which the card's first row multiplies.
    this.state.demiParts = r.demiParts;
    await enterCard(
      cardOf(
        (st) => [
          [`Plafond (${st.demiParts} demi-part${st.demiParts > 1 ? 's' : ''} × ${plafondTexte})`, euros(st.plafond)],
          ['Avantage des enfants', eur2(st.avantage)],
          ['Impôt après plafonnement', eur2(st.plafQf)],
        ],
        { at: RIGHT },
      ),
      'Impôt après plafonnement',
    );

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
    this.state.decote = r.decoteGain;
    this.state.impot = r.impot;
    this.state.parEnfants = tous.map((t) => t.impot);
    // The share of the income the tax takes, the household card's last row.
    this.state.tauxMoyen = r.tauxMoyen;
    await enterCard(
      cardOf(
        (st) => [
          ['Impôt après plafonnement', eur2(st.plafQf)],
          ['Décote', '− ' + euros(st.decote)],
          ['Impôt', euros(st.impot)],
          ['Part du revenu', pourcent(st.tauxMoyen, 1)],
        ],
        { at: LEFT, title: 'Ce foyer' },
      ),
      'Impôt',
    );
    await enterCard(
      cardOf(
        (st) => st.parEnfants.map((v, n) => [COUNTS[n]!, euros(v)] as const),
        (st) => ({ at: RIGHT, title: `Impôt, revenu de ${rniTexteDe(st.rni)}` }),
      ),
      COUNTS[st().enfants]!,
      'ce foyer',
    );

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
    this.state.impot2025 = r25.impot;
    // The thresholds, rates and parameters are the same in every scenario; the household's tax is its state.
    await enterCard(
      cardOf(
        (st) => [
          ['Seuils', '+' + hausse],
          ['Taux', 'inchangés'],
          ['Plafond par demi-part', `${euros(PARAMS[2024].plafond)} → ${euros(PARAMS[2025].plafond)}`],
          ['Décote, couple', `${euros(PARAMS[2024].decoteSeuil)} → ${euros(PARAMS[2025].decoteSeuil)}`],
          ['Impôt de ce foyer', `${euros(st.impot)} → ${euros(st.impot2025)}`],
        ],
        { at: regionBox('full', { left: 0.6 }), title: 'bareme.yaml et paramètres, 2024 → 2025' },
      ),
      'Impôt de ce foyer',
    );
  }
}
