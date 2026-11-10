import { AnimationGroup, Scene, Text } from '../../../src/index.ts';
import { answerOf, isRefusal, settingsOf, stage, Machine, view } from '../../../explain/index.ts';
import type { Choreography, ExplainerMeta, Setting, Transition } from '../../../explain/index.ts';
import { beats, flight, pass, route } from '../lib/poppy-kit.ts';
import type { Beat } from '../lib/poppy-kit.ts';
import { CARDS, SIGN_IN_EVENTS, STORY, next, start } from './model.ts';
import type { Flow, SignInEvent, World } from './model.ts';
import {
  ADDRESS_AT, DESK, PALETTE, THIEF_AT,
  codeToken, drawWorld, requestToken, sayWorld,
} from './picture.ts';
import type { Shown } from './picture.ts';

/** Parts that belong to the last event: they go before the next event's motion. */
const FRESH = ['answer:', 'trick', 'barrier', 'thief', 'page:hint', 'page:by', 'page:password', 'sees', 'agent:password'];
/** You and the agent, who change places when a page opens or closes. */
const PEOPLE = ['agent:', 'tag', 'you'];
/** The Company's page, which opens after the request reaches it. */
const PAGE = ['window:frame', 'window:host', 'window:page', 'page:title', 'page:field', 'page:hint', 'page:orders:read:box', 'page:orders:read:line', 'page:orders:write:box', 'page:orders:write:line'];

