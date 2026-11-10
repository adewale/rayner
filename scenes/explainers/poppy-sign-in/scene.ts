import { AnimationGroup, Scene } from '../../../src/index.ts';
import { answerOf, isRefusal, settingsOf, stage, Machine, view } from '../../../explain/index.ts';
import type { ExplainerMeta, Setting, Transition } from '../../../explain/index.ts';
import { beats, flight, pass } from '../lib/poppy-kit.ts';
import type { Beat } from '../lib/poppy-kit.ts';
import { CARDS, SIGN_IN_EVENTS, STORY, next, start } from './model.ts';
import type { Flow, SignInEvent, World } from './model.ts';
import {
  ADDRESS_AT, DESK, KEY_AT, PAGE_OUT, PALETTE, PASSWORD_AT, SEAL_AT, SLIP_AT, TAG_AT, THIEF_AT,
  codeToken, drawWorld, requestToken, sayWorld,
} from './picture.ts';
import type { Shown } from './picture.ts';

/** Parts that belong to the last event: they go before the next event's motion. */
const FRESH = ['answer:', 'trick', 'barrier', 'thief'];
/** The Company's page, which opens after the request reaches it. */
const PAGE = ['window:page', 'page:title', 'page:field', 'page:hint', 'page:orders:read:box', 'page:orders:read:line', 'page:orders:write:box', 'page:orders:write:line'];

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

    /** The page's parts the target has, to open after the request lands. */
    const pageIn = (c: { has(k: string, side?: 'from' | 'to'): boolean }) => PAGE.filter((k) => c.has(k, 'to'));
    const transition = {
      ask: (t: Transition<World, SignInEvent>) => {
        const c = t.choreograph(world);
        if (device)
          return beats(c, () => [...pass(c, 'request', requestToken(s), [SEAL_AT, [SEAL_AT[0] + 1.2, DESK[1]], DESK], { move: 0.7 }), ...flight(c, 'card', [DESK, [SLIP_AT[0] + 1.6, SLIP_AT[1]]], { move: 0.6 })()], { fresh: FRESH, then: pageIn(c) });
        return beats(c, () => pass(c, 'request', requestToken(s), [SEAL_AT, [-4.6, -1.7], [-4.6, ADDRESS_AT[1]], ADDRESS_AT], { move: 1.0 }), { fresh: FRESH, then: [...pageIn(c), 'page:closed'] });
      },
      'approve-all': (t: Transition<World, SignInEvent>) => approve(t),
      'approve-read': (t: Transition<World, SignInEvent>) => approve(t),
      collect: (t: Transition<World, SignInEvent>) => {
        const c = t.choreograph(world), got = t.after.last?.kind === 'tokens';
        const toDesk: [number, number][] = [SEAL_AT, [SEAL_AT[0] + 1.2, DESK[1]], DESK];
        return beats(c, () => {
          const steps: Beat[] = [];
          if (device) steps.push(...pass(c, 'poll', requestToken(s), toDesk, { move: 0.6 }));
          else steps.push(...pass(c, 'code', codeToken(s), [PAGE_OUT, SLIP_AT, SEAL_AT], { move: 0.8 }), ...pass(c, 'redeem', codeToken(s), toDesk, { move: 0.6 }));
          if (!got) steps.push(...pass(c, 'poll:back', requestToken(s), [...toDesk].reverse(), { move: 0.5 }));
          else steps.push(...flight(c, 'agent:key', [DESK, [KEY_AT[0] + 1.6, KEY_AT[1]]], { move: 0.7 })(), ...flight(c, 'tag', [DESK], { move: 0.5 })());
          return steps;
        }, { fresh: FRESH, then: got ? ['tag:cord', 'tag:label', 'rack:orders:read:tooth', 'rack:orders:write:tooth'].filter((k) => c.has(k, 'to') && !c.has(k, 'from')) : [] });
      },
      trick: (t: Transition<World, SignInEvent>) => {
        const c = t.choreograph(world);
        return beats(c, flight(c, 'trick', [[SLIP_AT[0] + 1.5, -4.6]], { move: 0.8 }), { fresh: FRESH, then: ['barrier'] });
      },
      thief: (t: Transition<World, SignInEvent>) => {
        const c = t.choreograph(world);
        return beats(c, flight(c, 'thief', [[THIEF_AT[0], -4.6]], { move: 0.7 }), { fresh: FRESH });
      },
      'sign-out': (t: Transition<World, SignInEvent>) => giveBack(t),
      disconnect: (t: Transition<World, SignInEvent>) => giveBack(t),
    };
    /** Your password goes from your hand into the page; then the boxes you tick are ticked. */
    const approve = (t: Transition<World, SignInEvent>) => {
      const c = t.choreograph(world);
      return beats(c, flight(c, 'page:password', [PASSWORD_AT], { move: 0.7 }), { fresh: FRESH, then: ['page:orders:read:box', 'page:orders:write:box'] });
    };
    /** The tag goes back to the Company's desk, and the key with it. */
    const giveBack = (t: Transition<World, SignInEvent>) => {
      const c = t.choreograph(world);
      return beats(c, () => {
        const back = pass(c, 'tag:return', c.from('tag').copy(), [TAG_AT, [TAG_AT[0] + 1.5, DESK[1]], DESK], { appear: 0.2, move: 0.8 });
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
      runTime: ({ event, after: a }) => (event === 'collect' ? (a.last?.kind === 'tokens' ? 3.4 : 1.8) : event === 'ask' ? 2.2 : 1.6),
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
            'Poppy’s way is OAuth. The agent asks example.com for a sign-in code for the two scopes the exchange needs, orders:read and orders:write, and not addresses. It shows you the code, with a link it has checked is on the Company’s own host, and the Company’s name and domain beside it. Then it polls the Company every few seconds. Until you answer, each poll gets authorization_pending.',
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
      line: `Both scopes asked again; ${CARDS[1]} replaces ${CARDS[0]}.`,
      caption:
        'The response said orders:read, so the exchange is out of reach. The agent asks again, for orders:read and orders:write, everything it still needs, not just the missing scope. You approve both. The new key has two teeth, and the new refresh token replaces the old one, which the agent revokes. Revoking a replaced token does not sign you out.',
    });
    await this.play(replay(again, again + 3));

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
