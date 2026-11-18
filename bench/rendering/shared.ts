// Frozen subject models and editorial inputs shared by both rendering arms. No renderer imports.
export type Search = { kind: 'search'; values: number[]; target: number; lo: number; hi: number; mid: number | null };
export type Queue = { kind: 'queue'; slots: (number | null)[]; head: number; tail: number; size: number };
export type Model = Search | Queue;
export interface Step { id: string; title: string; line: string; caption: string; state: Model }
export interface Case { id: string; label: string; steps: Step[] }
export interface Packet { id: string; question: string; answer: string; leaves: string; cases: Case[]; questions: { q: string; a: string }[] }

export function searchStep(s: Search): Search {
  if (s.lo === s.hi) return { ...s, mid: null };
  const mid = Math.floor((s.lo + s.hi) / 2);
  return s.values[mid]! < s.target ? { ...s, lo: mid + 1, mid } : { ...s, hi: mid, mid };
}
export function queueStep(s: Queue, event: { push: number } | 'pop'): { state: Queue; reason?: string } {
  const slots = [...s.slots];
  if (event === 'pop') {
    if (!s.size) return { state: s, reason: 'Empty: nothing to remove.' };
    slots[s.head] = null;
    return { state: { ...s, slots, head: (s.head + 1) % slots.length, size: s.size - 1 } };
  }
  if (s.size === slots.length) return { state: s, reason: 'Full: insertion is refused.' };
  slots[s.tail] = event.push;
  return { state: { ...s, slots, tail: (s.tail + 1) % slots.length, size: s.size + 1 } };
}
export function summary(s: Model): string {
  return s.kind === 'search' ? `Target ${s.target}; low ${s.lo}; high ${s.hi}` : `Head ${s.head}; tail ${s.tail}; size ${s.size}`;
}
export function cells(s: Model): { label: string; active: boolean }[] {
  return s.kind === 'search'
    ? s.values.map((n, i) => ({ label: String(n), active: i >= s.lo && i < s.hi }))
    : s.slots.map((n) => ({ label: n === null ? 'empty' : String(n), active: n !== null }));
}
const searchAnswer = 'Keep the first position whose value is at least the target';
const queueAnswer = 'Removing an item frees a slot that insertion can reuse after wrapping';
function searchCase(target: number): Case {
  let state: Search = { kind: 'search', values: [1, 3, 3, 7, 9], target, lo: 0, hi: 5, mid: null };
  const steps: Step[] = [{ id: 's0', title: 'Search an interval', line: searchAnswer, caption: `Find the first value at least ${target}. Low is included; high is excluded.`, state }];
  while (state.lo !== state.hi) {
    const next = searchStep(state), mid = next.mid!;
    steps.push({ id: `s${steps.length}`, title: `Compare index ${mid}`, line: state.values[mid]! < target ? 'Discard this value and everything before it.' : 'Keep this position as a possible answer.', caption: `Index ${mid} holds ${state.values[mid]}. The remaining interval is [${next.lo}, ${next.hi}).`, state: next });
    state = next;
  }
  steps.push({ id: `s${steps.length}`, title: `Answer: index ${state.lo}`, line: searchAnswer, caption: `The interval is empty at ${state.lo}. That is the first position whose value is at least ${target}, including when the target itself is absent.`, state: { ...state, mid: null } });
  return { id: `target-${target}`, label: `Target ${target}`, steps };
}
function queueCase(capacity: number): Case {
  let state: Queue = { kind: 'queue', slots: Array<number | null>(capacity).fill(null), head: 0, tail: 0, size: 0 };
  const steps: Step[] = [{ id: 's0', title: 'An empty circular queue', line: queueAnswer, caption: `There are ${capacity} slots. Head removes the oldest value; tail inserts the next value. Size distinguishes full from empty.`, state }];
  for (const event of [{ push: 1 }, { push: 2 }, { push: 3 }, 'pop', { push: 4 }, 'pop'] as const) {
    const result = queueStep(state, event);
    state = result.state;
    steps.push({ id: `s${steps.length}`, title: event === 'pop' ? 'Remove the oldest value' : `Insert ${event.push}`, line: result.reason ?? summary(state), caption: result.reason ?? `${summary(state)}. Positions wrap at ${capacity}; a removed slot is available for reuse.`, state });
  }
  return { id: `capacity-${capacity}`, label: `${capacity} slots`, steps };
}
export const PACKETS: Packet[] = [
  { id: 'lower-bound', question: 'Where does a lower-bound search stop?', answer: searchAnswer, leaves: 'Sorted numeric arrays only; no floating-point ordering or performance claim.', cases: [searchCase(3), searchCase(6)], questions: [
    { q: 'For [2, 2, 5], where should target 2 stop?', a: 'At index 0: the first equal value is still a candidate.' },
    { q: 'For [2, 2, 5], where should target 6 stop?', a: 'At index 3, just after the array.' },
  ] },
  { id: 'circular-queue', question: 'Can a circular queue reuse an earlier slot?', answer: queueAnswer, leaves: 'A single-threaded bounded FIFO with refusal on full; no overwrite or concurrency.', cases: [queueCase(2), queueCase(3)], questions: [
    { q: 'Head equals tail. Is the queue necessarily empty?', a: 'No. Size distinguishes full from empty.' },
    { q: 'A full queue removes its oldest value. Can the next insertion succeed?', a: 'Yes. Removal frees one slot, even when the position wraps.' },
  ] },
];
