import { Scene } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { LayoutDirection, Card } from '../../../explain/index.ts';

const ROWS: [string, number][] = [['Field', 123]];
/** The two cards' placement and the one field-direction override, as the code panel prints them. */
const START = { at: 'start' } as const;
const END = { at: 'end', direction: 'ltr' } as const;
const CARD = { width: 7.2, fontSize: 0.8, enter: false } as const;
/** The answer, stated where the cards first appear. */
const ANSWER = 'Start and End follow the stage’s direction, and a card’s field columns follow the stage unless the card sets its own';

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

export default class LayoutDirectionExplainer extends Scene {
  static meta = {
    id: 'layout-direction',
    title: 'How does RTL change panels and field columns?',
    sources: ['https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#stage'],
    answer: ANSWER,
    // The code step's sentence speaks of the code panel it draws.
    claims: [{ says: 'This layout never says left or right', shown: true as const }],
    checks: [
      {
        question:
          'On the rtl stage, add a third card at end with no direction of its own. Which half does it go to, and which side of its value is its Field name?',
        answer:
          'The left half, because end is the left on an rtl stage. With no direction of its own it takes rtl columns from the stage, so its Field name sits to the right of its value.',
      },
      {
        question:
          'A flowchart whose arrows run left to right must sit on the left half of the page in both reading directions. Should it be placed at start, at end or at left?',
        answer:
          'At left. Start and end swap halves when the stage direction changes; left keeps its side in both, as the last step shows.',
      },
      {
        question: 'Give the End card direction rtl instead of ltr. On the rtl stage, how do the two cards’ fields compare?',
        answer:
          'They match: both cards now have rtl columns, so both put Field to the right of 123. Neither card reverses the digits.',
      },
    ],
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
    const direction = settingsOf(this).direction as LayoutDirection,
      rtl = direction === 'rtl';
    const s = stage(this, { style: 'nord', direction, headingSize: 0.6 });
    const reading = rtl ? 'right-to-left' : 'left-to-right';

    // 1. The author's input: a layout that names logical places, and a prediction.
    await this.step('code', {
      title: `One layout on a ${reading} stage: which side is Start?`,
      line: 'Each card names a logical place, start or end, not a side of the page.',
      caption: `In a ${reading} page the reader starts at the ${rtl ? 'right' : 'left'}, so the card read first belongs there. This layout never says left or right: one card goes at start, the other at end, and the End card also sets its own field direction. On this ${direction} stage, which half will the Start card land in, and on which side of 123 will each card put its Field name?`,
    });
    const code = await s.code(
      [
        `stage(this, { direction: '${direction}' })`,
        `s.card(rows, { at: '${START.at}' })`,
        `s.card(rows, { at: '${END.at}',`,
        `               direction: '${END.direction}' })`,
      ],
      { at: 'full', fontSize: 0.56, enter: false },
    );
    await s.enter(code);

    // 2. The output: placement from the stage, columns from the stage unless the card overrides them.
    await this.step('columns', {
      title: rtl ? 'Start lands on the right, its Field name right of 123' : 'Start lands on the left, and both cards put Field first',
      line: rtl
        ? 'The End card’s own ltr puts its Field name on the left.'
        : 'The End card’s ltr matches the stage, so here it changes nothing.',
      caption: rtl
        ? `The rtl stage maps start to the right half and end to the left. The Start card also takes rtl columns from the stage, so its Field name sits to the right of the value, while the End card’s ltr puts its name on the left. Both still read 123: the columns swap sides, the digits inside a field do not. ${ANSWER}.`
        : `The ltr stage maps start to the left half and end to the right. The Start card takes ltr columns from the stage, so both cards put Field before 123, and the End card’s own ltr makes no visible difference. ${ANSWER}; on an rtl stage the Start card’s columns flip while the End card’s stay.`,
    });
    await s.clear();
    const start = await s.card(ROWS, { ...START, ...CARD, title: `Start, ${direction}` });
    const end = await s.card(ROWS, { ...END, ...CARD, title: `End, own ${END.direction}` });
    await s.enter(start, end);
    s.reading(start, end);
    this.state.cards = { start: layoutOf(start), end: layoutOf(end) };

    // 3. An update keeps each card's columns.
    await this.step('updates', {
      title: 'Changing a value does not reorder the fields',
      line: 'Both values become 456; the columns stay put.',
      caption: rtl
        ? 'Both cards change 123 to 456. The Start card keeps Field on the right and the End card keeps it on the left, because each card keeps the column direction it was built with.'
        : 'Both cards change 123 to 456 and both keep Field on the left, because each card keeps the column direction it was built with.',
    });
    await start.set({ Field: 456 });
    await end.set({ Field: 456 });
    await start.mark('Field', { as: 'updated' });
    await end.mark('Field', { as: 'updated' });
    s.reading(start, end);
    this.state.cards = { start: layoutOf(start), end: layoutOf(end) };

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
    s.reading(left, right);
    this.state.cards = { left: layoutOf(left), right: layoutOf(right) };
  }
}
