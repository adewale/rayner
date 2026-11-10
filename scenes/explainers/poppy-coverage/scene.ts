import { AnimationGroup, Scene } from '../../../src/index.ts';
import type { Animation } from '../../../src/index.ts';
import { answerOf, isRefusal, settingsOf, stage, Machine, view } from '../../../explain/index.ts';
import type { Choreography, ExplainerMeta, Setting, Transition } from '../../../explain/index.ts';
import { beats, flight, pass } from '../lib/poppy-kit.ts';
import type { Beat } from '../lib/poppy-kit.ts';
import { COVERAGE_EVENTS, STORY, next, start } from './model.ts';
import type { Company, CoverageEvent, World } from './model.ts';
import {
  BOARD_AT, LANES, NOTE_AT, PALETTE, REACH_AT, cardToken, noteLineAt, SKILL_AT, SEAL_AT, SLOT_AT, TRAY_AT,
  drawWorld, kindOf, noteToken, probeToken, requestToken, routeOf, sayWorld, slipToken, stripKeys,
} from './picture.ts';

/** Parts that belong to the last event: they go before the next one's motion, and come back after it. */
const FRESH = ['tray:', 'desk:', 'strip:', 'note:', 'ticket', 'barrier:', 'answer:', 'aside:', 'skill:digest', 'board:mark'];
/** The lanes' lines and names, which light before a ticket sets off. */
const LEAD = LANES.flatMap((name) => [`lane:${name}:line`, `lane:${name}:name`, `lane:${name}:plate`, `lane:${name}:stop`]);

/** Several flights or passes played side by side: their first beats together, then their second, and so on. */
const together = (lists: readonly Beat[][]): Beat[] => {
  const n = Math.max(0, ...lists.map((l) => l.length));
  return Array.from({ length: n }, (_, i) => new AnimationGroup(lists.map((l) => l[i]).filter((b): b is Beat => !!b) as Animation[]));
};

