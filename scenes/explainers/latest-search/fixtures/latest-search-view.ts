// Retained chart/state oracle; the public lesson uses one ticket-based story.
import { Scene, Group, Text, Axes, FadeIn } from '../../../../src/index.ts';
import type { View } from '../../../../explain/index.ts';
import { stage, settingsOf, view, having } from '../../../../explain/index.ts';
import { runSearch, SEARCH_CODE } from '../model.ts';
import type { CompletionOrder, Query, SearchSnapshot } from '../model.ts';

const shown = (value: Query | null) => value ?? 'none';
const point = (value: Query | null) => (value === 'A' ? 1 : value === 'B' ? 2 : 0);

/** A snapshot of the run, with the page's history; comparing, each rule's last result and history too. */
type ChartState = SearchSnapshot & {
  guard: string;
  order: CompletionOrder;
  compare: boolean;
  history: (Query | null)[];
  unguarded?: Query | null;
  guarded?: Query | null;
  unguardedHistory?: (Query | null)[];
  guardedHistory?: (Query | null)[];
};

export default class LatestSearchExplainer extends Scene<ChartState, { codeFocus?: { focus: [number, number]; focusAs: string } }> {
  static meta = {
    id: 'latest-search',
    title: 'Why can an older search replace the latest result?',
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/latest-search/model.ts',
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

    await this.step('start', {
      kind: 'detail',
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
    const key = new Text('0 none    1 A (older)    2 B (latest)', {
      fontSize: 0.43,
      color: colors.ink,
    }).moveTo([-3.7, -3.97]);
    const latest = new Text('Latest request: B', { fontSize: 0.45, color: colors.ink }).moveTo([-3.7, 2.42]);
    s.keep(axes, key, latest, {
      describe:
        'B is the latest request. Chart of the displayed result after zero, one and two completions: zero means none, one means A, two means B.',
    });
    await this.play(new FadeIn(axes), new FadeIn(key), new FadeIn(latest));
    const chart = view(
      this,
      (state) => {
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
          for (let i = 1; i < values.length; i++)
            picture.add(axes.dot(i, point(values[i]!), { color, radius: 0.09 }));
        };
        if (state.compare) {
          const both = having(state, 'unguardedHistory', 'guardedHistory');
          line(both.unguardedHistory, s.bad);
          line(both.guardedHistory, s.good);
        } else line(state.history, colors.accent);
        const label = (text: string, x: number, y: number, size = 0.4) =>
          picture.add(new Text(text, { fontSize: size, color: colors.ink }).moveTo([x, y]));
        if (state.compare) {
          const both = having(state, 'unguarded', 'guarded');
          label(`No guard: ${shown(both.unguarded)}`, -4.65, 1.57, 0.45);
          label(`Guard: ${shown(both.guarded)}`, -1.4, 1.57, 0.45);
        } else label(`Displayed: ${shown(state.shown)}`, -3.7, 1.57, 0.45);
        return picture;
      },
      { place: false },
    );
    this.chart = chart;
    s.keep(chart, {
      describe: () => {
        const state = this.state;
        return (
          `Search A started before B. B is latest. ${String(state.event)}; the page shows ${shown(state.shown)}. ` +
          (state.compare
            ? `Under the same completion order, no guard shows ${shown(having(state, 'unguarded').unguarded)} and the latest-request guard shows ${shown(having(state, 'guarded').guarded)}.`
            : `Completed: ${state.completed.join(', ') || 'none'}.`)
        );
      },
    });
    await this.play(new FadeIn(chart));
    // The lines in focus are how the code is shown (this.shown); the panel is a view of them.
    this.shown.codeFocus = { focus: [2, 2], focusAs: 'ticket' };
    const code = view(
      this,
      (_st, sh) => s.codePicture(SEARCH_CODE, { at: [0.7, -3.35, 7.55, 2.6], fontSize: 0.34, ...having(sh, 'codeFocus').codeFocus, key: 'code' }),
      { place: false },
    );
    await s.enter(code, { runTime: 0.4 });

    const firstResult = run.snapshots[1]!;
    await this.step('first', {
      kind: 'detail',
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
    this.shown.codeFocus = { focus: [4, 5], focusAs: 'guard' };
    await this.play(code.sync({ match: 'key', staged: true, runTime: 0.4 }));

    const last = run.snapshots[2]!;
    await this.step('second', {
      kind: 'detail',
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
      kind: 'detail',
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
