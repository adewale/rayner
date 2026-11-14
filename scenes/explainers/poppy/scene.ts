import { AnimationGroup, Scene } from '../../../src/index.ts';
import { answerOf, isRefusal, settingsOf, stage, Machine, view } from '../../../explain/index.ts';
import type { ExplainerMeta, Setting, Transition } from '../../../explain/index.ts';
import { beats, flight, pass } from '../lib/poppy-kit.ts';
import { POPPY_EVENTS, STORY, next, start } from './model.ts';
import type { PoppyEvent, Scope, World } from './model.ts';
import { DOCUMENT_ROUTE, LANES, LANE_Y, PALETTE, SEAL_AT, THIEF_FROM, documentToken, drawWorld, keyRoute, routeOf, sayWorld } from './picture.ts';
import type { Lane } from './picture.ts';

/** What lights up before a ticket or a key sets off: the lanes' lines and names. */
const LEAD = LANES.flatMap((name) => [`lane:${name}:line`, `lane:${name}:name`]);
/** What belongs to the last event, and goes before the next one moves: the ticket, the barrier, the answer, the step's object, the closed door. */
const FRESH = ['answer:', 'ticket', 'barrier', 'exhibit:', 'door:'];
/** A ticket travels as a token half its size, under the lane names, and gives way to the full ticket where it lands. */
const TOKEN = { scale: 0.28 };
/** The lane whose level run is at this height. */
const laneOf = (y: number): Lane => LANES.find((name) => Math.abs(LANE_Y[name] - y) < 0.01)!;

const APPROVALS: Record<string, readonly Scope[]> = { 'read-write': ['orders:read', 'orders:write'], 'read-only': ['orders:read'] };

