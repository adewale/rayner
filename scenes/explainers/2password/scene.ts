import { frames as readerFrames } from './picture.ts';
import { Scene, Arrow, FadeIn, Create } from '../../../src/index.ts';
import { stage, regionBox, answerOf, view, having } from '../../../explain/index.ts';
import { code } from '../../../explain/drawing.ts';
import type { NoteSide, ExplainerMeta } from '../../../explain/index.ts';
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
} from './model.ts';
import { counted } from '../lib/format.ts';

const STYLE = 'excalidraw';
const QUERIES = ['cloud api', 'databse'] as const;
const BOUNDARY = 'graph LR\nAgent[Agent] --> Find[2password find]\nFind --> Op[op CLI]\nOp --> Vault[1Password vault]';
const pad = (v: unknown, n: number) => String(v).padEnd(n);

// How the boundary diagram is shown, apart from its source: the hops walked and what stays undimmed.
// That is `shown`, not the model; its view draws it, and each change is a sync.
type BoundaryShown = { walked: [string, string][]; dim: string[] | null };
// The listing is a view; which columns it shows (each item's category and vault, or what each query
// found) and the lines in focus are how the step shows the items, in `shown`.
type ListingShown = { columns: 'item' | 'queries'; focus: [number, number] };
// The reply marked and the notes are how the sequence is shown, drawn by its view from `shown`.
type SequenceShown = { marked: string[]; notes: { id: string; text: string; side: NoteSide }[] };
/** What each step finds out: the matches, what find printed, the values it leaked, and what op started. */
type PasswordState = {
  matches?: Record<string, string[]>;
  found?: ReturnType<typeof find>;
  leaked?: number;
  argv?: string[];
  childEnv?: Record<string, string>;
};
/** Each picture's part of what is shown, from the step that first shows it; the command's focused line. */
type PasswordShown = { boundary?: BoundaryShown; listing?: ListingShown; sequence?: SequenceShown; commandFocus?: number | null };

