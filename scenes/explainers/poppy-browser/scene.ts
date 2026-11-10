import { AnimationGroup, Group, Rectangle, Scene } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { answerOf, isRefusal, settingsOf, stage, Machine, view } from '../../../explain/index.ts';
import type { Choreography, ExplainerMeta, Setting, Transition } from '../../../explain/index.ts';
import { TONE, beats, flight, pass } from '../lib/poppy-kit.ts';
import type { Beat } from '../lib/poppy-kit.ts';
import { ATTACK_CODE, JOIN_EVENTS, PHISH_CODE, bound, end, next, start, storyOf } from './model.ts';
import type { JoinEvent, SignIn, World } from './model.ts';
import {
  COUNTER_X, EVIL_HALF_AT, JOIN_AT, MESSAGE_AT, PAGE_AT, PALETTE, ROAD_A_FROM, ROAD_B, ROAD_B_FROM, SEAL_AT, SESSION_AT, SHOWN_START,
  drawWorld, sayWorld, shortCode, stub,
} from './picture.ts';
import type { Shown } from './picture.ts';

const SIGN_INS: Record<string, SignIn> = { 'signed-in': 'signed in', 'signed-out': 'signed out', 'no-scope': 'signed in without the browser scope' };
/** What lights before the agent's ticket sets off: its road. */
const AGENT_ROAD = ['lane:agent:line', 'lane:agent:name', 'lane:agent:plate', 'lane:agent:stop'];
const BROWSER_ROAD = ['road:browser', 'road:browser:stop'];
const COUNTER_B: Vec = [COUNTER_X, ROAD_B];

/** Several flights at once: their beats played side by side, beat by beat. */
const together = (...lists: Beat[][]): Beat[] =>
  Array.from({ length: Math.max(...lists.map((l) => l.length)) }, (_, i) => new AnimationGroup(lists.map((l) => l[i]).filter((b): b is Beat => !!b)));

/** A request from the browser: a plain slip of paper, with no seal, since a browser cannot carry the agent's header. */
const browserRequest = () => new Group(
  new Rectangle({ width: 0.9, height: 0.52, fill: TONE.paper, stroke: 'none', cornerRadius: 0.06 }),
  new Rectangle({ width: 0.55, height: 0.07, fill: TONE.paperLine, stroke: 'none', cornerRadius: 0.03 }).moveTo([-0.05, 0.08]),
  new Rectangle({ width: 0.35, height: 0.07, fill: TONE.paperLine, stroke: 'none', cornerRadius: 0.03 }).moveTo([-0.15, -0.1]),
);

