import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames, ANSWER } from '../lib/readers/2password.ts';
import { Scene, Text, Arrow, Group, Line, FadeIn, FadeOut, Create } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import {
  ITEMS,
  SOURCE,
  SUGGESTION_THRESHOLD,
  PROMPTS_PER_COMMAND,
  find,
  run,
  closeness,
  distance,
  matches,
  terms,
} from '../lib/2password.ts';

const STYLE = 'excalidraw';
const QUERIES = ['cloud api', 'databse'] as const;
const TOKEN = 'OP_SERVICE_ACCOUNT_TOKEN';
const BOUNDARY = 'graph LR\nAgent[Agent] --> Find[2password find]\nFind --> Op[op CLI]\nOp --> Vault[1Password vault]';
const pad = (v: unknown, n: number) => String(v).padEnd(n);

export default class PasswordExplainer extends Scene {
  static meta = {
    id: '2password',
    title: 'Can an agent use a key it never sees?',
    sources: [
      `${SOURCE}/src/discover.ts`,
      `${SOURCE}/src/op.ts`,
      `${SOURCE}/README.md`,
      'https://developer.1password.com/docs/cli/secret-references/',
      'https://developer.1password.com/docs/service-accounts/use-with-1password-cli/',
    ],
    // The script's answer and check questions (script.md); check holds reader-boundary to stating the answer.
    answer: ANSWER,
    checks: [
      {
        question: 'The agent searches for “databse”, which no title contains. What does find return, and why that item?',
        answer: 'A suggestion, the Database reference. “databse” is one edit from “database”, so it scores 1 − 1/8 = 0.875, above the 0.6 threshold.',
      },
      {
        question: 'How many secret values appear in find’s output for the two queries?',
        answer: 'None. find drops each field’s value while it decodes op’s reply and returns only op:// references.',
      },
      {
        question: 'How many op calls does find make for the two queries, and what is each one for?',
        answer: 'Two: item list for every item’s title, then one item get for the two items it needs, Cloud API for the match and Database for the suggestion.',
      },
    ],
  };
  static settings = [
    {
      id: 'auth',
      label: 'Authenticate with',
      default: 'desktop',
      options: [
        { value: 'desktop', label: 'Desktop approvals' },
        { value: 'service', label: 'Service account' },
      ],
    },
  ];
  override async construct() {
    const auth = settingsOf(this).auth as 'desktop' | 'service',
      service = auth === 'service',
      s = stage(this, { headingSize: 0.6, style: STYLE }),
      hot = s.emphasis;
    const found = find(QUERIES),
      [hitQuery, missQuery] = QUERIES,
      match = found.matches[0]!,
      suggestion = found.suggestions![0]!;

    await readerFirst(this, s, readerFrames(auth));
    await this.step('boundary', {
      title: 'To pick a key, the agent searches titles, never values',
      line: `Predict: it asks for “${hitQuery}” and the typo “${missQuery}”. What comes back?`,
      caption: `The agent still has to choose which key. 2password find asks op for the titles of the vault’s items, uses those names to choose the items and answers with references. The later item-get reply can contain secret values; the wrapper drops them before producing its output. Here it searches “${hitQuery}” and the typo “${missQuery}” among the ${ITEMS.length} sample items from 2password’s own tests.`,
    });
    await s.clear();
    const boundary = await s.show({ source: BOUNDARY }, { box: 'top' });
    await boundary.walk(
      [
        ['Agent', 'Find'],
        ['Find', 'Op'],
      ],
      { trail: true },
    );
    const W = 14;
    const listing = await s.code(
      [
        pad('title', W) + pad('category', 16) + 'vault',
        ...ITEMS.map((i) => pad(i.title, W) + pad(i.category, 16) + i.vault),
      ],
      { at: [-5.5, -4.25, 5.5, -0.5], fontSize: 0.3 },
    );
    await listing.focus([1, ITEMS.length]);

    const near = ITEMS.find((i) => i.title === suggestion.title)!;
    const word = near.title.toLowerCase(),
      edits = distance(missQuery, word),
      longer = Math.max(missQuery.length, word.length),
      score = closeness(terms(missQuery), near.title);
    await this.step('match', {
      title: `Answer: a match for “${hitQuery}”, a suggestion for “${missQuery}”`,
      line: `${match.title} contains every word of “${hitQuery}”; ${near.title} is ${edits} edit${edits === 1 ? '' : 's'} from “${missQuery}”.`,
      caption: `A title matches when it contains every query word, so ${match.title} matches “${hitQuery}”. No title contains “${missQuery}”, so find scores each title word against it instead: 1 if one contains the other, otherwise 1 − edit distance ÷ the longer word’s length, and suggests any title scoring at least ${SUGGESTION_THRESHOLD}. ${near.title} scores 1 − ${edits}/${longer} = ${score} and comes back as a suggestion.`,
    });
    await boundary.dim(['Agent', 'Find']);
    const cell = (query: string, title: string) => {
      if (matches(query, title)) return 'match';
      const missing = terms(query).filter((t) => !title.toLowerCase().includes(t));
      return `no ${missing.join(', ')}`;
    };
    const scored = (title: string) => {
      const c = closeness(terms(missQuery), title);
      return `${c.toFixed(3)}${c >= SUGGESTION_THRESHOLD ? ' suggested' : ''}`;
    };
    await listing.morph([
      pad('title', W) + pad(hitQuery, 16) + `${missQuery}: score ≥ ${SUGGESTION_THRESHOLD}`,
      ...ITEMS.map((i) => pad(i.title, W) + pad(cell(hitQuery, i.title), 16) + scored(i.title)),
    ]);
    await listing.focus([1 + ITEMS.indexOf(ITEMS.find((i) => i.title === match.title)!), 1 + ITEMS.indexOf(near)]);
    this.state.matches = Object.fromEntries(
      QUERIES.map((q) => [q, ITEMS.filter((i) => matches(q, i.title)).map((i) => i.title)]),
    );
    this.state.found = found;

    await this.step('fetch', {
      title: 'One op item get fetches the match and the suggestion',
      line: `Item list, then one item get for ${found.fetched.join(' and ')}; ${service ? 'no approval' : 'one approval'}.`,
      caption: service
        ? `find makes two op calls: item list for titles, then one item get for every item a match or suggestion needs, here ${found.fetched.join(' and ')}. With a service-account token in the environment, op asks for no approval.`
        : `find makes two op calls: item list for titles, then one item get for every item a match or suggestion needs, here ${found.fetched.join(' and ')}. 2password’s README says the whole command costs one desktop approval.`,
    });
    await s.clear();
    const sequence = await s.show(
      {
        source: [
          'sequenceDiagram',
          ' participant A as Agent',
          ' participant T as 2password',
          ' participant O as op CLI',
          ' A->>T: find with two queries',
          ` T->>O: ${found.opCalls[0]!.split(' --')[0]}`,
          ' O-->>T: ids and titles',
          ` T->>O: item get for ${found.fetched.length} items`,
          ' O-->>T: item details',
          ' T-->>A: op:// references',
        ].join('\n'),
      },
      { box: 'full' },
    );
    await sequence.mark(['message:T->O#1']);
    // What the two calls cost, said on op itself.
    const approvals = PROMPTS_PER_COMMAND[auth];
    await sequence.note(
      'O',
      `${found.opCalls.length} calls, ${approvals ? `${approvals} approval${approvals === 1 ? '' : 's'}` : 'no approval'}`,
      { side: 'right' },
    );
    this.state.auth = auth;

    await this.step('reference', {
      title: 'find returns references and prints no secret value',
      line: 'One reference per query; every sample value is searched for in the output.',
      caption:
        'find answers each query with a reference: a match for “cloud api” and a suggestion for “databse”. It drops each field’s value while it decodes op’s reply, so the agent receives references rather than field values; the note counts the sample values found in it. The underlines mark the vault, item and field of the Cloud API reference.',
    });
    await s.clear();
    const ref = match.ref;
    const refText = new Text(ref, { fontSize: 0.56, font: 'mono', color: s.palette.ink }).moveTo([0, 1.9]);
    const parts = ['vault', 'item', 'field'],
      segs = ref.slice(5).split('/'),
      per = refText.advance() / ref.length,
      x0 = refText.box()![0],
      y = refText.box()![1] - 0.1;
    const anatomy = new Group();
    let at = 5;
    segs.forEach((seg, i) => {
      const a = x0 + at * per,
        b = a + seg.length * per,
        color = parts[i] === 'item' ? hot : s.soft;
      anatomy.add(
        new Line([a + 0.04, y], [b - 0.04, y], { stroke: color, strokeWidth: 0.03 }),
        new Text(parts[i]!, { fontSize: 0.24, color }).moveTo([(a + b) / 2, y - 0.3]),
      );
      at += seg.length + 1;
    });
    // Each reference find printed, with the query it answers above it.
    const answers = (text: string, under: Text) =>
      new Text(text, { fontSize: 0.24, color: s.soft, anchor: 'start' }).moveTo(
        [under.box()![0], under.box()![3] + 0.3],
        [-1, 0],
      );
    const matchFor = answers(`match for “${hitQuery}”`, refText);
    await s.enter(refText, matchFor, { runTime: 0.5 });
    await this.play(new Create(s.keep(anatomy), { lagRatio: 0 }));
    const suggestionText = new Text(suggestion.ref, { fontSize: 0.44, font: 'mono', color: s.palette.ink }).moveTo([
        0, -0.9,
      ]),
      suggestionFor = answers(`suggestion for “${missQuery}”`, suggestionText);
    await s.enter(suggestionText, suggestionFor, { runTime: 0.5 });
    const values = ITEMS.flatMap((i) => i.fields.map((f) => f.value));
    const printed = JSON.stringify(found),
      leaked = values.filter((v) => printed.includes(v)).length;
    const none = await s.note(`Secret values in find’s output: ${leaked || 'none'}`, { at: [0, -2.6], size: 0.28 });

    const launched = run(auth, { API_KEY: ref }, ['app']);
    await this.step('run', {
      title: service
        ? 'op starts the app with the key; env -u keeps the service token back'
        : 'op starts the app with the key the agent never saw',
      line: service
        ? 'The app gets PATH and the API_KEY value, not the service token.'
        : 'op resolves the API_KEY reference; the app gets its value and PATH.',
      caption: service
        ? 'The agent runs 2password run with the reference, and op puts the value into the app’s environment. op also holds the service-account token, so 2password has op start env -u OP_SERVICE_ACCOUNT_TOKEN app, and the app gets the key but not the token. The agent handled only the reference throughout; the app can still print what it was given.'
        : 'The agent runs 2password run with the reference, and op puts the value into the app’s environment. With desktop approval op holds no token to strip, so it starts the app directly; with a service account, 2password would add env -u OP_SERVICE_ACCOUNT_TOKEN. The agent handled only the reference throughout; the app can still print what it was given.',
    });
    // The match's reference is carried into the run command that hands it to op; the rest goes.
    await this.play(
      ...[anatomy, matchFor, suggestionText, suggestionFor, none].map((m) => new FadeOut(m, { runTime: 0.4 })),
    );
    const command = await s.code([`2password run --env "API_KEY=${ref}" -- app`, `→ ${launched.argv.join(' ')}`], {
      at: regionBox('top', { bottom: 1.2 }),
      fontSize: 0.3,
      enter: false,
    });
    await s.carry(refText, command.code.token(0, ref).box()!);
    await this.play(new FadeIn(command, { runTime: 0.4 }), new FadeOut(refText, { runTime: 0.4 }));
    const before = await s.code(
      Object.entries(launched.opEnv).map(([k, v]) => (k === TOKEN ? '- ' : '  ') + `${k}=${v}`),
      {
        at: regionBox('full', { right: -0.75, top: 0.7 }),
        title: "op's environment",
        fontSize: 0.26,
        diff: true,
        enter: false,
      },
    );
    const child = await s.code(
      Object.entries(launched.childEnv).map(([k, v]) => `${k}=${v}`),
      { at: regionBox('full', { left: 0.75, top: 0.7 }), title: "app's environment", fontSize: 0.26, enter: false },
    );
    const yArrow = (before.panel.box()![1] + before.panel.box()![3]) / 2;
    const pass = new Arrow([before.panel.box()![2] + 0.1, yArrow], [child.panel.box()![0] - 0.1, yArrow], {
      stroke: hot,
      strokeWidth: 0.035,
      tipLength: 0.22,
      tipWidth: 0.18,
    });
    await s.enter(before);
    await this.play(
      new Create(s.keep(pass, { describe: 'An arrow from op’s environment to the app’s' })),
      new FadeIn(child),
    );
    await command.focus(1);
    this.state.argv = launched.argv;
    this.state.childEnv = launched.childEnv;
  }
}
