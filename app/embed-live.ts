// The live machine in the player: a reader's events, as the page's buttons offer them, its link
// writes them, and its exploration holds them.
//
// No DOM here, so Node runs it as the page does. The reader's state is the log of events they
// sent; a picture of it is the scene run again to the live step's end, then the log played through
// `machine.send` (`runLive` in explain/live.ts, which the command runs too), so a frame is still a
// function of time and a link with the log reopens the same picture. See docs/MACHINES.md, "The player".

import type { Machine } from '../explain/index.ts';
import type { LiveSession } from '../explain/internal.ts';
import { PAGE_QUERY } from '../explain/internal.ts';

type AnyMachine = Machine<object, string>;

/** The URL key that holds the reader's events, beside `step` (explain/page-query.ts). */
export const SENT = PAGE_QUERY.sent;

/** What one event does from a state, for a button: its kind and the reason the reader is told. */
export type EventOutcome = { event: string; label: string; kind: 'next' } | { event: string; label: string; kind: 'refused' | 'beyond'; reason: string | null };

/** An event's button label: the machine's label for it, else the event itself. */
export const eventLabel = (machine: AnyMachine, event: string): string => machine.spec.labels?.[event] ?? event;

/** Every event of `machine` from `state`, in the machine's order, as its buttons show it. */
export function outcomes(machine: AnyMachine, state: object): EventOutcome[] {
  return machine.spec.events.map((event) => {
    const o = machine.outcome(state, event), label = eventLabel(machine, event);
    return 'next' in o ? { event, label, kind: 'next' as const }
      : 'beyond' in o ? { event, label, kind: 'beyond' as const, reason: o.beyond }
        : { event, label, kind: 'refused' as const, reason: o.refused };
  });
}

/**
 * The longest prefix of `log` the machine accepts from `start`, the state after each kept event,
 * and the first event it stops at, if any: an event the machine does not have, one it refuses,
 * or one beyond the story. A link's log is checked here before anything is drawn.
 */
export function acceptedLog(machine: AnyMachine, start: object, log: readonly string[]): {
  kept: string[];
  states: object[];
  stopped?: { event: string; kind: 'unknown' | 'refused' | 'beyond'; reason: string | null };
} {
  const kept: string[] = [], states: object[] = [start];
  for (const event of log) {
    if (!machine.spec.events.includes(event)) return { kept, states, stopped: { event, kind: 'unknown', reason: null } };
    const o = machine.outcome(states.at(-1)!, event);
    if ('beyond' in o) return { kept, states, stopped: { event, kind: 'beyond', reason: o.beyond } };
    if ('refused' in o) return { kept, states, stopped: { event, kind: 'refused', reason: o.refused } };
    kept.push(event);
    states.push(o.next);
  }
  return { kept, states };
}

/** A log as the URL writes it: events joined by commas, each escaped, with spaces as `+` and colons kept. */
export function encodeLog(log: readonly string[]): string {
  return log.map((e) => encodeURIComponent(e).replaceAll('%20', '+').replaceAll('%3A', ':')).join(',');
}
/** The log a URL's (already decoded) `sent` value holds; empty for none. */
export function decodeLog(value: string | null): string[] {
  return value ? value.split(',') : [];
}

/**
 * The reader's exploration of the step on show: none, or live at a step (`now`: the step, its
 * machine and where its log starts) with the events sent there (`log`) and the run held at their
 * picture (`session`, null when none is held). The player keeps one such value; `explore` is its
 * only transition, and `exploreAndClose` the one the player applies.
 */
export type Exploration<N> = { kind: 'none' } | { kind: 'live'; now: N; log: readonly string[]; session: LiveSession | null };
/**
 * What changes the exploration: the reader sends an event, takes the last one back (`undo`), takes
 * them all back (`reset`), a step opens live with a log (`link`, a link's kept events or none),
 * a run is held at the log's picture of the step it ran to (`held`, with that step's `now`), or the
 * reader leaves the step (`leave`: another step, Next, another scenario).
 */
export type ExploreAction<N> =
  | { kind: 'send'; event: string }
  | { kind: 'undo' }
  | { kind: 'reset' }
  | { kind: 'link'; now: N; log: readonly string[] }
  | { kind: 'held'; now: N; session: LiveSession }
  | { kind: 'leave' };

const sameLog = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((e, i) => e === b[i]);

/**
 * The exploration after `action`. A held run stays only while it can play the reader's next event:
 * a send keeps it when it is idle at the log before the event, and every other change drops it
 * (Undo and Reset go back past its picture; a send while it still plays, an animated finish cut
 * short, starts a fresh run). A run held for another step than the one live (`now`, compared by
 * identity), or for a log other than the one on show, is not taken.
 * Sending, Undo and Reset when nothing is live, and Undo and Reset with nothing sent, change nothing.
 */
export function explore<N>(live: Exploration<N>, action: ExploreAction<N>): Exploration<N> {
  switch (action.kind) {
    case 'leave':
      return { kind: 'none' };
    case 'link':
      return { kind: 'live', now: action.now, log: [...action.log], session: null };
  }
  if (live.kind === 'none') return live;
  switch (action.kind) {
    case 'send': {
      const s = live.session,
        keep = s && s.open && !s.busy && sameLog(s.log, live.log) ? s : null;
      return { ...live, log: [...live.log, action.event], session: keep };
    }
    case 'undo':
      return live.log.length ? { ...live, log: live.log.slice(0, -1), session: null } : live;
    case 'reset':
      return live.log.length ? { ...live, log: [], session: null } : live;
    case 'held':
      return action.now === live.now && action.session.open && sameLog(action.session.log, live.log) ? { ...live, session: action.session } : live;
  }
}

/**
 * `explore`, then close every held run the result does not hold: the one held before, and one
 * handed in that was not taken. Each closed run's scene, paused in the step with its mobjects and
 * its suspended `construct`, can then be collected.
 */
export function exploreAndClose<N>(live: Exploration<N>, action: ExploreAction<N>): Exploration<N> {
  const next = explore(live, action),
    kept = next.kind === 'live' ? next.session : null;
  for (const s of [live.kind === 'live' ? live.session : null, action.kind === 'held' ? action.session : null])
    if (s && s !== kept) s.close();
  return next;
}
