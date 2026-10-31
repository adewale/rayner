import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/latest-search.ts';
import { Scene, Group, Text, Axes, FadeIn, view } from '../../../src/index.ts';
import type { SceneState, View } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { runSearch, SEARCH_CODE } from '../lib/latest-search.ts';
import type { CompletionOrder, Query, SearchSnapshot } from '../lib/latest-search.ts';

const shown = (value: Query | null) => value ?? 'none';
const point = (value: Query | null) => (value === 'A' ? 1 : value === 'B' ? 2 : 0);

export default class LatestSearchExplainer extends Scene {
  static meta = {
    id: 'latest-search',
    title: 'Why can an older search replace the latest result?',
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/latest-search.ts',
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then',
    ],
  };
  static settings = [
    {
      id: 'guard',
      label: 'Latest-request guard',
      default: 'off',
      options: [
        { value: 'off', label: 'No guard' },
        { value: 'on', label: 'Guard on' },
      ],
    },
    {
      id: 'order',
      label: 'Completion order',
      default: 'new-first',
      options: [
        { value: 'new-first', label: 'B then A' },
        { value: 'old-first', label: 'A then B' },
      ],
    },
  ];
  chart: View | null = null;

  override async construct() {
    const values = settingsOf(this);
    const guarded = values.guard === 'on';
    const order = values.order as CompletionOrder;
    // The displayed states come from resolving real JavaScript promises in an
    // explicit order. There is no network, clock or simulated response time.
    const [run, without, withGuard] = await Promise.all([
      runSearch(guarded, order),
      runSearch(false, order),
      runSearch(true, order),
    ]);
    const first = order === 'new-first' ? 'B' : 'A';
    const second = order === 'new-first' ? 'A' : 'B';
    const s = stage(this, { style: 'github-dark', headingSize: 0.6 });
    const snapshot = (index: number, compare = false) => {
      const now = run.snapshots[index]!;
      return {
        ...now,
        guard: guarded ? 'on' : 'off',
        order,
        compare,
        history: run.snapshots.slice(0, index + 1).map((item) => item.shown),
        ...(compare
          ? {
              unguarded: without.snapshots[2]!.shown,
              guarded: withGuard.snapshots[2]!.shown,
              unguardedHistory: without.snapshots.map((item) => item.shown),
              guardedHistory: withGuard.snapshots.map((item) => item.shown),
            }
          : {}),
      };
    };

    await readerFirst(this, s, readerFrames(guarded, order));
    await this.step('start', {
      detail: true,
      title: 'Why can a search for B end by showing older A?',
      line: 'First A, then B: which promise settles last?',
      caption:
        'Start A, then B, without waiting for either answer. B is the latest request. Without a guard, older A can replace B if it finishes last. We control when each promise resolves; the chart records what the page displays after each completion, not elapsed time.',
    });
    await s.clear();
    this.state = snapshot(0);
    const colors = s.palette;
    // The reference axes and key never rebuild during a state change. Only
    // the plotted result and its readout belong to the state-driven View.
    const axes = new Axes({
      xRange: [0, 2, 1],
      yRange: [0, 2, 1],
      width: 6.4,
      height: 3.1,
      axisStyle: { stroke: colors.muted, labelColor: colors.ink, labelFontSize: 0.36, includeNumbers: true },
      xLabel: 'completions',
      axisLabelFontSize: 0.37,
    });
    axes.shift([-3.65 - axes.c2p(1, 1)[0], -1.15 - axes.c2p(1, 1)[1]]);
    const key = new Text('0 none    1 A (older)    2 B (latest)', { fontSize: 0.43, color: colors.ink }).moveTo([
      -3.7, -3.97,
    ]);
    const latest = new Text('Latest request: B', { fontSize: 0.45, color: colors.ink }).moveTo([-3.7, 2.42]);
    s.keep(axes, key, latest, {
      describe:
        'B is the latest request. Chart of the displayed result after zero, one and two completions: zero means none, one means A, two means B.',
    });
    await this.play(new FadeIn(axes), new FadeIn(key), new FadeIn(latest));
    const chart = view(
      this,
      (state: SceneState) => {
        const picture = new Group();
        const line = (values: (Query | null)[], color: string) => {
          if (values.length < 2) return;
          // A completion changes the displayed value at one instant, not
          // gradually along the diagonal between two outcomes.
          const points: [number, number][] = [[0, point(values[0]!)]];
          for (let i = 1; i < values.length; i++) {
            points.push([i, point(values[i - 1]!)]);
            points.push([i, point(values[i]!)]);
          }
          picture.add(axes.lineGraph(points, { color, strokeWidth: 0.065 }));
          for (let i = 1; i < values.length; i++) picture.add(axes.dot(i, point(values[i]!), { color, radius: 0.09 }));
        };
        if (state.compare) {
          line(state.unguardedHistory as (Query | null)[], s.bad);
          line(state.guardedHistory as (Query | null)[], s.good);
        } else line(state.history as (Query | null)[], colors.accent);
        const label = (text: string, x: number, y: number, size = 0.4) =>
          picture.add(new Text(text, { fontSize: size, color: colors.ink }).moveTo([x, y]));
        if (state.compare) {
          label(`No guard: ${shown(state.unguarded as Query | null)}`, -4.65, 1.57, 0.45);
          label(`Guard: ${shown(state.guarded as Query | null)}`, -1.4, 1.57, 0.45);
        } else label(`Displayed: ${shown(state.shown as Query | null)}`, -3.7, 1.57, 0.45);
        return picture;
      },
      { place: false },
    );
    this.chart = chart;
    s.keep(chart, {
      describe: () => {
        const state = this.state;
        return (
          `Search A started before B. B is latest. ${String(state.event)}; the page shows ${shown(state.shown as Query | null)}. ` +
          (state.compare
            ? `Under the same completion order, no guard shows ${shown(state.unguarded as Query | null)} and the latest-request guard shows ${shown(state.guarded as Query | null)}.`
            : `Completed: ${(state.completed as Query[]).join(', ') || 'none'}.`)
        );
      },
    });
    await this.play(new FadeIn(chart));
    const code = await s.code(SEARCH_CODE, { at: [0.7, -3.35, 7.55, 2.6], fontSize: 0.34 });
    await code.focus([2, 2], { as: 'ticket' });

    const firstResult = run.snapshots[1]!;
    await this.step('first', {
      detail: true,
      title: `${first} completes first; the page shows ${shown(firstResult.shown)}`,
      line:
        guarded && first === 'A'
          ? 'A is already stale, even before B resolves.'
          : `Promise ${first} resolves and its callback runs.`,
      caption:
        first === 'B'
          ? 'The newer search B resolves first. Its ticket matches the latest request, so B is displayed with or without the guard.'
          : guarded
            ? 'The older A resolves first, but B has already started. A has the old ticket, so the guarded callback does not publish it; the page stays empty until B arrives.'
            : 'The older A resolves first. Without a guard its callback publishes A, while B remains pending.',
    });
    this.state = snapshot(1);
    await this.play(chart.sync({ match: 'index', runTime: 0.55 }));
    await code.focus([4, 5], { as: 'guard' });

    const last = run.snapshots[2]!;
    await this.step('second', {
      detail: true,
      title: `${second} completes second; the page shows ${shown(last.shown)}`,
      caption:
        order === 'new-first'
          ? guarded
            ? 'A resolves after B, but its ticket is no longer the latest. The guard ignores A, leaving B visible.'
            : 'A resolves after B. Without the ticket check A publishes over B, although the user’s latest search was B.'
          : 'B resolves after A. It is the latest request, so B is displayed in either policy. The order of completion matters to the unguarded result.',
    });
    this.state = snapshot(2);
    await this.play(chart.sync({ match: 'index', runTime: 0.55 }));

    await this.step('compare', {
      detail: true,
      title:
        order === 'new-first'
          ? 'When B finishes first, the guard prevents A from replacing it'
          : 'When A finishes first, both policies end on B',
      caption:
        order === 'new-first'
          ? 'The same two promises resolve B, then older A. Without a guard, older A overwrites the latest B. The ticket check ignores A, so B remains displayed. This models one page’s result update; it does not cancel either request or measure network speed.'
          : 'The same two promises resolve older A, then latest B. Both policies end on B. The guard still ignores A while B is pending, rather than briefly showing the older result. This models a page update, not request cancellation.',
    });
    this.state = snapshot(2, true);
    await this.play(chart.sync({ match: 'text', runTime: 0.55 }));
  }
}
