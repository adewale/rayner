import { Scene } from '../../../src/index.ts';
import { stage, settingsOf, CodeBlock, answerOf, view, having } from '../../../explain/index.ts';
import type { LayoutDirection, Card } from '../../../explain/index.ts';

const ROWS: [string, number][] = [['Field', 123]];
/** The two cards' placement and the one field-direction override, as the code panel prints them. */
const START = { at: 'start' } as const;
const END = { at: 'end', direction: 'ltr' } as const;
// The code panel leaves out the cards' width, font size and titles: they affect neither placement nor field order.
const CARD = { width: 7.2, fontSize: 0.8, enter: false } as const;

// This explainer has no model of its own: every card is the engine's own s.card, placed by the stage, and
// the state records where each one landed, measured from the card. Its limit: Latin labels and digits only.
// Font and script support and bidirectional text shaping are separate from the panel and field-column
// directions shown here.
/** Which half of the stage a card sits in, and which side of its value the field name sits on. */
function layoutOf(card: Card) {
  const label = card.labels.get('Field')!.box()!,
    value = card.values.get('Field')!.box()!;
  return {
    side: card.center()[0] < 0 ? 'left' : 'right',
    name: label[2] <= value[0] ? 'left of value' : value[2] <= label[0] ? 'right of value' : 'overlapping',
    value: card.values.get('Field')!.text,
  };
}

/** The cards' value, and where each card landed, measured from the card on the stage. */
type LayoutState = { field?: number; cards?: Record<string, ReturnType<typeof layoutOf>> };

export default class LayoutDirectionExplainer extends Scene<LayoutState, { lit?: string | null }> {
  static meta = {
    sources: ['https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#stage'],
    // The code step's sentence speaks of the code panel it draws.
    claims: [{ says: 'This layout never says left or right', shown: true as const }],
  };
  static settings = [
    {
      id: 'direction',
      label: 'Stage direction',
      default: 'rtl',
      options: [
        { value: 'rtl', label: 'Right to left' },
        { value: 'ltr', label: 'Left to right' },
      ],
    },
  ];

  override async construct() {
    const answer = answerOf(this);
    const direction = settingsOf(this).direction as LayoutDirection,
      rtl = direction === 'rtl';
    const s = stage(this, { style: 'nord', direction, headingSize: 0.6 });
    const reading = rtl ? 'right-to-left' : 'left-to-right';

    // 1. The author's input: a layout that names logical places, and a prediction. The code panel is
    // drawn from the layout the step's state records: the stage's direction and each card's options.
    const layout = { direction, start: { ...START }, end: { ...END } };
    await s.steps([
      {
        id: 'code',
        title: `One layout on a ${reading} stage: which side is Start?`,
        line: 'Each card names a logical place, start or end, not a side of the page.',
        caption: `In a ${reading} page the reader starts at the ${rtl ? 'right' : 'left'}, so the card read first belongs there. This layout never says left or right: one card goes at start, the other at end, and the End card also sets its own field direction. On this ${direction} stage, which half will the Start card land in, and on which side of 123 will each card put its Field name?`,
        state: layout,
        draw: (st, s) =>
          new CodeBlock(
            this,
            s.palette,
            [
              `stage(this, { direction: '${st.direction}' })`,
              `s.card(rows, { at: '${st.start.at}' })`,
              `s.card(rows, { at: '${st.end.at}',`,
              `               direction: '${st.end.direction}' })`,
            ],
            { at: 'full', fontSize: 0.56 },
          ),
      },
    ]);

    // 2. The output: placement from the stage, columns from the stage unless the card overrides them.
    await this.step('columns', {
      title: rtl ? 'Start lands on the right, its Field name right of 123' : 'Start lands on the left, and both cards put Field first',
      line: rtl
        ? 'The End card’s own ltr puts its Field name on the left.'
        : 'The End card’s ltr matches the stage, so here it changes nothing.',
      caption: rtl
        ? `The rtl stage maps start to the right half and end to the left. The Start card also takes rtl columns from the stage, so its Field name sits to the right of the value, while the End card’s ltr puts its name on the left. Both still read 123: the columns swap sides, the digits inside a field do not. ${answer}.`
        : `The ltr stage maps start to the left half and end to the right. The Start card takes ltr columns from the stage, so both cards put Field before 123, and the End card’s own ltr makes no visible difference. ${answer}; on an rtl stage the Start card’s columns flip while the End card’s stay.`,
    });
    await s.clear();
    // The engine places the cards from the options the layout records, each a view: its value is
    // the model's (state.field), the row it lights is how the step shows it (shown.lit). The state
    // then records where each card landed, measured from the card on the stage.
    this.state.field = ROWS[0]![1];
    this.shown.lit = null;
    const cardView = (place: typeof layout.start | typeof layout.end, title: string, key: string) =>
      view(this, (st, sh) => s.cardPicture([['Field', having(st, 'field').field]], { ...place, ...CARD, title, lit: sh.lit, litAs: 'updated', key }), { place: false });
    const start = cardView(layout.start, `Start, ${layout.direction}`, 'start-card');
    const end = cardView(layout.end, `End, own ${layout.end.direction}`, 'end-card');
    await s.enter(start, end);
    s.opening(start, end);
    this.state.cards = { start: layoutOf(start.current), end: layoutOf(end.current) };

    // 3. An update keeps each card's columns.
    await this.step('updates', {
      title: 'Changing a value does not reorder the fields',
      line: 'Both values become 456; the columns stay put.',
      caption: rtl
        ? 'Both cards change 123 to 456. The Start card keeps Field on the right and the End card keeps it on the left, because each card keeps the column direction it was built with.'
        : 'Both cards change 123 to 456 and both keep Field on the left, because each card keeps the column direction it was built with.',
    });
    this.state.field = 456;
    this.shown.lit = 'Field';
    await this.play(start.sync({ match: 'key', staged: true }), end.sync({ match: 'key', staged: true }));
    s.opening(start, end);
    this.state.cards = { start: layoutOf(start.current), end: layoutOf(end.current) };

    // 4. The countercase: physical regions do not follow the stage.
    await this.step('physical', {
      title: rtl ? 'A card placed at left stays on the left' : 'At left and at start name the same half here',
      line: rtl ? 'Same rtl stage; these cards name sides, not logical places.' : 'Here they coincide; on an rtl stage start moves to the right.',
      caption: rtl
        ? 'Placed at left and at right, the cards keep those halves on this rtl stage, where start was the right. Use start and end for panels that should follow the reading direction, and left or right for something that must keep its side, such as a flowchart whose arrows run left to right. Both cards still take rtl columns from the stage. These cards hold Latin labels and digits; the page does not show how Arabic or Hebrew text is shaped.'
        : 'On this ltr stage the card at left sits where the Start card did, so the two names cannot be told apart. On an rtl stage start moves to the right half and left stays put. These cards hold Latin labels and digits; the page does not show how Arabic or Hebrew text is shaped.',
    });
    await s.clear();
    const left = await s.card(ROWS, { at: 'left', ...CARD, title: `Left, ${direction}` });
    const right = await s.card(ROWS, { at: 'right', ...CARD, title: `Right, ${direction}` });
    await s.enter(left, right);
    s.opening(left, right);
    this.state.cards = { left: layoutOf(left), right: layoutOf(right) };
  }
}
