import {
  Scene,
  Code,
  Group,
  Create,
  FadeIn,
  FadeOut,
  Transform,
  TransformDiff,
  SurroundingRectangle,
  Circumscribe,
} from '../../../src/index.ts';
import type { Box, Mobject } from '../../../src/index.ts';
import { stage, settingsOf, answerOf, having } from '../../../explain/index.ts';
import type { NoteSide } from '../../../explain/index.ts';
// The merge request: the two texts TransformDiff animates, which
// fidelity.ts holds to the real git diff.
import { BEFORE_CODE, AFTER_CODE, BEFORE_SPANS, AFTER_SPANS } from './code.ts';
import { frames as readerFrames, panel, inWords, linesBox, lineBar, drawRequestPaths } from './picture.ts';
import { counted } from '../lib/format.ts';

const STYLE = 'hand-drawn';
const BEFORE = 'graph LR\nRequest[Request] --> H[Handler]\nH --> D1[(D1)]';
const AFTER =
  'graph LR\nRequest[Request] --> H[Handler]\nH --> KV[KV cache]\nKV -->|miss| D1[(D1)]\nKV -->|hit| Reply[Reply]\nD1 --> Reply';
const OPS = [
  { kind: 'remove_edge', id: 'H->D1#0' },
  { kind: 'add_node', id: 'KV', label: 'KV cache' },
  { kind: 'add_node', id: 'Reply', label: 'Reply' },
  { kind: 'add_edge', from: 'H', to: 'KV' },
  { kind: 'add_edge', from: 'KV', to: 'D1', label: 'miss' },
  { kind: 'add_edge', from: 'KV', to: 'Reply', label: 'hit' },
  { kind: 'add_edge', from: 'D1', to: 'Reply' },
];
const PATH = {
  hit: [
    ['Request', 'H'],
    ['H', 'KV'],
    ['KV', 'Reply'],
  ],
  miss: [
    ['Request', 'H'],
    ['H', 'KV'],
    ['KV', 'D1'],
    ['D1', 'Reply'],
  ],
} as const;
const FONT = 0.21;
/** Where the code sits: the bottom region, with a column on the right for callouts on what the diff did. */
const CODE_BOX: Box = [-7.55, -4.25, 3.35, -0.65],
  NOTES_BOX: Box = [3.65, -4.25, 7.55, -0.65];
const ADDED = '#2ea043',
  CHANGED = '#bf8700';

// How the flow diagram is shown, apart from its source: the hops walked, its notes and what stays
// undimmed. That is `shown`, not the model; its view draws it, and each change is a sync.
type FlowState = { walked: [string, string][]; notes: { id: string; text: string; side: NoteSide }[]; dim: string[] | null };
/** How many database reads the change leaves, then the request followed and its reads. */
type CacheState = { databaseReads?: string; request?: 'hit' | 'miss'; reads?: number };