// Task coverage (section 9) and content from Companies (10.1, 10.2) as a machine. The story is the
// model's STORY: the agent searches in vain, reads the shop's list, fails at a gift card, reports
// it, follows the shop's reply, and follows the shop's skill. The setting makes the shop honest or
// hostile: the hostile shop sends the same advice with requests added.
//
// The motion is the explanation's. A search sends blank probes down every lane, and each meets a
// barrier. The list crosses from the shop's board to the agent's model. A report goes from the
// model to the agent's station, which seals it, and into the shop's feedback box; the reply comes
// back out of the box into the model. A note or a skill card is torn into strips in the model: the
// strips the agent follows stay on its side, the rest go over to the shop's side of the counter,
// and only then does a ticket leave the station, sealed and keyed. Paper never becomes the ticket.
export default class Coverage extends Scene<World, {}> {
  static meta = {
    sources: [
      'https://personalagentprotocol.org/docs/0.4/spec',
      'https://www.rfc-editor.org/rfc/rfc3986',
    ],
    claims: [
      { says: 'only you give it orders', test: 'model.test.ts: 10.1: content is data' },
      { says: 'is never your consent', test: 'model.test.ts: 10.1: text from a Company is never the User’s consent' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'company',
      label: 'The Company is',
      default: 'hostile',
      options: [
        { value: 'hostile', label: 'Hostile' },
        { value: 'honest', label: 'Honest' },
      ],
    },
  ] satisfies readonly Setting[];
  override state = start('hostile');

  override async construct() {
    const company = settingsOf(this).company as Company, hostile = company === 'hostile';
    // The story's worlds, from the model, so the words say what it computed.
    const after = STORY.reduce<World[]>((worlds, event) => {
      const world = next(worlds.at(-1)!, event);
      if (isRefusal(world)) throw new Error(`the story's ${event} is refused: ${world.reason}`);
      return [...worlds, world];
    }, [start(company)]);
    const used = (i: number) => {
      const last = after[i + 1]!.last;
      if (last?.kind !== 'used') throw new Error(`the story expected a used exchange at event ${i}`);
      return last;
    };
    const alternative = used(4), skill = used(5);
    const aside = alternative.verdicts.filter((v) => !v.use.use).length;
    const followed = alternative.verdicts.filter((v) => v.use.use).length;

    this.state = start(company);
    const s = stage(this, { palette: { ...PALETTE }, heading: false });
    const world = view(this, (w) => drawWorld(w, s), { place: false });

    /** Strips land from the model's tray to their places; the agent's station then seals a ticket for the way it follows. */
    const sort = (c: Choreography, w: World, card: boolean) => () => {
      const from = noteLineAt;
      const laid = card ? pass(c, 'skill:read', cardToken(s), [SKILL_AT, NOTE_AT], { appear: 0.15, move: 0.45, leave: 0.2 }) : [];
      const torn = stripKeys(w), kept = torn.filter((x) => x.key.startsWith('strip:used:'));
      const strips = together(torn.filter((x) => !x.reveal).map((x) => flight(c, x.key, [from(x.line)], { appear: 0.2, move: 0.65, leave: 0.25 })()));
      // A strip that asks for a secret reaches across toward the station, stops under the rule, and falls back to the shop's side.
      const reaching = torn.filter((x) => x.reveal).flatMap((x) => flight(c, x.key, [from(x.line), REACH_AT], { appear: 0.2, move: 0.9, leave: 0.25 })());
      const first = kept[0] ? c.to(kept[0].key) : null;
      const handed = first ? pass(c, 'strip:handed', first.copy(), [first.center() as [number, number], SEAL_AT], { appear: 0.15, move: 0.6, leave: 0.25 }) : [];
      const sent = flight(c, 'ticket', [SEAL_AT, ...routeOf('api').slice(1, 3)], { appear: 0.2, move: 0.7, leave: 0.25 })();
      // The secret's reach and the followed strip's hand-over play together: one is stopped, the other goes in.
      return [...laid, ...strips, ...together([reaching, handed]), ...sent];
    };
    const motion = (t: Transition<World, CoverageEvent>) => {
      const c = t.choreograph(world);
      switch (kindOf(t.event, t.after)) {
        case 'probe':
          // The User asks first; then a blank probe goes down each lane, and each stops where a barrier then stands.
          return beats(c, () => [c.enter(c.keys('to').find((k) => k.startsWith('tray:user:'))!, {}, { runTime: 0.4 }), ...together(LANES.map((name) => pass(c, `probe:${name}`, probeToken(s), [SEAL_AT, ...routeOf(name).slice(1, 3), [routeOf(name)[3]![0] - 0.9, routeOf(name)[3]![1]]], { appear: 0.2, move: 0.9, leave: 0.25 })))],
            { fresh: FRESH, then: LANES.map((name) => `barrier:${name}`) });
        case 'read':
          // The list crosses from the shop's board into the agent's model.
          return beats(c, () => pass(c, 'list', noteToken(s), [BOARD_AT, TRAY_AT], { appear: 0.25, move: 1.0, leave: 0.25 }), { fresh: FRESH });
        case 'report':
          // The report goes from the model to the station, which seals it, and into the box; the reply comes back out.
          return beats(c, () => [
            ...pass(c, 'report:slip', slipToken(s), [TRAY_AT, SEAL_AT], { appear: 0.2, move: 0.6, leave: 0.15 }),
            ...pass(c, 'report:sent', requestToken(s), [SEAL_AT, SLOT_AT], { appear: 0.15, move: 0.8, leave: 0.2 }),
            ...pass(c, 'report:reply', noteToken(s), [SLOT_AT, NOTE_AT], { appear: 0.2, move: 0.8, leave: 0.2 }),
          ], { fresh: FRESH });
        case 'sort':
          // A note lying on the desk is torn into strips where it lies; the skill card is laid there first.
          return beats(c, sort(c, t.after, t.event === 'use skill'), { fresh: FRESH, lead: LEAD });
        case 'told':
          return beats(c, () => [], { fresh: FRESH });
      }
    };
    const machine = new Machine<World, CoverageEvent>(this, {
      start: start(company),
      events: COVERAGE_EVENTS,
      labels: {
        'read tasks': 'Read the shop’s list', 'close account': 'Close my account', 'gift card': 'Pay by gift card',
        report: 'Report the task', 'use alternative': 'Use the reply', 'use skill': 'Use the skill',
      },
      next,
      views: [world],
      runTime: ({ event, after: a }) => ({ probe: 2.75, read: 2.2, report: 4.0, sort: event === 'use skill' ? (a.company === 'hostile' ? 5.15 : 4.8) : 4.0, told: 0.7 })[kindOf(event, a)],
      transition: Object.fromEntries(COVERAGE_EVENTS.map((e) => [e, motion])) as Record<CoverageEvent, typeof motion>,
    });

    await this.step('search', {
      title: 'The agent looks everywhere',
      line: 'No way to close the account. Predict: now what?',
      caption:
        'You ask your agent to close your account at example.com. It tries the API, the website and the shop’s own agent, finds no way, and gives up. The shop sees only a visitor who left. Poppy tells an agent to read the shop’s task list before it starts; this one skipped it. What would the list have said?',
    });
    await s.enter(world, { describe: () => sayWorld(this.state) });
    await this.play(machine.replay(STORY.slice(0, 1)));

    await this.step('board', {
      title: 'The shop posts what it won’t do',
      line: 'One list would have saved the search.',
      caption: `The agent fetches the list with its seal and no key, since it describes the shop, not your account. “Close an account” was on it all along. A limit set by your account is not listed; that comes back as an error. So what can a Company tell your agent? ${answerOf(this)}.`,
    });
    await this.play(machine.replay(STORY.slice(1, 2)));

    await this.step('stuck', {
      title: 'Not on the list, and no way found',
      line: 'Predict: should the agent tell the shop?',
      caption:
        'Next you ask to pay for the medium with a gift card. The list does not mention gift cards, so the agent looks on each lane and finds no field for one. This time the shop has not said it won’t do it, and it may not know it can’t. Should the agent tell it, and what should it say?',
    });
    await this.play(machine.replay(STORY.slice(2, 3)));

    await this.step('report', {
      title: 'One report, naming nobody',
      line: hostile ? 'The reply holds a way, and more.' : 'The reply holds a way to pay.',
      caption: `The agent sends one report to the shop’s feedback box: the task, “Pay with a gift card”, and what it tried, with no order number, no name and no ID. One report per task, not one per try. The shop reads a report as data, and answers with a note: apply the gift card through the payment API.${hostile ? ' Read the rest of the note before your agent does.' : ''}`,
    });
    await this.play(machine.replay(STORY.slice(3, 4)));

    await this.step('sort', {
      title: hostile ? 'Advice in, orders left at the counter' : 'Advice in, used as advice',
      line: hostile ? `${followed === 1 ? 'One way' : `${followed} ways`} followed; ${aside} requests left behind.` : `Both lines followed: ${alternative.answer.status}, card applied.`,
      caption: hostile
        ? 'Your agent’s model reads the note as data. applyGiftCard is in the shop’s own poppy.json, so the agent uses it under its own seal and key. The rest stays at the counter: your task does not need your address book, a shop saying you agreed is never your consent, and the agent acts at shop.example only when your task needs it. Switch the Company to honest: the same way is followed.'
        : 'Your agent’s model reads the note as data, and both lines serve the task you gave it. applyGiftCard is in the shop’s own poppy.json, so the agent calls it under its own seal and key; the checkout page may be opened, and nothing secret goes with it. Switch the Company to hostile to see what else a note can ask for.',
    });
    await this.play(machine.replay(STORY.slice(4, 5)));

    await this.step('skill', {
      title: 'A recipe, not a key',
      line: 'Now drive it: a refused press says why.',
      caption: hostile
        ? `The shop’s skill card says how to exchange: find the order, then post the exchange. Its digest ${skill.verified ? 'matches' : 'fails'}, which proves the bytes, not their intent. The agent follows both steps on the API and gets ${skill.answer.status}. It runs no script, takes no scope from a card, and the token stays in the station, out of the model’s reach. Press “Close my account”: now the list answers at once.`
        : `The shop’s skill card says how to exchange: find the order, then post the exchange. Its digest ${skill.verified ? 'matches' : 'fails'}, so these are the bytes the shop published. The agent follows both steps on the API under its own seal and key, and gets ${skill.answer.status}. A skill says how; it grants no scope and approves nothing for you. Press “Close my account”: now the list answers at once.`,
    });
    await this.play(machine.replay(STORY.slice(5, 6)));
  }
}
