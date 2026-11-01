// The model behind the statecharts explainer. It has no drawing code: the scene
// asks it for every value on screen, and model.test.ts checks its answers.

/** An arrow: in state `from`, `event` moves the chart to state `to`. */
export interface Arrow {
  from: string;
  event: string;
  to: string;
}

/**
 * A statechart with nesting. `parent` gives each state's parent (null at the top).
 * A parent entered by an arrow enters its `initial` child, all the way down.
 */
export interface Chart {
  parent: Record<string, string | null>;
  initial?: Record<string, string>;
  arrows: Arrow[];
}

/** The coffee machine as drawn: `on` is a box of four states, with one POWER_OFF arrow on the box. */
export const COFFEE: Chart = {
  parent: { off: null, on: null, idle: 'on', grinding: 'on', brewing: 'on', ready: 'on' },
  initial: { on: 'idle' },
  arrows: [{ from: 'on', event: 'POWER_OFF', to: 'off' }],
};

/** The same machine as a plain state machine: every state carries its own POWER_OFF arrow. */
export const COFFEE_COPIED: Chart = {
  parent: { off: null, idle: null, grinding: null, brewing: null, ready: null },
  arrows: ['idle', 'grinding', 'brewing', 'ready'].map((from) => ({ from, event: 'POWER_OFF', to: 'off' })),
};

const ancestors = (c: Chart, state: string): string[] => {
  const out: string[] = [];
  for (let s: string | null | undefined = state; s; s = c.parent[s]) out.push(s);
  return out;
};

/** Entering a parent enters its initial child, down to a leaf. */
export function enter(c: Chart, state: string): string {
  const child = c.initial?.[state];
  return child ? enter(c, child) : state;
}

/**
 * The state an event moves a chart to from `state`, and the state that handled it.
 * The state's own arrows come first, then its parent's, and so on up: a child
 * that has an arrow for the event keeps it. Null when no state on the way handles it.
 */
export function send(c: Chart, state: string, event: string): { handledBy: string; to: string } | null {
  for (const owner of ancestors(c, state)) {
    const arrow = c.arrows.find((a) => a.from === owner && a.event === event);
    if (arrow) return { handledBy: owner, to: enter(c, arrow.to) };
  }
  return null;
}

/** The states with no children. */
export function leaves(c: Chart): string[] {
  const parents = new Set(Object.values(c.parent));
  return Object.keys(c.parent).filter((s) => !parents.has(s));
}

/**
 * The same behaviour with no nesting: for every leaf and every event, the arrow
 * that `send` finds, drawn from the leaf itself.
 */
export function flatten(c: Chart): Chart {
  const events = [...new Set(c.arrows.map((a) => a.event))];
  const arrows: Arrow[] = [];
  for (const from of leaves(c))
    for (const event of events) {
      const hit = send(c, from, event);
      if (hit) arrows.push({ from, event, to: hit.to });
    }
  return { parent: Object.fromEntries(leaves(c).map((s) => [s, null])), arrows };
}

/** Run a flat chart (no nesting) on a list of events; returns the state it ends in. */
export function runFlat(c: Chart, start: string, events: string[]): string {
  return events.reduce((state, event) => send(c, state, event)?.to ?? state, start);
}

// ---- Regions: one machine per independent feature, side by side ----

/** One region: its states, the state it starts in, and its arrows. */
export interface Region {
  states: string[];
  start: string;
  arrows: Arrow[];
}

/** A player with two regions. Playback and volume each keep one state at a time. */
export const PLAYER: Record<string, Region> = {
  playback: {
    states: ['playing', 'paused'],
    start: 'paused',
    arrows: [
      { from: 'paused', event: 'PLAY', to: 'playing' },
      { from: 'playing', event: 'PAUSE', to: 'paused' },
    ],
  },
  volume: {
    states: ['unmuted', 'muted'],
    start: 'unmuted',
    arrows: [
      { from: 'unmuted', event: 'MUTE', to: 'muted' },
      { from: 'muted', event: 'UNMUTE', to: 'unmuted' },
    ],
  },
};

/** One state per region, by region name. */
export type Config = Record<string, string>;

export const startOf = (rs: Record<string, Region>): Config =>
  Object.fromEntries(Object.entries(rs).map(([name, r]) => [name, r.start]));

/** Every region takes the event if it has an arrow for it from its current state; the others stay. */
export function sendRegions(rs: Record<string, Region>, config: Config, event: string): Config {
  return Object.fromEntries(
    Object.entries(config).map(([name, state]) => {
      const arrow = rs[name]!.arrows.find((a) => a.from === state && a.event === event);
      return [name, arrow ? arrow.to : state];
    }),
  );
}

export function runRegions(rs: Record<string, Region>, events: string[]): Config {
  return events.reduce((config, event) => sendRegions(rs, config, event), startOf(rs));
}

/** The name of a configuration, as a flat state: "playing · unmuted". */
export const nameOf = (config: Config) => Object.values(config).join(' · ');

/** The flat machine for a set of regions: one state per combination, one arrow per change. */
export function flattenRegions(rs: Record<string, Region>): Chart {
  const names = Object.keys(rs);
  let combos: Config[] = [{}];
  for (const name of names) combos = combos.flatMap((c) => rs[name]!.states.map((state) => ({ ...c, [name]: state })));
  const events = [...new Set(names.flatMap((n) => rs[n]!.arrows.map((a) => a.event)))];
  const arrows: Arrow[] = [];
  for (const combo of combos)
    for (const event of events) {
      const to = nameOf(sendRegions(rs, combo, event));
      if (to !== nameOf(combo)) arrows.push({ from: nameOf(combo), event, to });
    }
  return { parent: Object.fromEntries(combos.map((c) => [nameOf(c), null])), arrows };
}

// ---- Booleans: the flat, two-flag version with a bug ----

export interface Flags {
  isPlaying: boolean;
  isPaused: boolean;
  isMuted: boolean;
}

/**
 * A player that keeps its state in booleans. PLAY sets isPlaying and, by mistake,
 * leaves isPaused as it was, so PLAY, PAUSE, PLAY leaves both true.
 */
export function booleanRun(events: string[]): Flags {
  let f: Flags = { isPlaying: false, isPaused: false, isMuted: false };
  for (const event of events) {
    if (event === 'PLAY') f = { ...f, isPlaying: true };
    if (event === 'PAUSE') f = { ...f, isPlaying: false, isPaused: true };
    if (event === 'MUTE') f = { ...f, isMuted: true };
    if (event === 'UNMUTE') f = { ...f, isMuted: false };
  }
  return f;
}

/** Playing and paused at once: the combination the regions cannot hold. */
export const bothTrue = (f: Flags) => f.isPlaying && f.isPaused;
