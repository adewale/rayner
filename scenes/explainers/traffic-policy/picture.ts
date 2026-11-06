// How the flow step's picture looks: both policies as bands from the load balancer through the nodes to
// the pods, drawn from what the step records. The cluster diagram itself is Mermaid source, built in the scene.
import { Group, Rectangle, Text, VMobject } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { add, frac, percent, podsOf, q, value } from './model.ts';
import type { Policy, Q } from './model.ts';

export const NODES = ['Node 1', 'Node 2', 'Node 3'];
export const POLICY: Record<Policy, string> = { cluster: 'Cluster', local: 'Local' };

// The flow picture: load balancer on top, nodes in the middle, pods at the bottom, each band as wide as
// its share of the outside requests. Bands take their entry node's colour, so a pod fed by several
// colours is fed by several nodes.
const NODE_COLORS = ['#0969da', '#bf8700', '#1a7f37', '#8250df', '#cf222e', '#57606a'];
const FLOW_W = 3.4,
  BAR_H = 0.42,
  FLOW_TEXT = 0.3;
// Short enough for a phone's opening view to hold one whole panel at a readable size.
const LB_Y = 1.2,
  NODE_Y = -0.2,
  POD_Y = -1.6;
/** A band from [a0, a1] at height ya down to [b0, b1] at yb, its sides eased into vertical at both ends. */
function band(a0: number, a1: number, ya: number, b0: number, b1: number, yb: number, color: string) {
  const m = (ya + yb) / 2;
  const v = new VMobject({ fill: color, fillOpacity: 0.4, stroke: 'none', strokeWidth: 0 });
  v.startNewPath([a0, ya]);
  v.addCubic([a0, m], [b0, m], [b0, yb]);
  v.addLineTo([b1, yb]);
  v.addCubic([b1, m], [a1, m], [a1, ya]);
  v.closePath();
  return v;
}
/** A fraction as the state records it ("1/6", "0"), read back as the model's exact fraction. */
export const parse = (f: string): Q => {
  const [num, den = '1'] = f.split('/');
  return q(Number(num), Number(den));
};
/** What the flow step records of one policy: each node's share, and every band as [node, pod, share]. */
export interface FlowState {
  nodes: string[];
  bands: [string, string, string][];
}
/**
 * One policy's flow, centred at x = cx, drawn from what the step records: the node shares and the
 * bands, each pod's share being the bands that reach it. The keys name the panel, each band and each pod.
 */