// One errand, the jacket exchange of the specification's examples, as a machine: reading
// poppy.json, each request, sign-in and sign-out is an event of the model, the picture is a view of
// its state, and the last step is live. The story is the model's STORY, replayed step by step.
//
// The motion is the explanation's, built with the series' kit (beats, flight, pass): poppy.json
// crosses from the Company to the agent before the lanes it lists are drawn; a request's lane lights,
// then its ticket is stamped at the agent's seal and travels the lane, and a refused one meets a
// barrier; the key comes to the agent from the Company's sign-in stop, where the User approved it,
// and goes back there at sign-out; a thief's ticket rises onto the lane from outside the agent's
// network. The answer appears only once the ticket has landed. Each is an authored transition, so
// a reader's own presses at the live step move as the story's do, and rayner check plays every one
// from every state.
export default class Poppy extends Scene<World, {}> {
  static meta = {
    sources: [
      'https://personalagentprotocol.org/docs/0.4/spec',
      'https://www.rfc-editor.org/rfc/rfc6749',
      'https://www.rfc-editor.org/rfc/rfc9449',
    ],
    claims: [
      { says: 'signs every request', test: 'model.test.ts: every request the agent sends carries a Session header' },
      { says: 'never grants account access', test: 'model.test.ts: a Session header never grants account access' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'approve',
      label: 'You approve',
      default: 'read-write',
      options: [
        { value: 'read-write', label: 'Read and write' },
        { value: 'read-only', label: 'Read only' },
      ],
    },
  ] satisfies readonly Setting[];
  override state = start(APPROVALS['read-write']!);

  override async construct() {
    const approves = APPROVALS[settingsOf(this).approve!]!, scopes = approves.join(' and ');
    // The world after each event of the story, from the model, so the words say what it computed.
    const after = STORY.reduce<World[]>((worlds, event) => {
      const world = next(worlds.at(-1)!, event);
      if (isRefusal(world)) throw new Error(`the story's ${event} is refused: ${world.reason}`);
      return [...worlds, world];
    }, [start(approves)]);
    const answered = (event: number) => {
      const last = after[event + 1]!.last;
      if (last?.kind !== 'request') throw new Error(`the story expected a request at event ${event}`);
      return last.answer;
    };
    const challenge = answered(4), both = answered(6), thief = answered(7);

    this.state = start(approves);
    // No heading on the stage: the picture takes the stage's full height, so its words read on a
    // phone; the page prints each step's title and line under the picture.
    const s = stage(this, { palette: { ...PALETTE }, heading: false });
    const world = view(this, (w) => drawWorld(w, s), { place: false });

    /** A request leaves the agent: its ticket appears on the agent's seal, follows its lane and stops where it rests. */
    const request = (t: Transition<World, PoppyEvent>) => {
      const c = t.choreograph(world), lane = laneOf(c.to('ticket').center()[1]!);
      return beats(c, flight(c, 'ticket', [SEAL_AT, ...routeOf(lane).slice(1, 3)], TOKEN), { then: ['barrier'], lead: LEAD, fresh: FRESH });
    };
    const machine = new Machine<World, PoppyEvent>(this, {
      start: start(approves),
      events: POPPY_EVENTS,
      labels: {
        discover: 'Read poppy.json', cart: 'Add to cart', browse: 'Browse the site', chat: 'Ask about sizes',
        exchange: 'Exchange the jacket', 'sign-in': 'Sign in', thief: 'Thief replays the token', 'sign-out': 'Sign out',
      },
      next,
      views: [world],
      runTime: ({ event }) => (event === 'sign-out' ? 1.6 : event === 'discover' ? 2.4 : 2.1),
      transition: {
        // poppy.json crosses from the Company to the agent, and then the lanes it lists are drawn.
        discover: (t) => {
          const c = t.choreograph(world);
          return beats(c, () => {
            const lanes = LANES.map((name) => c.enter(`lane:${name}:line`, { create: true }, { runTime: 0.6 }));
            return [...pass(c, 'document', documentToken(s), DOCUMENT_ROUTE), new AnimationGroup(lanes)];
          }, { fresh: FRESH });
        },
        cart: request,
        browse: request,
        chat: request,
        exchange: request,
        // The key comes to the agent from the Company's counter, where the User approved it, along the sign-in lane.
        'sign-in': (t) => {
          const c = t.choreograph(world);
          return beats(c, flight(c, 'agent:key', keyRoute().slice(0, -1), { scale: 0.5 }), { lead: LEAD, fresh: FRESH });
        },
        // A thief's ticket comes from under the map, not from the agent, and stops where the Company refuses it.
        thief: (t) => {
          const c = t.choreograph(world);
          return beats(c, flight(c, 'ticket', [THIEF_FROM], TOKEN), { then: ['barrier'], lead: LEAD, fresh: FRESH });
        },
        // The key goes back the way it came, to the Company's sign-in stop, and is gone.
        'sign-out': (t) => {
          const c = t.choreograph(world);
          return beats(c, () => {
            const back = pass(c, 'agent:key:return', c.from('agent:key').copy().scale(0.5), [...keyRoute()].reverse(), { appear: 0.2, move: 0.9, leave: 0.25 });
            return [new AnimationGroup([c.leave('agent:key', { runTime: 0.2 }), back[0]!]), ...back.slice(1)];
          }, { lead: LEAD, fresh: FRESH });
        },
      },
    });

    await this.step('errand', {
      title: 'A stranger at the shop’s door',
      line: 'Predict: what should the shop ask this agent first?',
      caption:
        'You ask your personal AI agent to exchange a jacket at example.com. The shop has never met this agent, and the agent has no way in yet. It could borrow your password and pass as you, or arrive as an anonymous bot and be turned away. Poppy, the Personal Agent Protocol, is a third way. What would you want the shop to ask first?',
    });
    await s.enter(world, { describe: () => sayWorld(this.state) });

    await this.step('discover', {
      title: 'First, the shop says how to reach it',
      line: 'One file lists the ways in.',
      caption:
        'The agent fetches example.com/.well-known/poppy.json. The file lists the ways in: the shop’s APIs, its website, its own agent to chat with, and the page where sign-in happens. The agent checks that the file speaks for the domain that served it, so a copy on another site cannot send it elsewhere. Four lanes now run between the agent and the Company, as Poppy calls the shop.',
    });
    await this.play(machine.replay(STORY.slice(0, 1)));

    await this.step('seal', {
      title: 'The agent seals what it sends',
      line: 'The seal says which agent is asking, and for which User.',
      caption: `The agent adds a medium to the cart. The request carries a Session header, drawn as the wax seal, signed with the agent’s published keys. The Company now knows the agent, a User ID and a Session for the cart. The User ID is a pseudonym made for this Company, so the shop still does not know you. ${answerOf(this)}.`,
    });
    await this.play(machine.replay(STORY.slice(1, 2)));

    await this.step('lanes', {
      title: 'One Session, three lanes',
      line: 'The website and the chat join the same Session.',
      caption:
        'The same seal works on each lane. The agent’s browser joins the Session with a one-time code, so the website sees the same visitor and the same cart. In the chat, the Company’s own agent answers a question about sizes, and each message says whether a person or an AI wrote it. Look at what the Company knows: the Session has not changed.',
    });
    await this.play(machine.replay(STORY.slice(2, 4)));

    await this.step('challenge', {
      title: 'A seal is not a key',
      line: `Exchange refused: ${challenge.status}, it needs ${challenge.needs}.`,
      caption: `Now the errand itself. The exchange would change order 1042, so the request stops short of the Company: ${challenge.status}, naming the permission it needs, ${challenge.needs}. A Session header never grants account access, whatever it says. That takes a second proof, and the agent cannot make that one for itself.`,
    });
    await this.play(machine.replay(STORY.slice(4, 5)));

    await this.step('approve', {
      title: 'You hand over a key, not your password',
      line: 'Standard OAuth, on the Company’s own page.',
      caption: `The agent sends you to the Company’s sign-in page. You sign in there and approve ${scopes}. The Company gives the agent an access token, drawn as a key with one tooth for each scope you approved. Your password stays with you, and the Company can take this one key back without locking you out. Sign-in does not mention the Session: what the Company knows has not changed.`,
    });
    await this.play(machine.replay(STORY.slice(5, 6)));

    const made = both.status === 200;
    await this.step('both', {
      title: made ? 'Seal and key together' : 'A key cut for reading cannot exchange',
      line: made ? `${both.status}: the exchange is made.` : `${both.status}: the key lacks ${both.needs}.`,
      caption: `The same request now carries both, and the Company joins them: this Session may act on your account, within ${scopes}. ${
        made
          ? 'The exchange is made. The seal also covers the key, so the Company can tell that the agent holding the key is the agent that signed.'
          : `That does not cover an exchange, so the answer is ${both.status}, naming ${both.needs}. The Company grants no scope beyond what you approved, so the agent has to ask you again. Switch “You approve” to see the exchange go through.`
      }`,
    });
    await this.play(machine.replay(STORY.slice(6, 7)));

    await this.step('thief', {
      title: 'A stolen key will not turn',
      line: `${thief.status} ${thief.error}: the key belongs to another seal.`,
      caption: `Suppose a thief copies the key. It has to send it under a seal of its own, and the Company sees a key issued to agent.example arriving under another agent’s seal: ${thief.status} ${thief.error}. What the Company knows does not change. A whole request copied in transit could be replayed to the same address for a short time, which is why the agent signs a fresh seal for each request.`,
    });
    await this.play(machine.replay(STORY.slice(7, 8)));

    await this.step('sign-out', {
      title: 'Take the key back, keep the Session',
      line: 'Now drive it yourself: a refused press says why.',
      caption:
        'The agent gives up its token, and account access ends. The Session carries on, with the same User ID and the same cart. Press the events to drive the protocol yourself, and read why a refused press is refused. One limit: Poppy binds agents that choose to follow it. An agent that types your password into the website looks like you, and the Company cannot tell.',
    });
    await this.play(machine.replay(STORY.slice(8, 9)));
  }
}
