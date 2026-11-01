import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/2password.ts';
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
    title: 'How does a secret reach the application?',
    sources: [
      `${SOURCE}/src/discover.ts`,
      `${SOURCE}/src/op.ts`,
      `${SOURCE}/README.md`,
      'https://developer.1password.com/docs/cli/secret-references/',
      'https://developer.1password.com/docs/service-accounts/use-with-1password-cli/',
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
      detail: true,
      title: 'The agent searches item titles, not secret values',
      line: `find asks op for the titles of ${ITEMS.length} sample items.`,
      caption: `The agent needs to choose a secret without receiving its value. 2password first asks op for item titles: it can search those names and return a reference, then let op pass the value to the launched app. Here find searches ${hitQuery} and the typo ${missQuery} among three sample items from 2password’s own tests.`,
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

    await this.step('match', {
      detail: true,
      title: 'A title matches when it contains every query word',
      line: `${match.title} contains “${hitQuery}”; no title contains “${missQuery}”.`,
      caption: `find lowercases each query and keeps a title only if it contains every word; tags and fields are not searched. Cloud API matches ${hitQuery}. No title contains ${missQuery}, so that query is a miss.`,
    });
    await boundary.dim(['Agent', 'Find']);
    const cell = (query: string, title: string) => {
      if (matches(query, title)) return 'match';
      const missing = terms(query).filter((t) => !title.toLowerCase().includes(t));
      return `no ${missing.join(', ')}`;
    };
    await listing.morph([
      pad('title', W) + QUERIES.map((q) => pad(q, 16)).join(''),
      ...ITEMS.map((i) => pad(i.title, W) + QUERIES.map((q) => pad(cell(q, i.title), 16)).join('')),
    ]);
    await listing.focus(1 + ITEMS.findIndex((i) => i.title === match.title));
    this.state.matches = Object.fromEntries(
      QUERIES.map((q) => [q, ITEMS.filter((i) => matches(q, i.title)).map((i) => i.title)]),
    );

    const near = ITEMS.find((i) => i.title === suggestion.title)!;
    const word = near.title.toLowerCase(),
      edits = distance(missQuery, word),
      longer = Math.max(missQuery.length, word.length);
    await this.step('suggest', {
      detail: true,
      title: `A miss returns titles that score at least ${SUGGESTION_THRESHOLD}`,
      line: `${near.title} is ${edits} edit${edits === 1 ? '' : 's'} from ${missQuery}: 1 − ${edits}/${longer} = ${closeness(terms(missQuery), near.title)}.`,
      caption: `For a query with no match, find scores each query word against each title word: 1 if one contains the other, otherwise 1 − edit distance ÷ the longer word’s length. A title scores the average of each query word’s best. ${near.title} is ${edits} edit${edits === 1 ? '' : 's'} from ${missQuery}, so it scores 1 − ${edits}/${longer} = ${closeness(terms(missQuery), near.title)} and comes back as a suggestion.`,
    });
    await listing.morph([
      pad('title', W) + pad(`closeness to ${missQuery}`, 24) + `≥ ${SUGGESTION_THRESHOLD}`,
      ...ITEMS.map((i) => {
        const score = closeness(terms(missQuery), i.title);
        return pad(i.title, W) + pad(score.toFixed(3), 24) + (score >= SUGGESTION_THRESHOLD ? 'suggested' : '–');
      }),
    ]);
    await listing.focus(1 + ITEMS.indexOf(near));
    this.state.found = found;

    await this.step('fetch', {
      detail: true,
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
      detail: true,
      title: 'find returns references but does not print secret values',
      line: 'A reference names vault, item and field; no secret value is printed.',
      caption:
        'find returns a reference for each match and suggestion, and drops field values while it decodes op’s reply. A reference names a vault, an item and a field: the underlined parts of the Cloud API reference.',
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
      detail: true,
      title: service ? 'env -u keeps the service token out of the app' : 'op run starts the app with the secret',
      line: service
        ? 'The app gets PATH and the API_KEY value, not the service token.'
        : 'op resolves the API_KEY reference; the app gets its value and PATH.',
      caption: service
        ? 'run hands op the reference, and op puts the secret into the app’s environment. With a service-account token, 2password has op start env -u OP_SERVICE_ACCOUNT_TOKEN app, so the app gets the secret and not the token.'
        : 'run hands op the reference, and op puts the secret into the app’s environment. With desktop approval op holds no token, so it starts the app directly. The app inherits the environment 2password started with, shown here as PATH, plus the secret.',
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