export default class CacheMRExplainer extends Scene<CacheState, { flow?: FlowState }> {
  static meta = {
    sources: [
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/mr-cache.ts',
      'https://developers.cloudflare.com/kv/api/read-key-value-pairs/',
    ],
    watch: { databaseReads: 'Database reads', request: 'Request', reads: 'D1 reads' },
    // Each speaks of the code drawn in its own step.
    claims: [
      { says: 'Before: every request reads D1', shown: true as const },
      { says: 'every lookup is a database read', shown: true as const },
      { says: 'so only a miss reaches D1', shown: true as const },
    ],
  };
  static settings = [
    {
      id: 'request',
      label: 'Follow a request',
      default: 'hit',
      options: [
        { value: 'hit', label: 'Cache hit' },
        { value: 'miss', label: 'Cache miss' },
      ],
    },
  ];
  override async construct() {
    const which = settingsOf(this).request as 'hit' | 'miss',
      s = stage(this, { headingSize: 0.6, style: STYLE });

    await readerFrames(s, which, answerOf(this), { kind: 'short' });
    await this.step('before', {
      kind: 'detail',
      title: 'Before: every request reads D1',
      line: 'getUser is one D1 query, the outlined line 2.',
      caption:
        'getUser is a single D1 query, the outlined line, so the walked request goes from the handler straight to D1, and every lookup is a database read.',
    });
    await s.clear();
    const flow = await s.show({ source: BEFORE }, { box: 'top' });
    const flowState = () => having(this.shown, 'flow').flow;
    const drawFlow = (_st: CacheState, sh: { flow?: FlowState }) => {
      const f = having(sh, 'flow').flow;
      return { marks: flow.trail(f.walked), notes: f.notes, dim: f.dim };
    };
    const showFlow = async (change: Partial<FlowState>, runTime = 0.45) => {
      this.shown.flow = { ...flowState(), ...change };
      await this.play(flowView.sync({ match: 'key', staged: true, runTime }));
    };
    this.shown.flow = { walked: [], notes: [], dim: null } satisfies FlowState;
    let flowView = s.diagramView(flow, drawFlow);
    const colors = s.palette,
      hot = s.emphasis;
    const before = new Code(BEFORE_CODE, { fontSize: FONT, color: colors.ink, spans: BEFORE_SPANS }),
      after = new Code(AFTER_CODE, { fontSize: FONT, color: colors.ink, spans: AFTER_SPANS });
    // The merged file's panel decides where the code sits, and the old file
    // starts at its top-left corner: in the diff, the header line stays put and
    // the other lines move only down, to where the hunks put them.
    const merged = panel(s, after, CODE_BOX, 'users.ts');
    const [left, , , top] = merged.rect.box()!;
    const shown = panel(s, before, CODE_BOX, 'users.ts', [left, top]);
    // One description for the panel, whichever code it holds: its title stays through the diff.
    let held = before;
    const panelWords = () => inWords('users.ts', held);
    s.keep(shown.rect, shown.label, before, { describe: panelWords });
    // Three objects on the scene, not a group: TransformDiff replaces the Code by itself.
    await this.play(...[shown.rect, shown.label, before].map((m) => new FadeIn(m, { runTime: 0.4 })));
    const handled: [string, string][] = [
      ['Request', 'H'],
      ['H', 'D1'],
    ];
    await flow.walk(handled);
    await showFlow({ walked: handled });
    const outline = { buff: 0.06, cornerRadius: 0.06, stroke: hot, strokeWidth: 0.03 };
    const query = s.keep(new SurroundingRectangle(linesBox(before, 1, 1), outline), {
      describe: 'Line 2, the D1 query, outlined',
    });
    await this.play(new Create(query, { runTime: 0.5 }));
    this.state.databaseReads = 'every request';

    await this.step('diff', {
      kind: 'detail',
      title: 'Four added lines and one rewritten',
      line: 'The old return keeps its D1 call; the added lines check KV first.',
      caption:
        'The first line stays and the closing brace moves down to make room. The old return keeps its D1 call inside const row = await, and the added lines grow in. The outlined lines check KV first, so only a miss reaches D1, and the row is then written to KV for 300 seconds.',
    });
    await showFlow({ walked: [], notes: [] });
    await this.play(new FadeOut(query, { runTime: 0.3 }));
    s.keep(merged.rect, after, { describe: panelWords });
    // The diff drives the morph: unchanged lines travel whole, the rewritten
    // return keeps its shared tokens, added lines grow in. The hunks are
    // recorded in the trace, where fidelity.ts holds them to
    // the real git CLI.
    const diff = new TransformDiff(before, after, { runTime: 1.6 });
    await this.play(diff, new Transform(shown.rect, merged.rect, { replace: true, runTime: 1.6 }));
    held = after;
    // What each line did, from the transform's own plan.
    const { changed, removed, added } = diff.plan;
    const bars = new Group(
      ...changed.map(([, j]) => lineBar(after, merged.rect, j, CHANGED)),
      ...added.map((j) => lineBar(after, merged.rect, j, ADDED)),
    );
    const numbers = (js: number[]) => js.map((j) => j + 1).join(', ');
    s.keep(bars, {
      describe: `Bars behind the lines the diff touched: line ${numbers(changed.map(([, j]) => j))} rewritten, lines ${numbers(added)} added`,
    });
    this.add(bars);
    this.add(after); // the code stays in front of its bars
    await this.play(new FadeIn(bars, { runTime: 0.5 }));
    // What the diff did, said beside the bars it put there: each run of rewritten or added lines
    // gets a callout in the column right of the code. Unchanged lines have no bar and no callout.
    const runs: { from: number; to: number; what: string; color: string }[] = [];
    for (const [js, what, color] of [
      [changed.map(([, j]) => j), 'rewritten', CHANGED],
      [added, 'added', ADDED],
    ] as const)
      for (const j of [...js].sort((a, b) => a - b)) {
        const last = runs.at(-1);
        if (last && last.what === what && last.to === j - 1) last.to = j;
        else runs.push({ from: j, to: j, what, color });
      }
    if (removed.length) throw new Error('The merge request removes no line; a removed line would need its own callout');
    const right = merged.rect.box()![2],
      said: Mobject[] = [];
    for (const r of runs.sort((a, b) => a.from - b.from)) {
      const box = linesBox(after, r.from, r.to);
      said.push(
        await s.callout([right - 0.1, box[1], right - 0.1, box[3]], `${counted(r.to - r.from + 1, 'line')} ${r.what}`, {
          side: 'right',
          gap: NOTES_BOX[0] - right + 0.15,
          color: r.color,
          size: 0.24,
        }),
      );
    }
    const lookup = new Circumscribe(linesBox(after, 1, 2), {
      keep: true,
      color: hot,
      buff: 0.06,
      cornerRadius: 0.06,
      strokeWidth: 0.03,
    });
    s.keep(lookup.outline, { describe: 'Lines 2 and 3, the KV lookup, outlined' });
    await this.play(lookup);

    await this.step('after', {
      kind: 'detail',
      title: 'Replayed on the diagram, the diff adds KV and a hit path',
      line: 'A hit goes from KV to Reply; a miss falls through to D1.',
      caption:
        'The same edit, replayed as diagram operations, removes the handler’s edge to D1 and puts a KV cache between them. A hit goes from KV straight to Reply, while a miss falls through to D1 before replying.',
    });
    // The diff's bars and what they said go; the diagram takes the same edit.
    await this.play(...[bars, lookup.outline, ...said].map((m) => new FadeOut(m, { runTime: 0.4 })));
    s.liveDiagram(flow);
    await flow.morph({ source: AFTER }, { ops: OPS });
    flowView = s.diagramView(flow, drawFlow);
    await showFlow({ notes: [{ id: 'KV', text: 'TTL 300 s', side: 'above' }] });
    this.state.databaseReads = 'misses only';

    await this.step('request', {
      kind: 'detail',
      title:
        which === 'hit'
          ? 'In the merged code, a hit stops at line 3'
          : 'In the merged code, a miss runs on to line 6',
      line:
        which === 'hit'
          ? 'Lines 2 and 3 run; the hit returns before line 4’s D1 query.'
          : 'After the empty lookup, lines 4 to 6 read D1, write KV and return.',
      caption:
        which === 'hit'
          ? 'Walked through the edited diagram and code, the hit takes KV’s hit branch: line 2 reads KV and line 3 returns what it found, before line 4’s D1 query. The two rows put both paths side by side: the miss row carries the read this request avoids and the 300-second write it does not need.'
          : 'Walked through the edited diagram and code, the miss finds nothing at line 3 and runs on: line 4 reads D1 as before the change, line 5 writes the row to KV for 300 seconds, and line 6 returns it. A later lookup for the same user can take the hit row until that entry expires, although KV can take 60 seconds or longer to show a new write in other locations.',
    });
    const path = PATH[which];
    await showFlow({ notes: [], dim: [...new Set(path.flat())] });
    await flow.walk(path);
    await showFlow({ walked: path.map(([a, b]) => [a, b] as [string, string]) });
    // A hit runs the lookup and returns; a miss runs the lookup too, then the lines outlined here.
    const [a, b] = which === 'hit' ? [1, 2] : [3, 5];
    const ran = s.keep(new SurroundingRectangle(linesBox(after, a, b), outline), {
      describe: `Lines ${a + 1} to ${b + 1}, ${which === 'hit' ? 'the ones this request runs' : 'the ones only a miss runs'}, outlined`,
    });
    await this.play(new Create(ran, { runTime: 0.5 }));
    await showFlow({ notes: [{ id: 'D1', text: which === 'hit' ? '0 reads' : '1 read', side: 'below' }] });
    this.state.request = which;
    this.state.reads = which === 'hit' ? 0 : 1;
    // Keep the comparison together. The preceding walk follows the captured
    // program path; its result now replaces the detailed diagram/code view.
    await s.clear();
    const result = drawRequestPaths(which, { emphasis: s.emphasis, ink: s.palette.ink, soft: s.soft });
    await s.enter(result, {
      describe: `Two request paths, ${which} highlighted: hit goes from KV to Reply with 0 D1 reads; miss goes from KV through D1 to Reply with 1 D1 read and caches the row for 300 seconds.`,
    });
  }
}
