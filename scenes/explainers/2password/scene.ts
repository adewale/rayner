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

/** The check questions' answers, from the same find: a query whose words are in no title. */
const CHECK = (() => {
  const query = 'cloud key',
    result = find([query]);
  if (result.matches.length || result.suggestions) throw new Error(`“${query}” should find nothing`);
  const best = Math.max(...ITEMS.map((i) => closeness(terms(query), i.title)));
  return { blind: { query, best: best.toFixed(3), calls: result.opCalls.length } };
})();
const match0 = (() => {
  const m = find(['cloud api']).matches[0]!,
    [vault, title, field] = m.ref.slice('op://'.length).split('/');
  return { ref: m.ref, vault: vault!, title: title!, field: field! };
})();

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
    // Sentences that reach past the cases on screen, and what holds each.
    claims: [
      { says: 'The agent handles only an op:// reference', test: 'test/explain-models.test.ts: 2password find returns references and no field value' },
      { says: 'the agent searches titles, never values', test: 'test/explain-models.test.ts: compares queries with titles alone' },
      { says: 'contains every word of', shown: true as const },
      { says: 'every sample value is searched for in the output', shown: true as const },
    ],
    checks: [
      {
        question: `The agent searches for “${CHECK.blind.query}”, hoping to find the API key. What does find return, and why?`,
        answer: `Nothing. No title contains “key”, so nothing matches, and the closest titles score ${CHECK.blind.best}, below the ${SUGGESTION_THRESHOLD} threshold, so nothing is suggested. find compares the query with titles only; it cannot know that ${match0.title} holds a key, and it makes ${CHECK.blind.calls} op call, the item list, without fetching any item.`,
      },
      {
        question: 'The app prints API_KEY to stdout, and the agent reads stdout. Does passing a reference prevent that disclosure?',
        answer: 'No. The app receives the resolved key and can print it. References keep field values out of find’s output and the launch request; they do not sandbox the app or redact its output.',
      },
      {
        question: `The agent’s transcript, containing ${match0.ref}, is pasted into a team chat. What does the team learn, and can they read the key?`,
        answer: `They learn names: a vault called ${match0.vault}, an item titled ${match0.title} and a field called ${match0.field}. Reading the value still needs an op session with access to that vault; the reference carries no permission. The names themselves can still be sensitive, since they say which vaults and items exist.`,
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

    await s.steps(readerFrames(auth), { reader: true });
    await this.step('boundary', {
      title: 'To pick a key, the agent searches titles, never values',
      line: `Predict: it asks for “${hitQuery}” and the typo “${missQuery}”. What comes back?`,
      caption: `Title matching chooses the items without needing their field values. Here “${hitQuery}” and “${missQuery}” search ${ITEMS.length} sample titles. The later item-get reply can contain secret values; the wrapper discards them before returning references to the agent.`,
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
      caption: `${match.title} contains every word of “${hitQuery}”, so it matches and find returns its reference. No title contains “${missQuery}”, so find falls back to spelling: “${missQuery}” is ${edits} edit${edits === 1 ? '' : 's'} from “${word}”, which scores 1 − ${edits}/${longer} = ${score}, above the ${SUGGESTION_THRESHOLD} threshold, and ${near.title} comes back as a suggestion. Both answers compare the query with titles; neither looks at a secret.`,
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
      caption: service ? `find first lists titles, then fetches the selected items together. The service account authenticates op without a desktop approval. That changes how op reaches the vault; the agent still receives references, as it does with desktop approvals.` : `find first lists titles, then fetches the selected items together. Upstream documents one desktop approval for this command. The agent still receives references rather than the secret-bearing item reply.`,
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
      caption: 'The returned strings identify a vault, item and field. Field values are discarded while the wrapper decodes op’s response. Those names let the agent select and launch the app without putting the key into the conversation; they do not themselves grant access to the vault.',
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
    await s.enter(refText, matchFor, {
      runTime: 0.5,
      describe: () => `The match for “${hitQuery}”: ${ref}, its three parts underlined as vault, item and field`,
    });
    await this.play(new Create(s.keep(anatomy, { describe: () => `Under ${ref}: vault ${segs[0]}, item ${segs[1]}, field ${segs[2]}` }), { lagRatio: 0 }));
    const suggestionText = new Text(suggestion.ref, { fontSize: 0.44, font: 'mono', color: s.palette.ink }).moveTo([
        0, -0.9,
      ]),
      suggestionFor = answers(`suggestion for “${missQuery}”`, suggestionText);
    await s.enter(suggestionText, suggestionFor, { runTime: 0.5, describe: () => `The suggestion for “${missQuery}”: ${suggestion.ref}` });
    const values = ITEMS.flatMap((i) => i.fields.map((f) => f.value));
    const printed = JSON.stringify(found),
      leaked = values.filter((v) => printed.includes(v)).length;
    const none = await s.note(`Secret values in find’s output: ${leaked || 'none'}`, { at: [0, -2.6], size: 0.28 });

    const launched = run(auth, { API_KEY: ref }, ['app']);
    await this.step('run', {
      title: service
        ? 'op starts the app with the key; env -u keeps the service token back'
        : 'op swaps the reference for the key as it starts the app',
      line: service
        ? 'The app gets PATH and the API_KEY value, not the service token.'
        : 'op resolves the API_KEY reference; the app gets its value and PATH.',
      caption: service ? 'op resolves the reference and starts the app with API_KEY’s value. The wrapper removes OP_SERVICE_ACCOUNT_TOKEN from the child environment: the app needs its key, not the account token used to obtain it. This is a launch boundary, not a sandbox; the app can still print its environment.' : 'op resolves the reference and starts the app with API_KEY’s value. With desktop authentication there is no service-account token to remove. The reference keeps the value out of the agent’s launch request, but the app can still print what it receives.',
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