// Signing in, as a machine: each step of Direct or Device Sign-In, a trick, a thief, sign-out and
// disconnecting are events of the tested model; the picture is a view of its state; the last step
// is live. The setting picks the sign-in type, and the story is the model's STORY for it.
//
// The motion carries the explanation. An authorization request leaves the agent's seal and reaches
// your window's address bar before the Company's page opens; your password card goes from your hand
// into the page and nowhere else; a code comes out of the page to the agent, and with the agent's
// signature to the counter's desk, and the key and the tag come back from there; a poll runs to the
// desk and back; a swapped code and a thief's copy come from outside, not from the page or the agent,
// and stop before a barrier or apart; at sign-out the tag goes back to the desk.
export default class SignIn extends Scene<World, Shown> {
  static meta = {
    sources: [
      'https://personalagentprotocol.org/docs/0.4/spec',
      'https://www.rfc-editor.org/rfc/rfc6749',
      'https://www.rfc-editor.org/rfc/rfc7636',
      'https://www.rfc-editor.org/rfc/rfc8628',
      'https://www.rfc-editor.org/rfc/rfc9207',
    ],
    claims: [
      { says: 'revokes every refresh token', test: 'model.test.ts: 5.5: sign-out revokes every refresh token' },
      { says: 'it can only block it entirely', test: 'model.test.ts: 10.5: through sign-in the Company sees the agent' },
      { says: 'could only have been blocked', test: 'model.test.ts: 10.5: through sign-in the Company sees the agent' },
      { says: 'only the agent can finish this sign-in', test: 'model.test.ts: 4.2: a code is redeemed once, by the agent it was issued to' },
      { says: 'only the agent can redeem', test: 'model.test.ts: 4.2: a code is redeemed once, by the agent it was issued to' },
      { says: 'can sign only as itself', test: 'model.test.ts: 4.4: a copied refresh token is useless without the agent’s client assertion' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'flow',
      label: 'Sign in with',
      default: 'direct',
      options: [
        { value: 'direct', label: 'Direct Sign-In' },
        { value: 'device', label: 'Device Sign-In' },
      ],
    },
  ] satisfies readonly Setting[];
  override state = start('direct');
  override shown: Shown = { password: true };

  override async construct() {
    const flow = settingsOf(this).flow as Flow, device = flow === 'device', story = STORY[flow];
    // The world after each event of the story, from the model, so the words say what it computed.
    const after = story.reduce<World[]>((worlds, event) => {
      const world = next(worlds.at(-1)!, event);
      if (isRefusal(world)) throw new Error(`the story's ${event} is refused: ${world.reason}`);
      return [...worlds, world];
    }, [start(flow)]);
    const at = (i: number) => after[i + 1]!.last!;
    const trick = at(story.indexOf('trick')), thief = at(story.indexOf('thief'));
    if (trick.kind !== 'trick' || thief.kind !== 'thief') throw new Error('the story expected a trick and a thief');
    const firstKey = at(story.indexOf('collect', story.indexOf('approve-read')));
    if (firstKey.kind !== 'tokens') throw new Error('the story expected tokens');

    this.state = start(flow);
    this.shown = { password: true };
    const s = stage(this, { palette: { ...PALETTE }, heading: false });
    const world = view(this, (w, shown) => drawWorld(w, shown, s), { place: false });

    type Pt = [number, number];
    type C = Choreography;
    /** The page's parts the target has, to open after the request lands. */
    const pageIn = (c: C) => PAGE.filter((k) => c.has(k, 'to') && !c.has(k, 'from'));
    const centre = (c: C, k: string, side: 'from' | 'to') => (side === 'from' ? c.from(k) : c.to(k)).center() as Pt;
    /**
     * Routes for the small tokens that cross the agent's side: out of the seal, along the gap between
     * the strip and the keyring (y LANE), then up to the address bar or across to the counter's desk,
     * so they pass over no label on the way.
     */
    const LANE = -1.62, FACE_LEFT = DESK[0] - 2.2;
    const toDesk = (seal: Pt): Pt[] => [seal, [seal[0] + 0.55, LANE], [DESK[0] - 0.4, LANE], DESK];
    const toAddress = (seal: Pt): Pt[] => [seal, [seal[0] + 0.55, LANE], [-3.9, LANE], [-3.9, ADDRESS_AT[1]], ADDRESS_AT];
    const request = () => requestToken(s).scale(0.55);
    const code = () => codeToken(s).scale(0.6);
    /** A part's flight that, unlike the kit's, leaves the current part alone (the caller has faded it already). */
    const fly = (c: C, k: string, via: Pt[], times = { appear: 0.25, move: 0.6, leave: 0.25 }): Beat[] => {
      const part = c.to(k), walk = c.travel(`${k}:flight`, part.copy(), route(via[0]!, ...via.slice(1), part.center() as Pt), times);
      return [walk.appear, walk.move, new AnimationGroup([walk.leave, c.enter(k, {}, { runTime: times.leave })])];
    };

    /**
     * The parts of you and the agent that a new layout puts elsewhere (the page opening or closing):
     * they fade out where they were and fade in where they will be, rather than slide, since the
     * move says nothing about the protocol. `except` are parts a flight carries instead.
     */
    const relaid = (c: C, except: readonly string[] = []) => c.keys('from').filter((k) => {
      if (!PEOPLE.some((p) => k.startsWith(p)) || !c.has(k, 'to') || except.includes(k)) return false;
      const a = c.from(k), b = c.to(k), [ax, ay] = a.center(), [bx, by] = b.center();
      return Math.hypot(ax! - bx!, ay! - by!) > 0.05 || Math.abs(a.width() - b.width()) > 0.05;
    });
    const fadeOut = (c: C, keys: readonly string[]) => keys.map((k) => c.leave(k, { runTime: 0.3 }));
    const fadeIn = (c: C, keys: readonly string[]) => keys.map((k) => c.enter(k, {}, { runTime: 0.3 }));
    const transition = {
      // You and the agent take your places by the page (a cross-fade); the request leaves the agent's seal; the page opens.
      ask: (t: Transition<World, SignInEvent>) => {
        const c = t.choreograph(world), seal = centre(c, 'agent:seal', 'to'), moved = relaid(c);
        // A page of another shape (step 1's website before the phone) goes first, so nothing fades in over it.
        const stale = c.keys('from').filter((k) => (k.startsWith('window:') || k.startsWith('page:')) && !FRESH.some((f) => k.startsWith(f))
          && (!c.has(k, 'to') || (!(c.from(k) instanceof Text) && Math.abs(c.from(k).width() - c.to(k).width()) > 0.05)));
        const reopen = stale.filter((k) => c.has(k, 'to'));
        const swap = (): Beat[] => [new AnimationGroup([...fadeOut(c, moved), ...fadeOut(c, stale)]), ...(moved.length ? [new AnimationGroup(fadeIn(c, moved))] : [])];
        const opens = pageIn(c), frame = (): Beat[] => (reopen.length ? [new AnimationGroup(fadeIn(c, reopen))] : []);
        if (device)
          return beats(c, () => [...swap(), ...pass(c, 'request', request(), toDesk(seal), { appear: 0.25, move: 0.6, leave: 0.25 }), ...fly(c, 'card', [seal]), ...frame()], { fresh: FRESH, then: opens });
        return beats(c, () => [...swap(), ...pass(c, 'request', request(), toAddress(seal), { appear: 0.25, move: 0.9, leave: 0.25 }), ...frame()], { fresh: FRESH, then: opens });
      },
      'approve-all': (t: Transition<World, SignInEvent>) => approve(t),
      'approve-read': (t: Transition<World, SignInEvent>) => approve(t),
      // A code comes out of the page to the agent, and with its signature to the desk (or a poll goes there);
      // then the page closes, the agent takes the top, and the key and the tag come to it from the desk.
      collect: (t: Transition<World, SignInEvent>) => {
        const c = t.choreograph(world), got = t.after.last?.kind === 'tokens', seal = centre(c, 'agent:seal', 'from');
        // Direct: the code drops out of the bottom of the page to the agent's side and runs on, under the
        // agent's signature, to the desk. Device: a poll runs to the desk. If tokens come back, the page
        // closes and the layout cross-fades (an old key and tag fade with it: they are replaced), then the
        // key comes from the desk to the agent's ring, and the tag after it.
        const low = (p: Pt): Pt[] => [p, [p[0] + 0.9, p[1]], [DESK[0] - 0.4, p[1]], DESK];
        const poll = (p: Pt) => (c.has('card', 'from') ? low(p) : toDesk(p));
        const route: Pt[] = device ? poll(seal) : [[-2.4, -0.62], [-3.9, LANE], [seal[0] + 0.55, LANE], [DESK[0] - 0.4, LANE], DESK];
        return beats(c, () => {
          const run = pass(c, device ? 'poll' : 'code', device ? request() : code(), route, { appear: 0.25, move: device ? 0.6 : 0.9, leave: 0.25 });
          if (!got) return [...run, ...pass(c, 'poll:back', request(), [...poll(seal)].reverse(), { appear: 0.25, move: 0.5, leave: 0.25 })];
          const closing = c.keys('from').filter((k) => (k.startsWith('page:') || k.startsWith('window:')) && !c.has(k, 'to'));
          const moved = relaid(c, ['agent:key', 'tag']);
          const old = ['agent:key', 'tag'].filter((k) => c.has(k, 'from'));
          const out: Pt = [FACE_LEFT, DESK[1]];
          const gone = new AnimationGroup([run[2]!, ...fadeOut(c, [...closing, ...moved, ...old])]);
          const key = fly(c, 'agent:key', [out]), tag = fly(c, 'tag', [out]);
          return [
            run[0]!, run[1]!, gone,
            new AnimationGroup([...fadeIn(c, moved), key[0]!]),
            key[1]!, new AnimationGroup([key[2]!, tag[0]!]), tag[1]!, tag[2]!,
          ];
        }, { fresh: FRESH, then: got ? ['tag:cord'].filter((k) => c.has(k, 'to') && !c.has(k, 'from')) : [] });
      },
      trick: (t: Transition<World, SignInEvent>) => {
        const c = t.choreograph(world);
        return beats(c, flight(c, 'trick', [[-1.4, -4.6]], { move: 0.8 }), { fresh: FRESH, then: ['barrier'] });
      },
      thief: (t: Transition<World, SignInEvent>) => {
        const c = t.choreograph(world);
        return beats(c, flight(c, 'thief', [[THIEF_AT[0], -4.6]], { move: 0.7 }), { fresh: FRESH });
      },
      'sign-out': (t: Transition<World, SignInEvent>) => giveBack(t),
      disconnect: (t: Transition<World, SignInEvent>) => giveBack(t),
    };
    /** Your password goes from your hand straight into the page; then the boxes you tick are ticked. */
    const approve = (t: Transition<World, SignInEvent>) => {
      const c = t.choreograph(world), from = centre(c, 'you:password', 'from'), to = centre(c, 'page:password', 'to');
      return beats(c, () => {
        // Round the page's lines, not over them: out to the right of the window, up, and into the field.
        const side = device ? [from, to] as Pt[] : [from, [-2.05, from[1]], [-2.05, to[1]], to] as Pt[];
        const card = pass(c, 'password:travel', c.from('you:password').copy(), side, { appear: 0.2, move: 0.9, leave: 0.25 });
        return [new AnimationGroup([c.leave('you:password', { runTime: 0.2 }), card[0]!]), card[1]!, new AnimationGroup([card[2]!, c.enter('page:password', {}, { runTime: 0.25 })])];
      }, { fresh: FRESH, then: ['page:orders:read:box', 'page:orders:write:box'] });
    };
    /** The tag goes back to the Company's desk, and the key with it. */
    const giveBack = (t: Transition<World, SignInEvent>) => {
      const c = t.choreograph(world), from = centre(c, 'tag', 'from');
      return beats(c, () => {
        const back = pass(c, 'tag:return', c.from('tag').copy(), [from, [from[0] + 0.8, DESK[1]], DESK], { appear: 0.2, move: 0.8 });
        return [new AnimationGroup([c.leave('tag', { runTime: 0.2 }), back[0]!]), ...back.slice(1)];
      }, { fresh: FRESH });
    };

    const machine = new Machine<World, SignInEvent>(this, {
      start: start(flow),
      events: SIGN_IN_EVENTS,
      labels: {
        ask: 'Agent asks to sign in', 'approve-all': 'Approve both', 'approve-read': 'Approve reading only',
        collect: device ? 'Agent polls' : 'Code comes back', trick: device ? 'Offer a lookalike link' : 'Swap in another sign-in',
        thief: 'Thief copies the tag', 'sign-out': 'Sign out', disconnect: 'Disconnect in settings',
      },
      next,
      views: [world],
      runTime: ({ event, after: a }) => (event === 'collect' ? (a.last?.kind === 'tokens' ? 3.4 : 1.8) : event === 'ask' ? 2.6 : 1.6),
      transition,
    });
    const replay = (from: number, to: number) => machine.replay(story.slice(from, to));
    const idx = (event: SignInEvent, from = 0) => story.indexOf(event, from);

    await this.step('password', {
      title: 'The shortcut: hand over your password',
      line: 'Predict: what can the Company do if it misbehaves?',
      caption:
        'You want your agent to exchange a jacket at example.com, and that needs your account. The quick way is to give the agent your password and let it sign in on the website as you. Then the Company sees you, not an agent. It cannot limit what the agent does, and if the agent misbehaves, it can only block it entirely. Poppy’s sign-in is there so the agent does not need your password.',
    });
    await s.enter(world, { describe: () => sayWorld(this.state, this.shown) });

    const asked = device ? idx('approve-read') : 1;
    await this.step('ask', device
      ? {
          title: 'The agent shows you a code',
          line: 'It checks the link is the Company’s first.',
          caption:
            'Poppy’s way is OAuth. The agent asks example.com for a sign-in code for the two scopes the exchange needs, orders:read and orders:write, and not addresses. It shows you the code, with a link it has checked is on the Company’s own host, and the Company’s name and domain beside it. Then it polls the Company, five seconds apart, as the Company asked. Until you answer, each poll gets authorization_pending.',
        }
      : {
          title: 'The agent opens the Company’s own page',
          line: 'It asks for two scopes, and nothing more.',
          caption:
            'Poppy’s way is OAuth. The agent opens example.com’s sign-in page in your browser and asks for the two scopes the exchange needs, orders:read and orders:write, and not addresses. The Company describes each scope and warns that orders:write makes changes that can’t be undone. The request also carries a fingerprint of a secret the agent keeps, its PKCE verifier, so only the agent can finish this sign-in.',
        });
    this.shown = { password: false };
    await this.play(replay(0, asked));

    await this.step('approve', {
      title: 'You sign in there, and approve less',
      line: 'Your password goes to the Company, and no further.',
      caption: `You sign in on the Company’s page, with your password or however example.com allows${device ? ', on your phone; opening the link approves nothing by itself' : ''}. You tick orders:read, to look first, and leave orders:write. You may approve fewer scopes than the agent asked for. That is the whole idea: ${answerOf(this)}.`,
    });
    await this.play(replay(asked, asked + 1));

    const trickStep = async () => {
      await this.step('check', device
        ? {
            title: 'A link to another Company stays hidden',
            line: 'Its host is not the Company’s, so you don’t see it.',
            caption:
              'Device Sign-In is the easier one to phish: whoever holds the device code gets the tokens, and you approve on a page the agent cannot see. Suppose the agent were handed a link to auth.shoes.example. You would approve a sign-in at shoes.example for the Company that asked. So before it shows a link, the agent checks the host. This one is neither auth.example.com nor example.com, nor below either.',
          }
        : {
            title: 'A code from another Company is refused',
            line: 'Its iss names shoes.example, so the agent drops it.',
            caption:
              'Before your answer comes back, a response arrives at the agent’s address from another Company’s sign-in, with a code in it. Each response names the Company that sent it, in a field called iss, and the agent compares it with the Company it started with: auth.shoes.example is not auth.example.com. The agent rejects it, and what it holds does not change. That keeps another sign-in from being swapped in.',
          });
      await this.play(replay(idx('trick'), idx('trick') + 1));
    };
    const keyStep = async () => {
      const first = idx('collect', idx('approve-read'));
      await this.step('key', device
        ? {
            title: 'The next poll brings a key with one tooth',
            line: `scope: ${firstKey.granted.join(' ')}, less than it asked for.`,
            caption: `The agent’s next poll, signed with its client assertion, returns a key cut with one tooth, for ${firstKey.granted.join(' ')}, and a refresh token, the tag that brings new keys later without asking you. No code passed through your phone to the agent. The response’s scope says ${firstKey.granted.join(' ')}, so the agent knows it got less than it asked for.`,
          }
        : {
            title: 'A one-time code only the agent can redeem',
            line: `The key comes back with one tooth: ${firstKey.granted.join(' ')}.`,
            caption: `Your browser returns to the agent’s own address with a one-time code. The Company sends codes to an address the agent registered, matched exactly, and to nowhere else. The agent takes the code to the Company with its signed client assertion and its PKCE verifier, which must match the fingerprint. Back comes a key cut with one tooth, for ${firstKey.granted.join(' ')}, and a tag that brings new keys.`,
          });
      await this.play(replay(device ? first : idx('trick') + 1, first + 1));
    };
    if (device) { await keyStep(); await trickStep(); } else { await trickStep(); await keyStep(); }

    const again = story.lastIndexOf('ask');
    await this.step('reask', {
      title: 'To do more, ask for everything again',
      line: 'Both scopes asked again; the old tag still works.',
      caption:
        'The response said orders:read, so the exchange is out of reach. The agent asks you again, and asks for orders:read and orders:write, everything it still needs, not just the missing scope. This time you approve both. Until the new sign-in finishes, the agent keeps the key and tag it has: a sign-in that is pending, or fails, changes nothing it holds.',
    });
    await this.play(replay(again, again + 2));

    await this.step('replace', {
      title: 'The new tag replaces the old',
      line: `${CARDS[1]} replaces ${CARDS[0]}, which is not sign-out.`,
      caption: `The new key has two teeth, one for each scope you approved, and it comes with a new refresh token, ${CARDS[1]}. The new tag replaces the old one, which the agent revokes. Revoking a replaced token does not sign you out: the account stays signed in through the new one.`,
    });
    await this.play(replay(again + 2, again + 3));

    await this.step('thief', {
      title: 'A copied tag opens nothing',
      line: `${thief.error}: the tag was issued to agent.example.`,
      caption: `A refresh token isn’t tied to a Session: any of your Sessions can use the keys it brings. That makes a copy worth stealing, so the Company accepts a refresh token with a client assertion from the agent it was issued to, and refuses it otherwise. A thief can sign only as itself, and gets ${thief.error}.`,
    });
    await this.play(replay(idx('thief'), idx('thief') + 1));

    await this.step('sign-out', {
      title: 'Take the access back, keep your password',
      line: 'Now drive it: a refused press says why.',
      caption:
        'To sign out, the agent revokes every refresh token it holds for your account, and its Session carries on signed out, cart and all. You could instead disconnect the agent in your account settings and keep your account. An agent with your password could only have been blocked. A second account would get its own Session. Press the events to sign in again, approve less or more, or try the trick.',
    });
    await this.play(replay(idx('sign-out'), idx('sign-out') + 1));
  }
}
