import { Scene, linear } from '../../../src/index.ts';
import { answerOf, isRefusal, stage, Machine, view } from '../../../explain/index.ts';
import type { ExplainerMeta, Transition } from '../../../explain/index.ts';
import { beats, flight, pass, seal } from '../lib/poppy-kit.ts';
import type { Beat } from '../lib/poppy-kit.ts';
import { REFUSAL_EVENTS, STORY, next, start, temptation } from './model.ts';
import type { RefusalEvent, World } from './model.ts';
import {
  DELEGATION_ROUTE, FIX_NAME, MCP_KEY_AT, PALETTE, RAIL,
  delegationToken, documentRoute, launchAt, documentToken, drawWorld, keyRoute, laneOfWorld, paceClock, sayWorld,
} from './picture.ts';
import type { Shown } from './picture.ts';

/** What lights up before a ticket or a key sets off: the lanes' lines and names. */
const LANE_PARTS = ['api', 'mcp'].flatMap((name) => [`lane:${name}:line`, `lane:${name}:name`, `lane:${name}:plate`, `lane:${name}:stop`]);
/** The remedy rail's objects and names, which light (or dim) before anything travels. */
const RAIL_PARTS = RAIL.flatMap((fix) => [`rail:${fix}`, `rail:${fix}:name`]);
/** The rail's marks of the last answer, which go before a new request sets off. */
const RAIL_MARKS = RAIL.flatMap((fix) => [`rail:${fix}:mark`, `rail:${fix}:strike`]);

// The errand of chapter 1, broken seven ways, as a machine. A trouble sends the jacket exchange (or
// the MCP sizing call) and the Company refuses it with a slip; "Agent answers" applies the one
// remedy section 7's error table names, and sends the request again. The story replays the model's
// STORY two events at a time, and the last step is live: eight buttons, the seven troubles and the
// agent's answer.
//
// The motion is the explanation's, built with the kit (beats, flight, pass). A request's lane
// lights, its ticket is stamped at the agent's seal and travels the lane; a refused one meets a
// barrier and the slip appears only once it has landed. An answer lights its remedy on the rail
// first, then the remedy's product comes from where it really comes from (a key from the Company's
// sign-in stop, a delegation from the agent's own systems, a fresh poppy.json from the counter, a
// fresh seal pressed at the agent), and then the same request sets off again and docks.
export default class Refusals extends Scene<World, Shown> {
  static meta = {
    sources: [
      'https://personalagentprotocol.org/docs/0.4/spec',
      'https://www.rfc-editor.org/rfc/rfc6750',
      'https://www.rfc-editor.org/rfc/rfc8707',
      'https://www.rfc-editor.org/rfc/rfc9728',
      'https://www.rfc-editor.org/rfc/rfc6585',
    ],
    claims: [],
  } satisfies ExplainerMeta;
  override state = start();