export function flowPanel(counts: readonly number[], policy: Policy, flow: FlowState, cx: number, ink: string, paper: string, mine: boolean) {
  const pods = podsOf(counts),
    node = flow.nodes.map(parse),
    bands = flow.bands.map(([at, pod, f]) => ({ node: NODES.indexOf(at), pod, share: parse(f) }));
  const share: Record<string, Q> = Object.fromEntries(
    pods.map((p) => [p.id, bands.filter((b) => b.pod === p.id).reduce((sum, b) => add(sum, b.share), q(0))]),
  );
  const w = (x: Q) => value(x) * FLOW_W;
  const text = (words: string, color = ink, size = FLOW_TEXT, bold = false) =>
    new Text(words, { fontSize: size, color, weight: bold ? 'bold' : 'normal' });
  const box = (x0: number, x1: number, y: number, fill: string, stroke = 'none') =>
    new Rectangle({ width: x1 - x0, height: BAR_H, fill, stroke, strokeWidth: 0.025 }).moveTo([(x0 + x1) / 2, y + BAR_H / 2]);
  const nodeX = counts.map((_, j) => cx + (j - (counts.length - 1) / 2) * 2.1);
  // Pods sit in slots one unit apart, centred under their node: where they run, whatever their share.
  const podX = new Map<string, number>();
  counts.forEach((c, j) => pods.filter((p) => p.node === j).forEach((p, i) => podX.set(p.id, nodeX[j]! + (i - (c - 1) / 2) * 0.95)));
  const parts: Mobject[] = [];
  // The policy's name sits left of the load balancer, with "this scenario" under it for the scenario's own policy.
  const nameAt: [number, number] = [cx - FLOW_W / 2 - 0.2, LB_Y + BAR_H / 2];
  const title = new Group(text(POLICY[policy], ink, 0.34, true).moveTo(nameAt, [1, 0]));
  if (mine) title.add(text('this scenario', ink).moveTo([nameAt[0], nameAt[1] - 0.42], [1, 0]));
  // Load balancer bar, its bottom cut into one segment per node, in node order.
  const lb = new Group(box(cx - FLOW_W / 2, cx + FLOW_W / 2, LB_Y, ink), text('Load balancer', paper).moveTo([cx, LB_Y + BAR_H / 2]));
  let lbAt = cx - FLOW_W / 2;
  const nodeIn = new Map<number, [number, number]>();
  node.forEach((x, j) => {
    nodeIn.set(j, [lbAt, lbAt + w(x)]);
    lbAt += w(x);
  });
  // Node bars: as wide as the node's share; a node with no share is an empty dashed outline.
  const nodeBars: Mobject[] = [];
  const nodeSpan = new Map<number, [number, number]>();
  counts.forEach((_, j) => {
    const width = value(node[j]!) > 0 ? w(node[j]!) : 1.4;
    const x0 = nodeX[j]! - width / 2;
    nodeSpan.set(j, [x0, x0 + width]);
    if (value(node[j]!) > 0) {
      const [a0, a1] = nodeIn.get(j)!;
      parts.push(band(a0, a1, LB_Y, x0, x0 + width, NODE_Y + BAR_H, NODE_COLORS[j]!));
      nodeBars.push(new Group(box(x0, x0 + width, NODE_Y, NODE_COLORS[j]!), text(NODES[j]!, paper).moveTo([nodeX[j]!, NODE_Y + BAR_H / 2])));
    } else {
      const outline = box(x0, x0 + width, NODE_Y, 'none', ink);
      outline.style.dashArray = '0.12 0.08';
      nodeBars.push(new Group(outline, text(NODES[j]!).moveTo([nodeX[j]!, NODE_Y + BAR_H / 2]), text('no band').moveTo([nodeX[j]!, NODE_Y - 0.32])));
    }
  });
  // Node to pod bands: out of each node bar in chain order, into each pod bar in node order.
  const out = new Map([...nodeSpan].map(([j, [x0]]) => [j, x0]));
  const into = new Map(pods.map((p) => [p.id, podX.get(p.id)! - w(share[p.id]!) / 2]));
  const bandMobs: Mobject[] = [];
  for (const b of bands) {
    const o = out.get(b.node)!,
      i = into.get(b.pod)!;
    const m = band(o, o + w(b.share), NODE_Y, i, i + w(b.share), POD_Y + BAR_H, NODE_COLORS[b.node]!);
    m.key = `traffic-flow:${policy}:band:${b.node + 1}:${b.pod}`;
    bandMobs.push(m);
    out.set(b.node, o + w(b.share));
    into.set(b.pod, i + w(b.share));
  }
  const podBars = pods.map((p) => {
    const x = podX.get(p.id)!,
      width = w(share[p.id]!);
    const g = new Group(
      box(x - width / 2, x + width / 2, POD_Y, ink),
      text(p.id, paper).moveTo([x, POD_Y + BAR_H / 2]),
      text(percent(share[p.id]!)).moveTo([x, POD_Y - 0.3]),
    );
    g.key = `traffic-flow:${policy}:pod:${p.id}`;
    return g;
  });
  const group = new Group(title, ...parts, ...bandMobs, lb, ...nodeBars, ...podBars);
  group.key = `traffic-flow:${policy}`;
  const words = () => {
    const nodeWords = counts
      .map((_, j) =>
        value(node[j]!) === 0
          ? `${NODES[j]} gets no band`
          : `${NODES[j]} gets ${frac(node[j]!)} and passes it to ${bands
              .filter((b) => b.node === j)
              .map((b) => `pod ${b.pod} (${frac(b.share)})`)
              .join(', ')}`,
      )
      .join('; ');
    return `${POLICY[policy]}: bands as wide as their share of requests, from the load balancer to the nodes and on to the pods. ${nodeWords}. Pods end with ${pods.map((p) => `${p.id} ${percent(share[p.id]!)}`).join(', ')}.`;
  };
  return { group, words };
}