export default class PasswordExplainer extends Scene<PasswordState, PasswordShown> {
  static meta = {
    sources: [
      `${SOURCE}/src/discover.ts`,
      `${SOURCE}/src/op.ts`,
      `${SOURCE}/README.md`,
      'https://developer.1password.com/docs/cli/secret-references/',
      'https://developer.1password.com/docs/service-accounts/use-with-1password-cli/',
    ],
    // Sentences that reach past the scenarios on screen, and what holds each.
    claims: [
      { says: 'The agent handles only an op:// reference', test: 'model.test.ts: 2password find returns references and no field value' },
      { says: 'the agent searches titles, never values', test: 'model.test.ts: compares queries with titles alone' },
      { says: 'contains every word of', shown: true as const },
      { says: 'every sample value is searched for in the output', shown: true as const },
    ],
  } satisfies ExplainerMeta;
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE }),
      hot = s.look.emphasis;
    const found = find(QUERIES),
      [hitQuery, missQuery] = QUERIES,
      match = found.matches[0]!,
      suggestion = found.suggestions![0]!;

    await readerFrames(s, answerOf(this), { kind: 'short' });
    await this.step('boundary', {
      title: 'To pick a key, the agent searches titles, never values',
      line: `Predict: it asks for “${hitQuery}” and the typo “${missQuery}”. What comes back?`,
      caption: `find chooses items by comparing the query with their titles, so it needs no field values to choose. Here “${hitQuery}” and “${missQuery}” search ${ITEMS.length} sample titles.`,
    });
    await s.clear();
    const boundary = await s.show({ source: BOUNDARY }, { box: 'top' });
    this.shown.boundary = { walked: [], dim: null } satisfies BoundaryShown;
    const boundaryView = s.diagramView(boundary, (_st, sh) => {
      const b = having(sh, 'boundary').boundary;
      return { marks: boundary.trail(b.walked), dim: b.dim };
    });
    const showBoundary = async (change: Partial<BoundaryShown>) => {
      this.shown.boundary = { ...having(this.shown, 'boundary').boundary, ...change };
      await this.play(boundaryView.sync());
    };
    const handled: [string, string][] = [
      ['Agent', 'Find'],
      ['Find', 'Op'],
    ];
    await boundary.walk(handled);
    await showBoundary({ walked: handled });
    const W = 14;
    const cell = (query: string, title: string) => {
      if (matches(query, title)) return 'match';
      const missing = terms(query).filter((t) => !title.toLowerCase().includes(t));
      return `no ${missing.join(', ')}`;
    };
    const spelled = (title: string) =>
      closeness(terms(missQuery), title) >= SUGGESTION_THRESHOLD ? 'close: suggested' : 'not close';
    const listingLines = (columns: ListingShown['columns']) =>
      columns === 'item'
        ? [pad('title', W) + pad('category', 16) + 'vault', ...ITEMS.map((i) => pad(i.title, W) + pad(i.category, 16) + i.vault)]
        : [
            pad('title', W) + pad(hitQuery, 16) + missQuery,
            ...ITEMS.map((i) => pad(i.title, W) + pad(cell(hitQuery, i.title), 16) + spelled(i.title)),
          ];
    this.shown.listing = { columns: 'item', focus: [1, ITEMS.length] } satisfies ListingShown;
    const listing = view(
      this,
      (_st, sh) => {
        const l = having(sh, 'listing').listing;
        return code(s, listingLines(l.columns), {
          at: [-5.5, -4.25, 5.5, -0.5],
          size: 0.3,
          lit: { lines: l.focus },
          key: 'listing',
        });
      },
      { place: false },
    );
    await s.enter(listing, { runTime: 0.4 });

    const near = ITEMS.find((i) => i.title === suggestion.title)!;
    const word = near.title.toLowerCase(),
      edits = distance(missQuery, word),
      editWords = counted(edits, 'edit');
    await this.step('match', {
      title: `Answer: a match for “${hitQuery}”, a suggestion for “${missQuery}”`,
      line: `${match.title} contains every word of “${hitQuery}”; ${near.title} is ${editWords} from “${missQuery}”.`,
      caption: `${match.title} contains every word of “${hitQuery}”, so it matches. No title contains “${missQuery}”, so find compares spellings instead: “${missQuery}” is ${editWords} from “${word}”, close enough that ${near.title} comes back as a suggestion. Both answers compare the query with titles; neither looks at a secret.`,
    });
    await showBoundary({ dim: ['Agent', 'Find'] });
    this.shown.listing = {
      columns: 'queries',
      focus: [1 + ITEMS.indexOf(ITEMS.find((i) => i.title === match.title)!), 1 + ITEMS.indexOf(near)],
    } satisfies ListingShown;
    await this.play(listing.sync());
    this.state.matches = Object.fromEntries(
      QUERIES.map((q) => [q, ITEMS.filter((i) => matches(q, i.title)).map((i) => i.title)]),
    );
    this.state.found = found;

    // What reached the agent: every sample value, searched for in find's printed result.
    const values = ITEMS.flatMap((i) => i.fields.map((f) => f.value));
    const printed = JSON.stringify(found),
      leaked = values.filter((v) => printed.includes(v)).length;
    const approvals = PROMPTS_PER_COMMAND.desktop;
    await this.step('references', {
      title: 'The item details stop at the wrapper; the agent gets references',
      line: `${found.opCalls.length} op calls; every sample value is searched for in the output.`,
      caption: `find lists titles, then fetches ${found.fetched.join(' and ')} in one item get, whose reply holds the field values. The wrapper drops those values while decoding the reply and prints only op:// references. Upstream documents one desktop approval for the command.`,
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
    this.shown.sequence = { marked: [], notes: [] } satisfies SequenceShown;
    const sequenceView = s.diagramView(sequence, (_st, sh) => {
      const q = having(sh, 'sequence').sequence;
      return {
        marks: Object.fromEntries(q.marked.map((id) => [id, sequence.emphasis])),
        notes: q.notes,
      };
    });
    this.shown.sequence = {
      marked: ['message:T->A#0'],
      // What the two calls cost, said on op itself, and what the agent's reply holds, said on the reply.
      notes: [
        { id: 'O', text: `${found.opCalls.length} calls, ${counted(approvals, 'approval')}`, side: 'right' },
        { id: 'message:T->A#0', text: `secret values: ${leaked || 'none'}`, side: 'below' },
      ],
    } satisfies SequenceShown;
    await this.play(sequenceView.sync());
    this.state.leaked = leaked;

    const ref = match.ref;
    const launched = run('desktop', { API_KEY: ref }, ['app']);
    await this.step('run', {
      title: 'op swaps the reference for the key as it starts the app',
      line: 'op resolves the API_KEY reference; the app gets its value and PATH.',
      caption: 'The agent passes the reference to run, and op resolves it as it starts the app: op’s environment holds the reference, the app’s holds the value. The agent’s request never contained the key, but the app can still print what it receives.',
    });
    await s.clear();
    // The command is a view; the line in focus is in `shown`.
    this.shown.commandFocus = null;
    const command = view(
      this,
      (_st, sh) =>
        code(s, [`2password run --env "API_KEY=${ref}" -- app`, `→ ${launched.argv.join(' ')}`], {
          at: regionBox('top', { bottom: 1.2 }),
          size: 0.3,
          lit: sh.commandFocus == null ? null : { lines: sh.commandFocus },
          key: 'command',
        }),
      { place: false },
    );
    await s.enter(command, { runTime: 0.4 });
    const before = s.keep(code(s, Object.entries(launched.opEnv).map(([k, v]) => `${k}=${v}`), {
      at: regionBox('full', { right: -0.75, top: 0.7 }),
      title: "op's environment",
      size: 0.26,
    }));
    const child = s.keep(code(s, Object.entries(launched.childEnv).map(([k, v]) => `${k}=${v}`), {
      at: regionBox('full', { left: 0.75, top: 0.7 }),
      title: "app's environment",
      size: 0.26,
    }));
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
    this.shown.commandFocus = 1;
    await this.play(command.sync());
    this.state.argv = launched.argv;
    this.state.childEnv = launched.childEnv;
  }
}