  override async construct() {
    // The world after each event of the story, from the model, so the words say what it computed.
    const after = STORY.reduce<World[]>((worlds, event) => {
      const world = next(worlds.at(-1)!, event);
      if (isRefusal(world)) throw new Error(`the story's ${event} is refused: ${world.reason}`);
      return [...worlds, world];
    }, [start()]);
    /** The refusal of the story's trouble at `i` (an even index), and the world once the agent has answered it. */
    const pair = (i: number) => ({ refused: after[i + 1]!.last!.reply, answered: after[i + 2]!, tempting: temptation(after[i + 2]!)! });
    const expired = pair(0), scope = pair(2), seal_ = pair(4), ended = pair(6), version = pair(8), door = pair(10), pace = pair(12);

    this.state = start();
    this.shown = {};
    const s = stage(this, { palette: { ...PALETTE }, heading: false });
    const world = view(this, (w, sh) => drawWorld(w, sh, s), { place: false });
    const fresh = ['slip', 'ticket', 'barrier', 'outcome', 'panel', ...RAIL_MARKS];

    /** A request sets off: its lane lights, the ticket leaves the agent's seal along the lane, and a refused one meets the barrier. */
    const request = (t: Transition<World, RefusalEvent>) => {
      const c = t.choreograph(world), { y } = laneOfWorld(t.after);
      return beats(c, flight(c, 'ticket', [launchAt(y)]), { fresh, then: ['barrier'], lead: [...LANE_PARTS, ...RAIL_PARTS] });
    };
    /** The agent answers: the remedy lights on the rail, its product travels from where it comes from, then the request goes again and docks. */
    const answer = (t: Transition<World, RefusalEvent>) => {
      const c = t.choreograph(world), last = t.after.last!, { route, y } = laneOfWorld(t.after);
      const sendAgain = flight(c, 'ticket', [launchAt(y)], { move: 0.8 });
      const product = (): Beat[] => {
        switch (last.fix) {
          case 'refresh':
            return last.trouble === 'mcp'
              ? flight(c, 'agent:mcp-key', [[route.at(-1)![0], y], [MCP_KEY_AT[0] + 1.2, y], [MCP_KEY_AT[0] + 1.2, MCP_KEY_AT[1]]], { move: 0.9 })()
              : flight(c, 'agent:key', keyRoute(y).slice(0, -1), { move: 0.9 })();
          case 'sign-in':
            return flight(c, 'agent:key', keyRoute(y).slice(0, -1), { move: 0.9 })();
          case 'fix':
            return pass(c, 'delegation', delegationToken(s), DELEGATION_ROUTE, { move: 0.7 });
          case 'new-session':
            return pass(c, 'fresh-seal', seal(s, { r: 0.42 }), DELEGATION_ROUTE, { move: 0.7 });
          case 'reread':
            return pass(c, 'document', documentToken(s), documentRoute(y), { move: 0.8 });
          case 'wait':
            // Time passes: the Company's clock empties, one number followed from full to none, before the agent sends again.
            return [c.follow({ from: 1, to: 0, draw: (v: number) => [paceClock(s, v)] }, { targets: ['slip:clock'], runTime: 1.4, rateFunc: linear })];
          default:
            return [];
        }
      };
      return beats(c, () => [...product(), ...sendAgain()], { fresh: ['ticket', 'barrier', 'outcome', 'panel', 'slip:leader', 'slip:ring'], lead: RAIL_PARTS });
    };
    const machine = new Machine<World, RefusalEvent>(this, {
      start: start(),
      events: REFUSAL_EVENTS,
      labels: {
        expire: 'Token expires', 'read-only': 'Approve read only', delegation: 'Delegation expires', end: 'Session ends',
        'old-copy': 'Old poppy.json', 'too-fast': 'Send too fast', mcp: 'Ask the MCP server', answer: 'Agent answers',
      },
      next,
      views: [world],
      runTime: ({ event }) => (event === 'answer' ? 3.0 : 2.1),
      transition: {
        expire: request, 'read-only': request, delegation: request, end: request, 'old-copy': request, 'too-fast': request, mcp: request,
        answer,
      },
    });

    await this.step('turned-back', {
      title: 'Turned back at the counter',
      line: 'Predict: what should your agent do next?',
      caption: `Your agent sends the jacket exchange from chapter 1, with its seal and its key. This morning the Company turns the ticket back with a slip: ${expired.refused.status} ${expired.refused.error}, about the key. The key expired overnight. The agent could send it again, start a new Session, or ask you to sign in. Which would you do? The slip already says.`,
    });
    await s.enter(world, { describe: () => sayWorld(this.state, this.shown) });
    await this.play(machine.replay(STORY.slice(0, 1)));

    await this.step('slip', {
      title: 'The slip says what to bring',
      line: 'invalid_token: refresh the key, send it again.',
      caption: `The agent trades its refresh token for a new access token, without asking you, and sends the same request: ${expired.answered.last!.again!.status}, the exchange is made. ${answerOf(this)}. Had you disconnected the agent from your account, the refresh would fail, and the agent would carry on signed out.`,
    });
    await this.play(machine.replay(STORY.slice(1, 2)));

    await this.step('scope', {
      title: 'A key cut for reading',
      line: `${scope.refused.status} names the scope; you approve it again.`,
      caption: `Suppose you had approved only orders:read. The slip says ${scope.refused.status} ${scope.refused.error}, naming ${scope.refused.needs}. A refresh gives no more than you approved, so the agent asks you to sign in again, for orders:read and orders:write together. A 401 with no code, sent with no key at all, is handled the same way, unless you signed out: then the agent waits for you to ask.`,
    });
    await this.play(machine.replay(STORY.slice(2, 4)));

    await this.step('seal', {
      title: 'When the seal itself is wrong',
      line: `${seal_.refused.status} ${seal_.refused.error}: fix the cause. A new Session won’t.`,
      caption: `Now the number changes. The delegation that vouches for the agent’s signing key has expired, and the slip says ${seal_.refused.status} ${seal_.refused.error}, about the seal. A new Session would carry the same broken seal and be refused the same way. So the agent stops, gets a new delegation, signs again in the same Session, and sends. The cart is still there.`,
    });
    await this.play(machine.replay(STORY.slice(4, 6)));

    await this.step('why-400', {
      title: 'Why a seal’s error is not a 401',
      line: 'A 401 would make OAuth code discard a good key.',
      caption: 'OAuth libraries read a 401 as “this token is bad” and throw the token away. Had the Company answered the expired delegation with 401, the agent’s library would have discarded a key that was fine, and the agent would have refreshed, or asked you to sign in, for nothing. Poppy sends Session errors as 400, so the key stays where it is.',
    });
    this.shown = { whatIf: true };
    await this.play(world.sync({ runTime: 0.8 }));

    await this.step('ended', {
      title: 'The Session is over',
      line: `${ended.refused.error}: a new Session, and one more try.`,
      caption: `The Company has ended the Session the cart was in. The slip says ${ended.refused.status} ${ended.refused.error}, so the agent starts a new Session and sends the exchange again, once. The cart stays behind with the old Session. Had the new Session been refused the same way, the agent would have stopped there: without that rule, agent and Company could pass the request back and forth for ever.`,
    });
    this.shown = {};
    await this.play(machine.replay(STORY.slice(6, 8)));

    await this.step('version', {
      title: 'Same 400, a different move',
      line: `${version.refused.error}: read poppy.json again, then choose.`,
      caption: `Third 400, third remedy. The agent used an old copy of poppy.json and sent version 0.3, which the Company no longer serves. It fetches poppy.json again, uncached, chooses 0.4, and, since a Session keeps one version, starts a new Session and sends once more. The extensions a request declares work the same way: a 403 extension_required names the one missing. Read the code, not just the number.`,
    });
    await this.play(machine.replay(STORY.slice(8, 10)));

    await this.step('one-door', {
      title: 'A key cut for one door',
      line: 'The MCP server takes only keys issued for it.',
      caption: `A Company can list two kinds of API: an OpenAPI service and an MCP server. Both take the seal and the key. This MCP server accepts only tokens issued for it, so the everyday key comes back ${door.refused.status} ${door.refused.error}, with a link to the server’s metadata. The agent refreshes for a token whose resource is the server’s URL, and uses that token there and nowhere else.`,
    });
    await this.play(machine.replay(STORY.slice(10, 12)));

    await this.step('pace', {
      title: 'Slow down, then break it yourself',
      line: 'Break the errand, then predict how the agent answers.',
      caption: `Send too fast and the Company answers ${pace.refused.status} with Retry-After: ${pace.refused.retryAfter}. The key and the seal are fine, so the agent waits at least ${pace.refused.retryAfter} seconds and sends the same request. Now it is yours. Break the errand one of seven ways, say which remedy you expect, then press Agent answers. The rail shows the remedy, and why the tempting one, ${FIX_NAME[pace.tempting.fix]} here, would fail.`,
    });
    await this.play(machine.replay(STORY.slice(12, 14)));
  }
}
