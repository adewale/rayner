import { AnimationGroup, Scene, Succession, Text } from '../../../src/index.ts';
import type { Animation } from '../../../src/index.ts';
import { answerOf, isRefusal, stage, Machine, view } from '../../../explain/index.ts';
import type { Choreography, ExplainerMeta, Transition } from '../../../explain/index.ts';
import { beats, pass, sheet } from '../lib/poppy-kit.ts';
import type { Beat } from '../lib/poppy-kit.ts';
import { EVENTS, GATE_NAME, STORY, next, progress, start } from './model.ts';
import type { DiscoveryEvent, World } from './model.ts';
import { BOARD_SHEET, DOORSTEP, PALETTE, STREET_X, drawWorld, sayWorld } from './picture.ts';

/** Parts that belong to one run of the checks: they go when the reader chooses another server. */
const RUN = ['url:', 'sheet', 'board', 'shop:mark', 'out:', 'register:', 'back:', 'verdict:', 'rail:barrier', 'rail:done'];

// The sceptic's question about chapter 1's first step, as a machine. The reader (and the story)
// chooses who serves the poppy.json: the real shop, a copy on a lookalike domain, a domain that
// claims the shop's issuer, an upload reached by a redirect, a shop with no issuer, the real shop
// on a day its metadata times out, or the shop's second domain. Then the agent runs its four
// checks in their fixed order, one press each, and the picture shows how far the document got.
//
// The motion is the explanation's: the URL is fetched, then the sheet comes down from the address
// bar to the shop's doorstep; reading sets its letterhead under the fascia, column by column; the
// signpost's arm is drawn out to the issuer it names, and the register opens there; asking the
// issuer fills its rows, and an arrow is drawn back from the row that lists the shop, closing the
// loop. The agent's line extends to each stop a check passes, and a barrier drops before the one
// that refuses. The verdict comes last, once its check has run.
export default class PoppyDiscovery extends Scene<World, {}> {
  static meta = {
    sources: ['https://personalagentprotocol.org/docs/1.0/spec', 'https://www.rfc-editor.org/rfc/rfc9728', 'https://www.rfc-editor.org/rfc/rfc8414'],
    claims: [
      { says: 'never falls back', test: 'model.test.ts: 3.2: after a timeout, another error status or invalid metadata the agent stops, and never falls back to the domain' },
      { says: 'every other check would pass', test: 'model.test.ts: section 3 and 10.3: each forgery is refused by exactly one check, and would be accepted without it' },
      { says: 'signed-out Sessions only', test: 'model.test.ts: 3.2: 404 means no issuer: the Company is its HTTPS domain and offers signed-out Sessions only' },
    ],
  } satisfies ExplainerMeta;
  override state = start();