// The agent's browser joining the Session, as a machine: each step of section 6 and each of the
// attacker's tries is an event of the model; the picture is a view of its state; the last step is
// live and its story ends, so the reader starts again from the beginning.
//
// The motion is the explanation's. The agent's requests grow from its seal and travel its own road
// along the top. The browser's requests are plain slips with no seal, on the browser's short road.
// At the join page the code comes back into the page and the cookie half down onto the shelf; the
// agent reads the code along its dotted line before it sends it; the stamp is pressed on the
// Company's stub only after the agent's ticket lands; at the form, the stub and its half travel
// together and the half seats against the Company's stub; the Session's cookie comes back to the
// shelf. The attacker's stub comes from its own browser through yours; its cookie half comes from its
// own shelf; its message stops beside your agent and goes no further.
export default class PoppyBrowser extends Scene<World, Shown> {
  static meta = {
    sources: [
      'https://personalagentprotocol.org/docs/0.4/spec',
      'https://www.rfc-editor.org/rfc/rfc9700',
      'https://www.rfc-editor.org/rfc/rfc6265',
    ],
    claims: [
      { says: 'never its key', test: 'model.test.ts: a page fetched with the agent’s own client carries the Session header' },
      { says: 'works only with the cookie', test: 'model.test.ts: in no reachable state does a wrong browser join' },
      { says: 'never touches the browser’s road', test: 'model.test.ts: the access token never passes through the browser' },
      { says: 'Only this browser held that half', test: 'model.test.ts: an authorized code submitted from a browser without its cookie fails' },
      { says: 'only the agent could stamp', test: 'model.test.ts: in no reachable state does a wrong browser join' },
      { says: 'Only the agent can stamp the code', test: 'model.test.ts: the Company checks the Session header (5.3), the scope, then the code' },
      { says: 'the browser never sees the key', test: 'model.test.ts: the access token never passes through the browser' },
      { says: 'only your agent’s own rule does', test: 'model.test.ts: the agent authorizes only a code its own browser loaded' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'signin',
      label: 'Your agent is',
      default: 'signed-in',
      options: [
        { value: 'signed-in', label: 'Signed in' },
        { value: 'signed-out', label: 'Signed out' },
        { value: 'no-scope', label: 'Signed in, no browser scope' },
      ],
    },
  ] satisfies readonly Setting[];
  override state = start('signed in');
  override shown: Shown = SHOWN_START;

  override async construct() {
    const signIn = SIGN_INS[settingsOf(this).signin!]!, story = storyOf(signIn);
    // The world after each event of the story, from the model, so the words say what it computed.
    const after = story.reduce<World[]>((worlds, event) => {
      const world = next(worlds.at(-1)!, event);
      if (isRefusal(world)) throw new Error(`the story's ${event} is refused: ${world.reason}`);
      return [...worlds, world];
    }, [start(signIn)]);
    const browsed = after.find((w) => w.last?.event === 'browse')!.last;
    if (browsed?.event !== 'browse') throw new Error('the story has no browse');
    const signedIn = browsed.visit.via === 'session';

    this.state = start(signIn);
    this.shown = SHOWN_START;
    const s = stage(this, { palette: { ...PALETTE }, heading: false });
    const world = view(this, (w, sh) => drawWorld(w, s, sh), { place: false });

    const codeOf = (t: Transition<World, JoinEvent>) => {
      const last = t.after.last;
      if (!last || !('code' in last)) throw new Error(`${t.event} left no code`);
      return shortCode(last.code);
    };
    /** Where a row's stub sits on the rack, for things that travel to it. */
    const rowAt = (c: Choreography, id: string): Vec => c.to(`row:${id}:stub`).center() as Vec;

    const machine = new Machine<World, JoinEvent>(this, {
      start: start(signIn),
      events: JOIN_EVENTS,
      labels: {
        fetch: 'Fetch a help page', load: 'Open the join page', authorize: 'Authorize the code', submit: 'Submit the form',
        browse: 'Browse /orders', forge: 'Attacker: forged form', phish: 'Attacker: code by message',
      },
      next,
      bound,
      end,
      views: [world],
      runTime: ({ event }) => ({ fetch: 1.8, load: 2.6, authorize: 2.8, submit: 2.8, browse: 1.6, forge: 2.4, phish: 3.0 })[event],
      transition: {
        // The agent's own fetch: a ticket with its seal, and no key, on its own road.
        fetch: (t) => {
          const c = t.choreograph(world);
          return beats(c, flight(c, 'ticket', [SEAL_AT, ROAD_A_FROM]), { lead: AGENT_ROAD });
        },
        // The browser asks for the join page; the code comes back into the page and the cookie half onto the shelf.
        load: (t) => {
          const c = t.choreograph(world), id = codeOf(t);
          return beats(c, () => [
            ...pass(c, 'request', browserRequest(), [ROAD_B_FROM, COUNTER_B], { appear: 0.2, move: 0.5, leave: 0.15 }),
            ...together(
              flight(c, 'page:stub', [COUNTER_B, ROAD_B_FROM, PAGE_AT], { move: 0.9 })(),
              flight(c, 'shelf:join', [COUNTER_B, [ROAD_B_FROM[0] + 0.4, ROAD_B], [ROAD_B_FROM[0] + 0.4, JOIN_AT[1]], JOIN_AT], { move: 0.9 })(),
            ),
          ], { lead: BROWSER_ROAD, then: [`row:${id}:stub`, `row:${id}:ring`] });
        },
        // The agent reads the code from its own page, then sends it on its own road; the stamp is pressed after it lands.
        authorize: (t) => {
          const c = t.choreograph(world), id = codeOf(t);
          return beats(c, () => [
            ...pass(c, 'read', c.from('page:stub').copy(), [PAGE_AT, [PAGE_AT[0] - 2.2, 1.95], SEAL_AT], { appear: 0.2, move: 0.7, leave: 0.2 }),
            ...flight(c, 'ticket', [SEAL_AT, ROAD_A_FROM])(),
          ], { lead: AGENT_ROAD, then: ['barrier', `row:${id}:ring`, `row:${id}:stamp`, `row:${id}:key`] });
        },
        // The stub leaves the page and its half leaves the shelf; they travel together and the half seats on the Company's stub.
        submit: (t) => {
          const c = t.choreograph(world), id = codeOf(t), at = rowAt(c, id);
          const joined = t.after.last?.event === 'submit' && t.after.last.answer.status === 303;
          return beats(c, () => {
            const stubTrip = pass(c, 'carried', c.from('page:stub').copy(), [PAGE_AT, ROAD_B_FROM, COUNTER_B, [at[0] - 0.6, at[1]]], { appear: 0.2, move: 1.0, leave: 0.2 });
            const halfTrip = flight(c, `row:${id}:half`, [JOIN_AT, [ROAD_B_FROM[0] + 0.4, JOIN_AT[1]], [ROAD_B_FROM[0] + 0.4, ROAD_B], COUNTER_B], { appear: 0.2, move: 1.0, leave: 0.2 })();
            const away = [c.leave('page:stub', { runTime: 0.2 }), ...(c.has('shelf:join', 'from') && !c.has('shelf:join', 'to') ? [c.leave('shelf:join', { runTime: 0.2 })] : [])];
            const back = joined ? flight(c, 'shelf:session', [COUNTER_B, [ROAD_B_FROM[0] + 0.4, ROAD_B], [ROAD_B_FROM[0] + 0.4, SESSION_AT[1]], SESSION_AT], { move: 0.7 })() : [];
            return [new AnimationGroup(away), ...together(stubTrip, halfTrip), ...back];
          }, { lead: BROWSER_ROAD, then: [`row:${id}:gap`, `row:${id}:barrier`] });
        },
        // The browser opens a page; its cookie goes with the slip, and the page changes once the answer is back.
        browse: (t) => {
          const c = t.choreograph(world);
          return beats(c, () => pass(c, 'request', browserRequest(), [ROAD_B_FROM, COUNTER_B], { appear: 0.2, move: 0.55, leave: 0.15 }), { lead: BROWSER_ROAD });
        },
        // The attacker's stamped stub comes from its own browser, through yours, alone, and stops at a barrier.
        forge: (t) => {
          const c = t.choreograph(world), id = shortCode(ATTACK_CODE), at = rowAt(c, id);
          const token = stub(s, { at: [0, 0], code: ATTACK_CODE, width: 2.3 }), from: Vec = [EVIL_HALF_AT[0] - 1.6, EVIL_HALF_AT[1] + 0.9];
          return beats(c, () => pass(c, 'forged', token, [from, [PAGE_AT[0] + 1.0, PAGE_AT[1] - 0.2], ROAD_B_FROM, COUNTER_B, [at[0] - 0.6, at[1]]], { appear: 0.25, move: 1.4, leave: 0.2 }),
            { lead: BROWSER_ROAD, then: [`row:${id}:gap`, `row:${id}:barrier`] });
        },
        // A message brings the attacker's code to your agent, which keeps it out; then the attacker's own browser sends stub and half.
        phish: (t) => {
          const c = t.choreograph(world), id = shortCode(PHISH_CODE), at = rowAt(c, id);
          return beats(c, () => [
            ...flight(c, 'message', [[EVIL_HALF_AT[0] - 1.6, EVIL_HALF_AT[1] + 0.9], [MESSAGE_AT[0] + 2.0, MESSAGE_AT[1] - 0.6]], { move: 0.9 })(),
            ...together(
              flight(c, `row:${id}:half`, [EVIL_HALF_AT, [COUNTER_X + 0.3, EVIL_HALF_AT[1]], [COUNTER_X + 0.3, at[1]]], { move: 0.9 })(),
              pass(c, 'carried', stub(s, { at: [0, 0], code: PHISH_CODE, width: 2.3 }), [[EVIL_HALF_AT[0] - 1.2, EVIL_HALF_AT[1]], [COUNTER_X + 0.3, EVIL_HALF_AT[1] + 0.3], [at[0] - 0.6, at[1]]], { appear: 0.2, move: 0.9, leave: 0.2 }),
            ),
          ], { then: [`row:${id}:gap`, `row:${id}:barrier`] });
        },
      },
    });

    await this.step('fetch', {
      title: 'A browser carries cookies, not headers',
      line: 'The agent’s own fetch carries its seal, never its key.',
      caption:
        'Your agent fetches the size guide on example.com with its own HTTP client. The request carries its seal and never its key, so it is signed out even when the agent is signed in. A browser sends cookies, not the agent’s headers, so it needs its own way into the Session, and it must be one the agent controls, not yours. A shop can ask agents not to browse at all (web.disabled), but cannot enforce it.',
    });
    await s.enter(world, { describe: () => sayWorld(this.state, this.shown) });
    await this.play(machine.replay(story.slice(0, 1)));

    await this.step('load', {
      title: 'The Company tears a ticket in two',
      line: 'One half to read, one half to keep.',
      caption: `The browser opens example.com’s join page. The page shows a one-time code, and the same answer leaves a cookie on the browser’s shelf that ties the code to this browser, like one ticket torn in two: the code to read, the cookie to keep. No page can read the cookie. ${answerOf(this)}.`,
    });
    await this.play(machine.replay(story.slice(1, 2)));

    const lacking = signIn === 'signed in without the browser scope';
    await this.step('authorize', {
      title: 'Only the agent can stamp the code',
      line: lacking ? '403: the key lacks poppy:browser-sign-in.' : signIn === 'signed in' ? 'Seal and key go; the browser never sees the key.' : 'Seal alone: the Session, no account.',
      caption: lacking
        ? 'The agent reads the code from its own browser and sends it on its own road, with its seal and its key. The key lacks the tooth for poppy:browser-sign-in, so the answer is 403 and the stub stays unstamped. The agent sends the same code again without its key, and the Company stamps it for the Session with no account. The key never touches the browser’s road.'
        : signIn === 'signed in'
          ? 'The agent reads the code from its own browser and sends it on its own road, with its seal and its key. The Company checks the seal, finds the key’s tooth for poppy:browser-sign-in, and stamps its stub of the code: this Session, your account, these scopes. 204. The key never touches the browser’s road.'
          : 'The agent reads the code from its own browser and sends it on its own road, with its seal. It holds no key, so the Company stamps its stub of the code for this Session with no account, and the browser will join signed out. 204. A key, once the agent has one, never touches the browser’s road.',
    });
    await this.play(machine.replay(story.slice(2, lacking ? 4 : 3)));
    const k = lacking ? 4 : 3;

    await this.step('submit', {
      title: 'The halves meet in one browser',
      line: 'Code and cookie fit; the browser gets the Session’s cookie.',
      caption:
        'Now the browser submits the form. The code goes back with the cookie half from its shelf, and the Company checks that the half fits this stub, that the stub is stamped, and that it was not used before; a code works once, whatever the answer. It fits, so the Company sets the Session’s own cookie on the shelf. Only this browser held that half, and only the agent could stamp the stub.',
    });
    await this.play(machine.replay(story.slice(k, k + 1)));

    await this.step('browse', {
      title: 'The browser browses as the Session',
      line: signedIn ? 'Signed in to your account, within the key’s scopes.' : 'The same Session, signed out.',
      caption: signedIn
        ? 'The browser opens your orders, and its cookie makes the request the Session’s: signed in to account A, within the key’s scopes, whatever cookies it had before. Where a website cannot apply scopes, poppy:browser-sign-in means everything your account can do there; the Company must say so when you approve it, and set web.unscoped in poppy.json. The key itself stayed with the agent.'
        : 'The browser opens your orders as the Session, signed out: the shop sees the same visitor as the agent’s other requests, and no account. Signing the browser in takes a key with poppy:browser-sign-in. Where a website cannot apply scopes, that scope means everything your account can do there; the Company must say so, and set web.unscoped in poppy.json.',
    });
    await this.play(machine.replay(story.slice(k + 1, k + 2)));

    await this.step('logins', {
      title: 'A join and the login the browser had',
      line: 'A key replaces the old login; no key leaves it.',
      caption:
        'A browser may already be logged in on the website from before. A join without a key leaves that login alone, and scopes do not apply to it. A join with a key signs the browser in to that account in its place, and when the Session’s sign-in ends, by sign-out, disconnection, expiry or a join without a key, the browser is signed out: the earlier login does not come back.',
    });
    this.shown = { panel: 'logins', attacker: false };
    await this.play(world.sync({ runTime: 1.2 }));

    await this.step('forge', {
      title: 'A stamped code without its cookie',
      line: 'Stamped by the attacker, but no cookie came with it.',
      caption:
        'Now be the attacker. It opens the join page in its own browser and stamps the code in its own Session, signed in to its account. Then a page on evil.example makes your agent’s browser post that code. Had it worked, your agent would shop inside the attacker’s account. It fails: a browser sends no join cookie with a form from another site, and no other host can plant one, so the stub arrives alone.',
    });
    this.shown = { panel: 'world', attacker: true };
    await this.play(world.sync({ runTime: 1.0 }));
    await this.play(machine.replay(story.slice(k + 2, k + 3)));

    await this.step('phish', {
      title: 'A cookie without a stamp',
      line: 'Now play the attacker: which half is missing?',
      caption:
        'The attacker’s browser holds the cookie for a code, so it sends your agent that code in a message, hoping for a stamp. No check at example.com would stop it; only your agent’s own rule does: it stamps a code only from its own browser’s page. So it declines, and the stub arrives with its half but no stamp. Press the buttons to play agent and attacker yourself, in any order.',
    });
    await this.play(machine.replay(story.slice(k + 3, k + 4)));
  }
}
