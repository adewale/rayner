import { Group, Text, keyed } from '../../../src/index.ts';
import { tile } from '../../../explain/drawing.ts';
import type { DrawContext } from '../../../explain/index.ts';
import type { Cache, Comparison, Policy } from './model.ts';

export function drawCache(s: DrawContext, policy: Policy, state: Cache): Group {
  const x = policy === 'lru' ? -3.6 : 3.6, g = new Group();
  const say = (text: string, y: number, size = 0.64, suffix = text) => g.add(keyed(new Text(text, { fontSize: size, color: s.look.ink, shaping: s.shaping }).moveTo([x, y]), `${policy}:${suffix}`));
  say(policy.toUpperCase(), 2.35, 0.85);
  say('Newest → oldest', 1.45, 0.64);
  for (let i = 0; i < 3; i++) g.add(tile(s, state.order[i] ?? '–', { at: [x + (i - 1) * 1.65, 0.35], width: 1.4, height: 1.15, size: 0.85, key: `${policy}:slot:${i}` }));
  say(`Hits ${state.hits} · misses ${state.misses}`, -0.8, 0.64, 'counts');
  say(`Evicted: ${state.evicted ?? 'none'}`, -1.65, 0.64, 'evicted');
  say(state.hit === null ? 'Empty cache' : state.hit ? 'Last request: hit' : 'Last request: miss', -2.45, 0.64, 'outcome');
  return g;
}

export function drawRequests(s: DrawContext, state: Comparison): Group {
  return new Group(keyed(new Text(`Requests: ${state.history.join(' ') || 'none'}`, { fontSize: 0.62, color: s.look.soft, shaping: s.shaping }).moveTo([0, -3.55]), 'cache:requests'));
}
