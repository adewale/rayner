import { Scene, FadeIn, Text, matchByKey } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { settingsOf, stage, Machine, view } from '../../../explain/index.ts';
import type { Stage, StagedStep, ExplainerMeta } from '../../../explain/index.ts';
import { dictStory, route, EMPTY, DELETED, DICT_EVENTS, dictStart, dictNext } from './model.ts';
import type { DictTable, DictLookup, DictState, DictEvent, DictPolicy } from './model.ts';
import { picture, stateView, visit, type View } from './picture.ts';
import { listed } from '../lib/format.ts';

/** A picture's words, in drawing order: what the stage says it shows. */
const words = (m: Mobject) => m.family().filter((t): t is Text => t instanceof Text).map((t) => t.text).filter(Boolean).join('. ');

/** A staged step's state: the table, the lookup it shows, the key asked for and the policy, and the lookup's route. */
type DictFrame = { dict: DictTable; result: DictLookup; key: number; policy: string; route?: ReturnType<typeof route> };

export default class PythonDict extends Scene<DictState, {}> {
  static meta = {
    sources: [
      'https://github.com/python/cpython/blob/v3.12.14/Objects/dictobject.c',
      'https://github.com/python/cpython/blob/v3.12.14/Include/internal/pycore_dict.h',
      'https://just-taking-a-ride.com/inside_python_dict/',
    ],
    // "Never used" names a slot's state; the tests hold what the sentences say about it.
    claims: [
      { says: 'never been used', test: 'model.test.ts: a probe route reads each visited slot in turn' },
      { says: 'never-used slot', test: 'model.test.ts: a probe route reads each visited slot in turn' },
      { says: 'reads never used, and stops', test: 'model.test.ts: a probe route reads each visited slot in turn' },
      { says: 'key 24 was never stored', test: 'model.test.ts: dictionary slots and deleted entries match captured CPython 3.12 storage' },
      { says: 'whose key never matches', test: 'model.test.ts: dictionary slots and deleted entries match captured CPython 3.12 storage' },
      { says: 'keeps only', test: 'model.test.ts: dictionary slots and deleted entries match captured CPython 3.12 storage' },
    ],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'key',
      label: 'Look up key',
      default: '8',
      options: [
        { value: '8', label: '8: pear' },
        { value: '16', label: '16: plum' },
      ],
    },
  ];
  override async construct() {
    const key = Number(settingsOf(this).key),
      m = dictStory(key),
      sixteen = dictStory(16).before,
      eight = dictStory(8).before;
    const value = m.before.value!,
      entry = m.original.entries.findIndex((e) => e.key === key),
      home = m.original.indices.indexOf(entry);
    /** What a search finds in each slot it passes, read from the table. */
    const passes = (dict: DictTable, slots: number[]) =>
      slots.map((i) => {
        const at = dict.indices[i]!;
        return at === DELETED ? `D at ${i}` : at === EMPTY ? `never used at ${i}` : `key ${dict.entries[at]!.key} at ${i}`;
      });
    const onward = m.repaired.slots.slice(1);
    const missingPasses = passes(m.correct, m.missing.slots.slice(0, -1)),
      missingStop = m.missing.slots.at(-1)!;
    /** The first never-used slot that one of 24's arrows flies over, and the hop that flies over it, from the route. */
    const missingRoute = route(m.correct, m.missing),
      offRoute = missingRoute.passedOver[0],
      overHop = offRoute === undefined ? -1 : m.missing.slots.findIndex((b, i) => i > 0 && Math.min(b, m.missing.slots[i - 1]!) < offRoute && offRoute < Math.max(b, m.missing.slots[i - 1]!));

    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    const staged = (frames: readonly (Omit<StagedStep<DictFrame>, 'draw'> & { view: View })[]) =>
      s.steps(frames.map(({ view, ...frame }): StagedStep<DictFrame> => ({
        ...frame,
        // The table, and the route where the view draws one, come from the step's state; the view adds how to show them.
        draw: (state, st: Stage) =>
          picture(st, { ...view, dict: state.dict, ...(view.path ? { path: state.result } : {}) }),
      })));
    const lookupView = (dict: DictTable, q: DictLookup, rest: Omit<View, 'dict' | 'path' | 'ask' | 'middle'>): View =>
      ({ dict, path: q, ask: `d[${q.key}]`, middle: visit(q), ...rest });

    await staged([
      {
        id: 'question',
        title: `Delete key 0. Can Python still find key ${key}?`,
        line: `Predict: if del d[0] just empties slot 0, what does d[${key}] give?`,
        caption: `This dict uses an index and a separate entry table: a slot points to the entry holding its key and value. Here slot ${home} points to ${value}’s entry. The – marks a slot that has never been used. Delete key 0 by clearing slot 0 and its entry. Would d[${key}] still find ${value}?`,
        state: { dict: m.original, result: m.before, key, policy: 'prediction' },
        predict: { options: [value, 'KeyError'], answer: m.broken.found ? m.broken.value! : 'KeyError' },
        view: {
          dict: m.original,
          path: null,
          ask: `d[${key}]`,
          middle: `now: ${value}`,
          outcome: 'after del d[0]?',
          found: null,
          bad: [0],
          note: '– marks a slot that has never been used.',
        },
      },
    ]);

    /**
     * The dict as a machine: each deletion and lookup is an event of the tested model, and the picture is drawn from
     * the state alone. The keyed morph between states keeps every slot and entry row the same part, so a deletion
     * visibly writes D (or, in the counterfactual, a dash) into the slot it found, and dashes into its entry, in place.
     * `rayner check` explores every state each machine reaches from the intact dict: the clearing one in `broken`,
     * CPython's in `missing`. There is no story bound: with only deletions and lookups the eight slots never fill.
     */
    /** A machine step: the intact dict fades in, then the events play, each a keyed morph to the model's next state. */
    const play = async (policy: DictPolicy, events: DictEvent[]) => {
      await s.clear({ runTime: 0.18 });
      const start = dictStart(policy);
      this.state = { ...start };
      const pictures = view(this, (st) => picture(s, stateView(st)), { place: false });
      const machine = new Machine<DictState, DictEvent>(this, {
        start,
        events: DICT_EVENTS,
        next: dictNext,
        views: [pictures],
        // A slot's entry, a cell or a panel line whose words change is replaced in place, not morphed glyph by glyph.
        match: matchByKey({ text: 'whole' }),
        runTime: ({ event }) => (event.startsWith('del ') ? 1 : 0.8),
      });
      s.keep(pictures, { describe: () => words(pictures.current) });
      s.opening(pictures);
      await this.play(new FadeIn(pictures, { runTime: 0.24 }));
      await this.play(machine.replay(events));
      return machine;
    };

    await this.step('broken', {
      title: `Empty slot 0, and d[${key}] can no longer find ${value}`,
      line: `The search for ${key} starts at slot 0, reads never used, and stops.`,
      caption: `Suppose deletion emptied slot 0 like this. d[${key}] would raise KeyError, although ${value} is still stored in entry ${entry}: these three keys all start their searches at slot 0. When 0 occupied it, the other keys went into later slots. A lookup retraces that route, and a never-used slot tells it to stop. An emptied slot would end the search early, so deletion leaves a marker that says keep looking.`,
    });
    await play('incorrect-clear', ['del d[0]', `d[${key}]` as DictEvent]);

    await this.step('marker', {
      title: 'CPython leaves D in slot 0, and the search goes on',
      line: 'Predict: key 24 was never stored and starts at slot 0. Where does its search stop, and why?',
      // The route's later slots and the never-used slot it flies over; the answer is where the model's search stops.
      predict: { options: [...new Set([...m.missing.slots.slice(1), ...(offRoute === undefined ? [] : [offRoute])])].sort((a, b) => a - b).map((i) => `slot ${i}`), answer: `slot ${missingStop}` },
      caption: `In CPython, del d[0] writes a deleted marker, drawn here as D, into slot 0 and empties entry 0. A search treats D as a taken slot whose key never matches: the search for ${key} reads D at slot 0, moves on to slot ${onward.join(', then ')}, and finds ${m.repaired.value}. The arrows under the slots follow the search from each slot it reads to the next.`,
    });
    const cpython = await play('CPython marker', ['del d[0]', `d[${key}]` as DictEvent]);

    // The same dict answers the prediction: d[24] is one more event, so the route and the panel morph from d[key]'s.
    await this.step('missing', {
      title: `Answer: at slot ${missingStop}, the first never-used slot on its route`,
      line: 'D and taken slots send a search on; a never-used slot stops it.',
      caption: `Key 24’s search passes ${listed(missingPasses)}, and stops at slot ${missingStop}, which has never been used: 24 is not in the dict. ${
        offRoute === undefined
          ? ''
          : `Slot ${offRoute} has never been used either, but the arrow from slot ${m.missing.slots[overHop - 1]} to slot ${m.missing.slots[overHop]} flies over it, so the search skips it. `
      }A deleted marker keeps the route open; a never-used slot on the route is the evidence that the key is absent.`,
    });
    await this.play(cpython.replay(['d[24]']));

    await staged([
      {
        id: 'hash',
        kind: 'detail',
        title: 'Why slot 0: all three keys start there',
        line: 'An eight-slot index keeps only the hash’s low three bits.',
        caption: `For these keys, Python uses the integer itself as its hash, so the hashes are ${m.starts.map((h) => h.hash).join(', ')}. With eight slots, Python keeps only the last three bits of the hash, and all three end in 000 in binary, so all three keys start at slot 0. Key 0 was stored first and took it.`,
        state: { dict: m.original, result: m.before, key, policy: 'CPython marker' },
        view: {
          dict: m.original,
          path: null,
          ask: `d[${key}]`,
          middle: '',
          outcome: '',
          found: null,
          bad: [],
          lit: [0],
          note: 'Start slot: the last three bits of the hash.',
          hashes: m.starts,
        },
      },
      {
        id: 'collision',
        kind: 'detail',
        title: 'A taken slot sends the search on',
        line: `Key 16 passes taken slots ${listed(sixteen.slots.slice(0, -1).map(String))} to reach slot ${sixteen.slots.at(-1)}.`,
        caption: `When a key’s slot is taken, Python works out the next slot from the hash and tries again. Storing 8, it found slot 0 taken and used slot ${eight.slots.at(-1)}; storing 16, it found ${listed(sixteen.slots.slice(0, -1).map(String))} taken and used slot ${sixteen.slots.at(-1)}. A lookup retraces the same path, checking the key in each taken slot, until the key matches or it reads a never-used slot. That is why an emptied slot 0 stops the search for 8 and for 16.`,
        state: { dict: m.original, result: sixteen, key, policy: 'CPython marker', route: route(m.original, sixteen) },
        view: lookupView(m.original, sixteen, {
          outcome: sixteen.value!,
          found: true,
          bad: [],
          note: `Key 16 visits ${sixteen.slots.join(' > ')}; key 8 visits ${eight.slots.join(' > ')}.`,
        }),
      },
    ]);
  }
}
