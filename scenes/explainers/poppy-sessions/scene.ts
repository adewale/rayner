import { AnimationGroup, Scene } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { answerOf, isRefusal, settingsOf, stage, Machine, view } from '../../../explain/index.ts';
import type { ExplainerMeta, Setting, Transition } from '../../../explain/index.ts';
import { beats, flight } from '../lib/poppy-kit.ts';
import type { Beat } from '../lib/poppy-kit.ts';
import { OTHER_USER, STORY, TAMPERS, next, start } from './model.ts';
import type { Policy, SealWorld, Tamper, Verdict } from './model.ts';
import { ALL_SHOWN, PALETTE, SOURCE, drawWorld, punchOrder, sayWorld, sourceOf } from './picture.ts';
import type { Shown } from './picture.ts';

// What is inside the seal: the chain of vouching behind a Session header, and the claims inside
// it, each of which stops one copy. A machine of tampers: the reader holds the agent's genuine
// request and changes one thing at a time, and the Company checks it in the draft's order.
//
// The motion is the explanation's: a ticket comes from where it really comes from (pressed by the
// agent's die, raised from below as a copy, sent down from another Company), and then the Company
// punches it check by check, in the order 5.2 and 5.3 give: down the chain, then down the claims,
// until one check breaks. The answer appears only after the punching. Each tamper is an authored
// transition, so the reader's own presses move as the story's do.
export default class Sessions extends Scene<SealWorld, Shown> {
  static meta = {
    sources: [
      'https://personalagentprotocol.org/docs/0.4/spec',
      'https://www.rfc-editor.org/rfc/rfc9449',
      'https://www.rfc-editor.org/rfc/rfc7800',
    ],
    claims: [
      { says: 'never touches a request', test: 'model.test.ts: a header signed directly by a published key' },
      { says: 'every User ID its own delegated key', test: 'model.test.ts: one delegated key per User ID' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'company',
      label: 'The Company remembers',
      default: 'remembers',
      options: [
        { value: 'remembers', label: 'jtis and keys (optional)' },
        { value: 'required', label: 'nothing optional' },
      ],
    },
  ] satisfies readonly Setting[];
  override state = start('remembers');
  override shown: Shown = { links: 0 };

  override async construct() {
    const policy = settingsOf(this).company as Policy, remembers = policy === 'remembers';
    // The world after each tamper of the story, from the model, so the words say what it computed.
    const after = STORY.reduce<SealWorld[]>((worlds, t) => {
      const world = next(worlds.at(-1)!, t);
      if (isRefusal(world)) throw new Error(`the story's ${t} is refused: ${world.reason}`);
      return [...worlds, world];
    }, [start(policy)]);
    const verdict = (t: Tamper): Verdict => after[STORY.indexOf(t) + 1]!.last!.verdict;
    const sent = verdict('send'), url = verdict('url'), replay = verdict('replay'), leaked = verdict('other-user');

    this.state = start(policy);
    this.shown = { links: 0 };
    const s = stage(this, { palette: { ...PALETTE }, heading: false });
    const world = view(this, (w, shown) => drawWorld(w, shown, s), { place: false });

    /**
     * A tamper. If the seal was pressed by another hand than last time, that hand moves first: the
     * published key travels down to the wax, or back up to its place in the chain, and another
     * party's chain takes its colours. Then the ticket comes from its source, the validator stamps
     * when it arrived, and the Company punches it check by check, in the draft's order; the answer
     * shows only after the last punch.
     */
    const check = (t: Transition<SealWorld, Tamper>) => {
      const c = t.choreograph(world), from = SOURCE[sourceOf(t.event)];
      const hand = (): Beat[] => {
        if (c.has('chain:ring:on-wax', 'to') && c.has('chain:ring', 'from'))
          return [new AnimationGroup([c.leave('chain:stamp', { runTime: 0.25 }), c.leave('chain:cert', { runTime: 0.25 })]), ...flight(c, 'chain:ring:on-wax', [c.from('chain:ring').center() as Vec], { appear: 0.25, move: 0.55, leave: 0.25 })()];
        if (c.has('chain:ring', 'to') && c.has('chain:ring:on-wax', 'from'))
          return flight(c, 'chain:ring', [c.from('chain:ring:on-wax').center() as Vec], { appear: 0.25, move: 0.55, leave: 0.25 })();
        return [];
      };
      return beats(c, () => {
        const arrived = c.has('ticket:arrived', 'to') ? [c.enter('ticket:arrived', {}, { runTime: 0.25 })] : [];
        // Each punch fades in over 0.3 s, the next starting 0.12 s after it: one after another, in the draft's order.
        const punches = punchOrder().filter((k) => c.has(k, 'to')).map((k) => c.enter(k, {}, { runTime: 0.3 }));
        return [...hand(), ...flight(c, 'ticket', [from], { appear: 0.25, move: 0.5, leave: 0.2 })(), ...arrived, ...(punches.length ? [new AnimationGroup(punches, { lagRatio: 0.4 })] : [])];
      }, { fresh: ['verdict:', 'ticket', 'hole', 'tear', 'link'], lead: ['chain:'] });
    };
    const machine = new Machine<SealWorld, Tamper>(this, {
      start: start(policy),
      events: TAMPERS,
      labels: {
        send: 'Send the exchange', replay: 'Copy it 10 s later', url: 'Copy it to another URL', aud: 'Replay from shoes.example',
        thief: 'Thief seals the token', published: 'Seal with the published key', expired: 'Leaked key at 07:00', 'other-user': 'Leaked key for another User',
      },
      next,
      views: [world],
      runTime: () => 2.6,
      transition: Object.fromEntries(TAMPERS.map((t) => [t, check])),
    });

    await this.step('stranger', {
      title: 'A seal from a stranger',
      line: 'Predict: why should the shop believe this seal?',
      caption:
        'Your agent sends example.com the jacket exchange, sealed as in chapter 1. The shop has never met this agent and shares no secret with it. Still it must learn which agent sent this and which User it is for, without learning who that User is. Each line on the ticket is a claim the seal makes. What would make a copy of this seal useless to anyone else?',
    });
    await s.enter(world, { describe: () => sayWorld(this.state, this.shown) });

    await this.step('address', {
      title: 'The sender’s name is an address',
      line: 'iss is a URL that returns the agent’s keys.',
      caption:
        'Inside the seal, a claim called iss names the agent as a URL, https://agent.example/agent.json, and the shop fetches it. The document there must give that same URL as its client_id, and it lists the agent’s published keys on the same domain. Anyone can claim to be agent.example. Only agent.example decides which keys hang at that address.',
    });
    this.shown = { links: 1 };
    await world.sync();

    await this.step('delegation', {
      title: 'The published key never touches a request',
      line: 'It signs a short pass; the pass’s key seals.',
      caption: `${answerOf(this)}. The published key signs a delegation: a pass lasting at most 24 hours, this one until 06:00, naming a delegated key and nothing about you or the shop. That key presses a fresh seal for each request. So the key all shops trust records nowhere which shops you use. Two signatures and an address: three links.`,
    });
    this.shown = ALL_SHOWN;
    await world.sync();

    await this.step('send', {
      title: 'Punched in order',
      line: remembers ? `All ${sent.passed.length} checks hold, two of them optional.` : `All ${sent.passed.length} required checks hold.`,
      caption: `The shop walks the chain from iss down to the seal, then the claims: typed as a Session JWT, addressed to this shop, for this method and URL, signed a second ago, covering the token it carries. ${
        remembers ? 'Then two optional checks: a jti it has not seen, and a key that has signed for no other User.' : 'This shop skips the two optional checks, so the once and who rows stay unpunched.'
      } ${sent.answer.status}. Some agents also sign for the network edge with Web Bot Auth; that replaces none of this.`,
    });
    await this.play(machine.replay(STORY.slice(0, 1)));

    await this.step('moved', {
      title: 'Copied to another address',
      line: 'Another URL, or another shop: refused.',
      caption: `A thief copies the whole request, seal and token, to read the order instead: the seal says POST /exchanges, so ${url.answer.status} ${url.answer.error}. Next, shoes.example. Its own poppy.json named example.com’s cart URL, which nobody checks, so the agent signed for that URL with aud shoes.example. Replayed here, every signature is genuine, and aud refuses it. Look at who: you are usr_m4Tz9P there, under another key.`,
    });
    await this.play(machine.replay(STORY.slice(1, 3)));

    await this.step('signer', {
      title: 'The wrong hand on the seal',
      line: 'Another agent’s seal, or the published key: refused.',
      caption:
        'A thief copies your access token and seals it with its own valid chain. The chain holds, as thief.example’s, but the token was issued to agent.example, so the token check refuses it. Then an agent seals with its published key directly. There is no delegation, so it is refused: a shop that took it would let the published key sign things that name you and a shop.',
    });
    await this.play(machine.replay(STORY.slice(3, 5)));

    await this.step('clock', {
      title: 'Copies go stale',
      line: remembers ? 'The quick copy is refused by jti, an optional check.' : `Without the optional jti check, the quick copy gets ${replay.answer.status}.`,
      caption: remembers
        ? 'Ten seconds later an exact copy arrives. This shop remembers jtis, an optional check, so it refuses the copy; a shop that does not would answer 200 inside the 60-second window. Two minutes later, iat refuses a copy anywhere. At 07:00 a thief signs a fresh request with your leaked key, and the delegation that expired at 06:00 refuses it.'
        : `Ten seconds later an exact copy arrives, and this shop answers ${replay.answer.status}: it skips the optional jti check, and inside the 60-second window an exact copy can repeat the same request. Two minutes later, iat refuses a copy anywhere. At 07:00 a thief signs a fresh request with your leaked key, and the delegation that expired at 06:00 refuses it.`,
    });
    await this.play(machine.replay(STORY.slice(5, 7)));

    await this.step('one-user', {
      title: 'One key, one User',
      line: 'Now tamper yourself: each refusal names its check.',
      caption: remembers
        ? 'The agent gives every User ID its own delegated key, so a leaked key exposes one User at one shop. A thief signs with your key for another User; this shop remembers, an optional check, that the key signed for usr_Q7c1vK, and refuses. Press the tampers and predict each check. The detail after this shows the leaked key used first.'
        : `The agent gives every User ID its own delegated key, so a leaked key exposes one User at one shop. A thief signs with your key for another User. This shop skips the optional check, so it accepts the header as that User, signed out: ${leaked.answer.status}, naming ${leaked.answer.needs}. No account opens. Press the tampers and predict each check.`,
    });
    await this.play(machine.replay(STORY.slice(7, 8)));

    // A detail, where the shop remembers: the other history, in which the leaked key is used before
    // the agent sends. The picture is the model's state after those two tampers, from the start.
    if (remembers) {
      const first = ['other-user', 'send'].reduce<SealWorld>((w, t) => {
        const n = next(w, t as Tamper);
        if (isRefusal(n)) throw new Error(`the detail's ${t} is refused: ${n.reason}`);
        return n;
      }, start(policy));
      await this.step('first-use', {
        title: 'If the leaked key comes first',
        line: 'The shop refuses your own request.',
        kind: 'detail',
        caption: `Suppose the thief uses your leaked key for another User before your agent sends the exchange. This shop accepts that header as the other User, signed out, and notes, an optional check, that the key signed for ${OTHER_USER}. Then your agent's genuine exchange arrives under the same key and is refused: ${first.last!.verdict.answer.reason}. The shop cannot tell which use came first.`,
      });
      this.state = first;
      this.shown = { links: 3, take: 2 };
      await world.sync();
    }
  }
}