  override async construct() {
    this.state = start();
    const s = stage(this, { palette: { ...PALETTE }, heading: false });
    const world = view(this, (w) => drawWorld(w, s), { place: false });

    /** Parts only the new picture has, brought in one after another in this order, where present. */
    const bring = (c: Choreography, keys: readonly string[], create: readonly string[] = []): Beat[] =>
      keys.filter((k) => c.has(k, 'to') && !c.has(k, 'from')).map((k) => c.enter(k, create.includes(k) ? { create: true } : {}, { runTime: create.includes(k) ? 0.5 : 0.3 }));
    const together = (list: Animation[]): Beat[] => (list.length ? [new AnimationGroup(list)] : []);

    /** One check: what it found arrives where it really comes from, then the agent's line moves on. */
    const check = (t: Transition<World, DiscoveryEvent>) => {
      const c = t.choreograph(world), gate = t.after.ran;
      const g = (keys: readonly string[], create: readonly string[] = []) => bring(c, keys, create) as Animation[];
      const thunk = (): Beat[] => {
        if (gate === 2) return [...together(g(['sheet:head'])), ...together(g(['shop:mark', 'sheet:mark']))];
        // The closed register gives way as the arm is drawn out to it; then it stands open at its page.
        const shut = c.has('register:closed', 'from') && !c.has('register:closed', 'to') ? [c.leave('register:closed', { runTime: 0.3 })] : [];
        if (gate === 3) return [...together([...g(['out:line'], ['out:line']), ...shut]), ...together(g(['out:head', 'out:plate', 'out:label', 'out:code', 'out:note', 'register:title', 'register:page', 'register:none']))];
        // The issuer's rows; then either the arrow back to the shop, or the empty slot and the ghost of an arrow that never arrives.
        return [...together(g(['register:row:0', 'register:row:1'])), ...together(g(['register:slot', 'register:slot:text', 'back:ghost', 'back:line'], ['back:line', 'back:ghost']))];
      };
      return gate === 1 ? fetchMotion(c) : beats(c, thunk, { fresh: ['verdict:'], then: ['rail:barrier'] });
    };

    /**
     * The fetch, in its real order. The address bar changes first: the URL the agent ends on (after a
     * redirect, the first URL above it and the bracket between), and the fascia of the shop it has
     * arrived at. Then a document travels down from the address bar, beside the shop, to the doorstep
     * (or to the noticeboard, for a file found at another path), and the sheet is there. Then the
     * agent's line moves on, or the barrier drops.
     */
    const fetchMotion = (c: Choreography): Succession => {
      // Words that change are replaced; so is the whole URL, whose path would otherwise slide when a redirect shortens the host.
      const changed = c.keys('to').filter((k) => c.has(k, 'from') && c.from(k) instanceof Text && c.to(k) instanceof Text && ((c.from(k) as Text).text !== (c.to(k) as Text).text || k === 'url:host' || k === 'url:path'));
      const out = changed.map((k) => c.leave(k, { runTime: 0.2 }));
      const arrive = [...changed.filter((k) => k.startsWith('url:') || k === 'shop:name').map((k) => c.enter(k, {}, { runTime: 0.3 })), ...(bring(c, ['url:first', 'url:redirect', 'url:under', 'board']) as Animation[])];
      const path = c.to('url:path'), from: [number, number] = [path.center()[0]!, 2.55];
      const onBoard = c.has('board', 'to'), to = onBoard ? BOARD_SHEET : DOORSTEP;
      const route: [number, number][] = onBoard ? [from, to] : [from, [STREET_X, from[1]], [STREET_X, to[1]], to];
      const token = pass(c, 'sheet:token', sheet(s, { width: 0.7, height: 0.9, lines: 2 }), route, { appear: 0.25, move: 0.6, leave: 0.25 });
      return new Succession([
        ...(out.length ? [new AnimationGroup(out)] : []),
        ...together(arrive),
        ...token,
        c.rest({ runTime: 0.35 }),
      ]);
    };

    const machine = new Machine<World, DiscoveryEvent>(this, {
      start: start(),
      events: EVENTS,
      labels: {
        shop: 'Real shop', copy: 'Copy on examp1e.com', claim: 'evil.example claims the issuer', upload: 'Upload via redirect',
        small: 'Shop with no issuer', outage: 'Metadata times out', uk: 'example.co.uk', check: 'Run the next check',
      },
      next,
      views: [world],
      runTime: ({ event, after }) => (event !== 'check' ? 0.35 : after.ran === 1 ? 1.5 : after.ran === 2 ? 0.75 : 1.0),
      transition: {
        check,
        // Choosing a server is a cut to another shop: the last run's parts go, the fascia's name is replaced.
        ...Object.fromEntries((['shop', 'copy', 'claim', 'upload', 'small', 'outage', 'uk'] as const).map((e) => [e, (t: Transition<World, DiscoveryEvent>) => beats(t.choreograph(world), () => [], { fresh: RUN })])),
      },
    });

    const after = STORY.reduce<World[]>((ws, e) => {
      const n = next(ws.at(-1)!, e);
      if (isRefusal(n)) throw new Error(`the story's ${e} is refused: ${n.reason}`);
      return [...ws, n];
    }, [start()]);
    const verdictAt = (i: number) => progress(after[i]!).verdict!;
    let played = 0;
    const play = async (n: number) => { await this.play(machine.replay(STORY.slice(played, played + n))); played += n; };

    await this.step('stranger', {
      title: 'Anyone can write a poppy.json',
      line: 'Predict: how would you forge one?',
      caption:
        'Your agent is about to shop at www.example.com. In chapter 1 its first move was to read the shop’s poppy.json, a file that tells it where to send your requests and your tokens. But a JSON file is the easiest thing on the web to forge. Before you go on, think how you would make an agent believe that a file of yours speaks for example.com.',
    });
    await s.enter(world, { describe: () => sayWorld(this.state) });

    await this.step('read', {
      title: 'The file speaks for the host that served it',
      line: 'It must name that host itself.',
      caption:
        'The agent fetches www.example.com/.well-known/poppy.json over HTTPS, and the shop redirects it to the same path on example.com, which is allowed. The file lists the ways in, at least one of them: the shop’s APIs, its website and its own agent, beside sign-in details, tasks and extensions. Its letterhead, organization.domain, says example.com, and the agent checks that this is the host that served it.',
    });
    await play(2);

    await this.step('handshake', {
      title: 'A handshake with the issuer',
      line: 'The domain names its issuer; the issuer names it back.',
      caption: `Who issues this shop’s tokens? example.com’s protected resource metadata, the signpost, names auth.example.com. The agent then asks the issuer, whose own metadata lists example.com among its domains. Each side points at the other, and from now on the Company is known by its issuer. That is the answer: ${answerOf(this)}. Three forgers now try to get round one check each.`,
    });
    await play(2);

    const copy = verdictAt(played + 3);
    await this.step('copy', {
      title: 'A copy on a lookalike domain',
      line: 'Refused: it names example.com, not examp1e.com.',
      caption: `The first forger copies example.com’s file to examp1e.com and points the API address at its own server. The file is at the right path, over HTTPS, but it still says example.com and examp1e.com served it, so the agent refuses it at the ${copy.accepted ? 'no' : GATE_NAME[copy.gate]} check. Change the letterhead to examp1e.com and every check passes, even under example.com’s name and logo (draft 1.0, 10.3). The file then speaks for examp1e.com, a different Company, and noticing that domain falls to the agent.`,
    });
    await play(3);

    await this.step('claim', {
      title: 'Claiming the shop’s issuer',
      line: 'The issuer does not list evil.example.',
      caption:
        'A cleverer forger is honest about its domain. evil.example serves a file naming evil.example, and its signpost names auth.example.com as its issuer. Believe that, and evil.example is the same Company as example.com: the agent would send it example.com’s User ID and tokens. But the issuer’s own register does not list evil.example. The handshake is missing its second side, and the agent refuses the file.',
    });
    await play(5);

    await this.step('upload', {
      title: 'A file uploaded to the real shop',
      line: 'The path check alone stops it.',
      caption:
        'The cleverest forger uploads a file naming example.com to example.com itself, at /uploads/poppy.json, and redirects deals.example’s well-known address to it. The file is served by example.com and names example.com, and example.com’s issuer lists example.com, so every other check would pass. The path check stops it: a redirect may go to any host, but it must end at /.well-known/poppy.json. Whoever controls that path speaks for the shop.',
    });
    await play(2);

    await this.step('no-issuer', {
      title: 'A shop with no issuer',
      line: 'Signed out: the domain is the Company.',
      caption:
        'Some shops run no sign-in. corner.example’s metadata answers 404, which means it has no issuer, so there is no listing to ask for. The Company is then known by its own address, https://corner.example, and the agent can use it in signed-out Sessions only. Without an issuer, each domain is a Company of its own.',
    });
    await play(4);

    await this.step('outage', {
      title: 'An error is not “no issuer”',
      line: 'The agent stops rather than fall back.',
      caption:
        'Today example.com’s metadata times out. A careless agent would treat that like corner.example’s 404 and carry on with https://example.com as the Company. That would change the Company’s identifier, and with it the User ID the agent uses there. So after a timeout, an error status or invalid metadata the agent never falls back to the domain: it stops.',
    });
    await play(4);

    await this.step('one-company', {
      title: 'Two domains, one Company',
      line: 'Now choose who serves the file.',
      caption:
        'example.co.uk serves its own file and names the same issuer, which lists it too. So it is the same Company as example.com, with the same User ID, Sessions and refresh tokens. Each file also states its protocol version; the agent sends the one it chose as Poppy-Version, and a shop that no longer serves it answers 400 version_unsupported. Choose who serves the file and run the checks.',
    });
    await play(5);
  }
}
