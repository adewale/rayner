import { Scene, Group, Rectangle, Text, VMobject } from '../../../src/index.ts';
import type { Box, Mobject } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import {
  CLIENT_IP,
  PLACEMENTS,
  endpointsOn,
  flows,
  frac,
  nodeIp,
  nodeShares,
  passes,
  percent,
  podsOf,
  q,
  ruleShares,
  rules,
  secondHop,
  seenSource,
  shares,
  value,
} from '../lib/traffic-policy.ts';
import type { PlacementKey, Policy, Q } from '../lib/traffic-policy.ts';

// Sources: kubernetes/kubernetes at tag v1.37.1 and kubernetes/website at commit 0c2509f; the lines each
// claim rests on are quoted in lib/traffic-policy.ts and beside the steps below.
const K8S = 'https://github.com/kubernetes/kubernetes/blob/v1.37.1/';
const WEB = 'https://github.com/kubernetes/website/blob/0c2509f55f9de644acef9232e4ec1ab6cbd01dcc/content/en/docs/';

// excalidraw was tried first: its hatched fills, recoloured and thickened by a mark, hid the marked labels.
const STYLE = 'github-light';
const NODES = ['Node 1', 'Node 2', 'Node 3'];
const NAMES = ['one', 'two', 'three', 'four', 'five', 'six'];
const POLICY: Record<Policy, string> = { cluster: 'Cluster', local: 'Local' };

/**
 * The cluster as an architecture diagram: the load balancer under three node groups, each node's address
 * at the bottom of its group and its pods in a row over it. Every edge names its ports, and the align
 * lines hold the addresses in one row and each node's pods in a row, so the nodes keep their order and
 * shape in all three placements (captured and compared for each). With the load balancer above, its
 * edges crossed the group headers. Under Cluster one more edge draws a second hop, from Node 3 to the
 * last pod on Node 2.
 */
function cluster(counts: readonly number[], policy: Policy): string {
  const pods = podsOf(counts);
  const lines = [
    '---',
    'config:',
    '  architecture:',
    '    fontSize: 24',
    '    iconSize: 60',
    '---',
    'architecture-beta',
    '  service lb(internet)[Load balancer]',
  ];
  counts.forEach((_, j) => {
    // The group's own title would sit in its header, where a pod's box can cover it; the node's name
    // goes in its address's label instead.
    lines.push(`  group n${j + 1}[ ]`, `  service k${j + 1}(server)[${NODES[j]} · ${nodeIp(j)}] in n${j + 1}`);
    for (const p of pods) if (p.node === j) lines.push(`  service ${p.id}(disk)[Pod ${p.id}] in n${j + 1}`);
  });
  lines.push('  lb:L --> B:k1', '  lb:T --> B:k2', '  lb:R --> B:k3');
  for (const p of pods) lines.push(`  k${p.node + 1}:T --> B:${p.id}`);
  if (policy === 'cluster') lines.push(`  k3:L --> R:${hopTarget(counts)}`);
  lines.push('  align row k1 k2 k3');
  counts.forEach((_, j) => {
    const own = pods.filter((p) => p.node === j);
    if (own.length > 1) lines.push(`  align row ${own.map((p) => p.id).join(' ')}`);
  });
  return lines.join('\n');
}
/** The pod the drawn second hop reaches: the last pod on Node 2, which every placement has. */
const hopTarget = (counts: readonly number[]) =>
  podsOf(counts)
    .filter((p) => p.node === 1)
    .at(-1)!.id;

const named = (n: number) => NAMES[n - 1] ?? String(n);
const podList = (ids: readonly string[]) =>
  ids.length === 1 ? `pod ${ids[0]}` : `pods ${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`;
const nodeList = (nodes: readonly number[]) =>
  nodes.length === 1
    ? NODES[nodes[0]!]!
    : `${nodes
        .slice(0, -1)
        .map((j) => NODES[j])
        .join(', ')} and ${NODES[nodes.at(-1)!]}`;
/** "Node 1 runs 3 pods, Node 2 runs 1 and Node 3 runs none." */
const placementWords = (counts: readonly number[]) => {
  const parts = counts.map(
    (n, j) => `${NODES[j]} runs ${n === 0 ? 'none' : j === 0 ? `${n} pod${n === 1 ? '' : 's'}` : n}`,
  );
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
};
/** "1 in 4" for a fraction. */
const inN = (x: Q) => (x[0] === 0 ? 'none' : x[0] === x[1] ? 'all' : `${x[0]} in ${x[1]}`);
/** Pods grouped by share, largest share first: [[share, ids], ...]. */
function byShare(s: Record<string, Q>): [Q, string[]][] {
  const groups = new Map<string, [Q, string[]]>();
  for (const [id, share] of Object.entries(s)) {
    const key = frac(share);
    if (!groups.has(key)) groups.set(key, [share, []]);
    groups.get(key)![1].push(id);
  }
  return [...groups.values()].sort((a, b) => value(b[0]) - value(a[0]));
}
/** A card line for each share: "pods a, b, c" → "1/6 each (16.7%)". */
const shareRows = (s: Record<string, Q>) =>
  byShare(s).map(
    ([share, ids]) =>
      [podList(ids).replace(/^p/, 'P'), `${frac(share)}${ids.length > 1 ? ' each' : ''} (${percent(share)})`] as const,
  );

// The widest Cluster topology needs the full stage width to keep every
// imported service label above the completed-view readability floor.
const DIAGRAM: Box = [-8, -1.25, 8, 3.2];
const BELOW: Box = [-7.55, -4.25, 7.55, -1.45];
const SIZE = 0.24;

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
/** One policy's flow, centred at x = cx. The keys name the panel, each band and each pod. */
function flowPanel(counts: readonly number[], policy: Policy, cx: number, ink: string, paper: string, mine: boolean) {
  const pods = podsOf(counts),
    node = nodeShares(counts, policy),
    share = shares(counts, policy),
    bands = flows(counts, policy);
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
/** The script's one-sentence answer (script.md); the shares step's caption states it. */
const ANSWER = 'The load balancer weighs nodes, not pods';

// The check questions' placements and chain, none of them drawn: 4, 1, 0 under Local; a four-pod chain;
// and every placement of four pods on three nodes, kept when Local gives every pod the same share.
const FOUR_ONE = shares([4, 1, 0], 'local'),
  FOUR_ONE_NODES = nodeShares([4, 1, 0], 'local'),
  CHAIN4 = rules(['a', 'b', 'c', 'd']);
const EVEN4 = [0, 1, 2, 3, 4]
  .flatMap((x) => [0, 1, 2, 3, 4].map((y) => [x, y, 4 - x - y]))
  .filter((c) => c[2]! >= 0)
  .filter((c) => new Set(Object.values(shares(c, 'local')).map(frac)).size === 1);
/** The even placements up to the nodes' order, largest count first: "4, 0, 0" and "2, 2, 0". */
const EVEN4_SHAPES = [...new Set(EVEN4.map((c) => [...c].sort((a, b) => b - a).join(', ')))];

export default class TrafficPolicyExplainer extends Scene {
  static meta = {
    id: 'traffic-policy',
    title: 'How does traffic policy divide requests among pods?',
    sources: [
      K8S + 'pkg/proxy/iptables/proxier.go#L390-L392',
      K8S + 'pkg/proxy/iptables/proxier.go#L1454-L1472',
      K8S + 'pkg/proxy/iptables/proxier.go#L853-L866',
      K8S + 'pkg/proxy/iptables/proxier.go#L1099-L1151',
      K8S + 'pkg/proxy/iptables/proxier.go#L1198-L1213',
      K8S + 'pkg/proxy/iptables/proxier_test.go#L816',
      K8S + 'pkg/proxy/healthcheck/service_health.go#L241-L272',
      K8S + 'cmd/kube-proxy/app/server_linux.go#L49-L53',
      K8S + 'pkg/proxy/ipvs/proxier.go#L91-L92',
      WEB + 'tutorials/services/source-ip.md',
      WEB + 'tasks/access-application-cluster/create-external-load-balancer.md#preserving-the-client-source-ip',
    ],
    // The script's answer, stated by the shares step, and three questions on placements and chains the page
    // does not draw; each answer is the model's.
    answer: ANSWER,
    checks: [
      {
        question: 'Under Local, with pods placed 4, 1, 0, what share of the requests does the pod on Node 2 get, and what does each pod on Node 1 get?',
        answer: `Node 3 fails the health check, so Node 1 and Node 2 get ${frac(FOUR_ONE_NODES[0]!)} each. Node 2’s one pod keeps all of its ${frac(FOUR_ONE_NODES[1]!)}; Node 1 splits its ${frac(FOUR_ONE_NODES[0]!)} four ways, ${frac(FOUR_ONE.a!)} each. The lone pod gets ${value(FOUR_ONE.e!) / value(FOUR_ONE.a!)} times as many requests.`,
      },
      {
        question: 'Under Cluster, every node’s chain lists four pods. With what probabilities do its rules match, and what share does each pod get?',
        answer: `${CHAIN4.map((r) => (r.probability ? `1/${Math.round(1 / Number(r.probability))}` : 'always')).join(', then ')}: each rule matches 1/(n−i) of the requests that reach it, so each pod gets ${frac(ruleShares(4)[0]!)} of what the node receives.`,
      },
      {
        question: 'Which placements of four pods on these three nodes give every pod the same share under Local?',
        answer: `Only ${EVEN4_SHAPES.join(' and ')}, in any order of the nodes. Under Local each healthy node gets an equal share and splits it among its own pods, so the shares are even exactly when every node with pods runs the same number.`,
      },
    ],
    // The sentences that reach beyond the scenario on screen, and the tests that hold them.
    claims: [
      { says: 'every pod sees a node’s address', test: 'test/explain-traffic-policy.test.ts: under Cluster every outside request' },
      { says: 'kube-proxy marks every outside request for source NAT', test: 'test/explain-traffic-policy.test.ts: under Cluster every outside request' },
      { says: 'hand every request to a pod', test: 'test/explain-traffic-policy.test.ts: the shares sum to 1' },
      { says: 'only the pods on that node', test: 'test/explain-traffic-policy.test.ts: the shares sum to 1' },
      { says: 'each node’s rules list only its own pods', test: 'test/explain-traffic-policy.test.ts: the shares sum to 1' },
      { says: 'Node 1’s rules list only its own pods', test: 'test/explain-traffic-policy.test.ts: the shares sum to 1' },
      { says: 'Node 1 lists only its', test: 'test/explain-traffic-policy.test.ts: the shares sum to 1' },
      { says: 'every node lists all', test: 'test/explain-traffic-policy.test.ts: the shares sum to 1' },
      { says: 'always matches', test: 'test/explain-traffic-policy.test.ts: then a rule that always matches' },
      { says: 'every pod gets the same', shown: true as const },
      { says: 'every pod bar collects', shown: true as const },
      { says: 'every pod ends at', shown: true as const },
      { says: 'every node passes the health check', shown: true as const },
    ],
  };
  static settings = [
    {
      id: 'policy',
      label: 'externalTrafficPolicy',
      default: 'local',
      options: [
        { value: 'local', label: 'Local' },
        { value: 'cluster', label: 'Cluster' },
      ],
    },
    {
      id: 'pods',
      label: 'Pods on nodes 1, 2, 3',
      default: '3-1-0',
      options: (Object.keys(PLACEMENTS) as PlacementKey[]).map((k) => ({ value: k, label: PLACEMENTS[k].join(', ') })),
    },
  ];

  override async construct() {
    const values = settingsOf(this),
      policy = values.policy as Policy,
      key = values.pods as PlacementKey,
      other: Policy = policy === 'local' ? 'cluster' : 'local';
    const counts = PLACEMENTS[key],
      pods = podsOf(counts),
      n = pods.length,
      ids = pods.map((p) => p.id);
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const groups = counts.map((_, j) => `group:n${j + 1}`);

    // ------------------------------------------------------------------ topology
    await this.step('topology', {
      title: `${n} pods on three nodes behind one load balancer`,
      line: `Predict: with externalTrafficPolicy ${POLICY[policy]}, which pod gets the most requests?`,
      caption: `A Service of type LoadBalancer: a cloud load balancer sends outside requests to the nodes, and rules that kube-proxy writes on each node hand every request to a pod. ${placementWords(counts)}. The Service’s externalTrafficPolicy sets which pods a node may pick: under Cluster, the default, any pod in the cluster; under Local, only the pods on that node. This one is set to ${POLICY[policy]}.`,
    });
    await s.clear();
    let d = await s.show({ source: cluster(counts, policy) }, { box: DIAGRAM });
    await s.card(
      [
        ['externalTrafficPolicy', POLICY[policy]],
        ['Pods on nodes 1, 2, 3', counts.join(', ')],
        ['Client address', CLIENT_IP],
        ['kube-proxy mode', 'iptables, the Linux default'],
      ],
      { at: BELOW, fontSize: SIZE },
    );
    this.state.placement = [...counts];

    // ------------------------------------------------------------------ rules
    // The chain shown: every pod under Cluster (the same on every node); Node 1's own pods under Local.
    const chainPods = endpointsOn(counts, policy, 0).map((p) => p.id);
    const chain = rules(chainPods),
      each = ruleShares(chainPods.length);
    const chainName = policy === 'cluster' ? 'KUBE-SVC' : 'KUBE-SVL';
    const spelled = chain
      .map((r) => (r.probability ? `1/${Math.round(1 / Number(r.probability))}` : 'always'))
      .join(', ');
    await this.step('rules', {
      title:
        policy === 'cluster'
          ? `Each node’s rules pick one of all ${n} pods`
          : `Under Local, each node’s rules list only its own pods`,
      line:
        chainPods.length === 1
          ? 'Node 1’s single rule always matches, so its one pod gets it all.'
          : `Probabilities 1/(n−i) give each pod ${frac(each[0]!)} of the node’s requests.`,
      // proxier.go:1464-1471: rule i of n has --probability 1/(n-i); the last has none and always matches.
      caption:
        `In iptables mode kube-proxy tries one rule per pod in order. For three candidates, the first takes 1/3 of requests; the second sees the remaining 2/3 and takes half of those, another 1/3 overall; the last gets the remaining 1/3. In general, rule i of n matches 1/(n−i) of the requests that reach it, counting i from zero, so each pod gets 1/n of the node’s traffic. ` +
        (policy === 'cluster'
          ? `Under Cluster every node lists all ${n} pods: ${spelled}, so each gets 1/${n} of what the node receives.`
          : chainPods.length === 1
            ? `Under Local Node 1 lists only its one pod, in a single rule that always matches.`
            : `Under Local Node 1 lists only its ${chainPods.length} pods: ${spelled}, so each gets ${frac(each[0]!)} of what Node 1 receives.`),
    });
    await s.clearOverlays();
    // The whole cluster stays in view, so Node 2 and Node 3 are never cut off at the edge.
    await d.mark(policy === 'cluster' ? ['k1', 'k2', 'k3'] : ['k1'], { as: 'chain shown' });
    // The real chain lists KUBE-SEP-<hash> targets; here each target is named by its pod.
    const code = await s.code(
      [
        `# ${chainName} chain on ${policy === 'cluster' ? 'every node' : 'Node 1'}, one rule per pod`,
        ...chain.map((r) =>
          r.probability
            ? `-m statistic --mode random --probability ${r.probability} -j pod ${r.pod}`
            : `-j pod ${r.pod}`,
        ),
      ],
      { at: BELOW, fontSize: 0.22, enter: false },
    );
    await s.enter(code);
    // Each pod in the chain says its share of the node's requests.
    for (const [i, id] of chainPods.entries()) await d.note(id, frac(each[i]!), { side: 'above', size: SIZE });
    this.state.chain = chain.map((r) => r.probability);
    this.state.chainShares = each.map(frac);

    const node = nodeShares(counts, policy);
    const share = shares(counts, policy);
    if (policy === 'cluster') {
      // ---------------------------------------------------------------- second hop
      const hop = secondHop(counts, policy),
        target = hopTarget(counts);
      const leave = counts.map((c) => q(n - c, n));
      await this.step('second-hop', {
        title: `Under Cluster, ${inN(hop)} requests leave the node they reach`,
        line: `Node 3 sends this request on to pod ${target} on Node 2.`,
        // source-ip.md:204-209: the node that receives the packet sends it on to the node with the endpoint.
        caption: `Each node gets a third of the requests and picks among all ${n} pods. A request leaves its node when the pick runs elsewhere: ${counts
          .map((c, j) => `${inN(leave[j]!)} on ${NODES[j]}`)
          .join(', ')}. Here Node 3 sends one to pod ${target} on Node 2.`,
      });
      await s.clearOverlays();
      await d.unmark();
      await d.walk(
        [
          ['lb', 'k3'],
          ['k3', target],
        ],
        { trail: true },
      );
      // Nodes 2 and 3 say how many of the requests they get they send on (Node 1's share is in the caption).
      for (const j of [1, 2]) await d.note(`k${j + 1}`, `${inN(leave[j]!)} leave`, { side: 'below', size: SIZE });
      this.state.secondHop = frac(hop);

    } else {
      // ---------------------------------------------------------------- health check
      const failing = counts.flatMap((c, j) => (passes(counts, 'local', j) ? [] : [j])),
        healthy = counts.flatMap((c, j) => (passes(counts, 'local', j) ? [j] : []));
      await this.step('health', {
        title: failing.length
          ? `${nodeList(failing)} runs no pod, so it fails the health check`
          : 'Every node runs a pod, so every node passes the health check',
        line: `${nodeList(healthy)} answer 200 and each get ${frac(node[healthy[0]!]!)} of requests.`,
        // service_health.go:257-261: 200 when the node has local endpoints, 503 when it has none.
        // source-ip.md:362-363: nodes without endpoints fail the load balancer's health checks.
        caption: `Under Local, kube-proxy answers the load balancer’s health check on each node: 200 when the node runs a pod of the Service, 503 when it runs none. ${
          failing.length ? `The load balancer stops sending to ${nodeList(failing)}. It divides requests equally among healthy nodes, regardless of their pod counts, so ` : 'So '
        }${nodeList(healthy)} each get ${frac(node[healthy[0]!]!)} of the requests. The next choice happens inside each node: its share is divided among its own pods.`,
      });
      await s.clearOverlays();
      await d.unmark();
      await d.focus('all');
      if (failing.length)
        await d.mark(
          failing.flatMap((j) => [groups[j]!, `k${j + 1}`]),
          { color: s.bad, as: 'fails the health check' },
        );
      // Each node's health check answer, said under the node.
      for (const [j, c] of counts.entries())
        await d.note(
          `k${j + 1}`,
          `${passes(counts, 'local', j) ? '200' : '503'}, ${c} local pod${c === 1 ? '' : 's'}`,
          { side: 'below', size: SIZE },
        );
      this.state.passes = counts.map((_, j) => passes(counts, 'local', j));

    }

    // ------------------------------------------------------------------ shares
    const ranked = byShare(share),
      even = ranked.length === 1;
    const top = ranked[0]!,
      low = ranked.at(-1)!;
    const ratio = value(top[0]) / value(low[0]);
    await this.step('shares', {
      title: even
        ? `Answer: none. Each pod gets ${frac(top[0])} of the requests`
        : `Answer: ${podList(top[1])} ${top[1].length > 1 ? 'get' : 'gets'} ${frac(top[0])} of the requests; ${podList(low[1])} ${low[1].length > 1 ? `get ${frac(low[0])} each` : `gets ${frac(low[0])}`}`,
      line:
        policy === 'cluster'
          ? `Each node splits its 1/3 among all ${n} pods.`
          : `Split by node, not pod: each node with pods gets ${frac(node[0]!)}.`,
      caption:
        policy === 'cluster'
          ? `${ANSWER}: it gives each node 1/3, and under Cluster each node’s rules give each of the ${n} pods 1/${n} of that. Summed over the three nodes, each pod gets 1/${n} of all requests, wherever it runs.`
          : `${ANSWER}: ${nodeList(counts.flatMap((_, j) => (passes(counts, policy, j) ? [j] : [])))} each get ${frac(node[0]!)}. ` +
            (counts.every((c) => c <= 1)
              ? 'Each sends all of its share to its one pod'
              : counts
                  .flatMap((c, j) =>
                    c === 0
                      ? []
                      : [
                          c === 1
                            ? `${NODES[j]} sends all of its ${frac(node[j]!)} to pod ${pods.find((p) => p.node === j)!.id}`
                            : `${NODES[j]} splits its ${frac(node[j]!)} ${named(c)} ways`,
                        ],
                  )
                  .join('; ')) +
            (even
              ? ', so every pod gets the same.'
              : `, so pod ${top[1][0]} gets ${ratio} times as many requests as pod ${low[1][0]}.`),
    });
    await s.clearOverlays();
    await d.unmark();
    await d.focus('all');
    for (const id of ids) await d.note(id, percent(share[id]!), { side: 'above', size: SIZE });
    this.state.shares = Object.fromEntries(ids.map((id) => [id, frac(share[id]!)]));

    // ------------------------------------------------------------------ flow: both policies as bands
    const localNode = nodeShares(counts, 'local'),
      localShare = shares(counts, 'local'),
      localRanked = byShare(localShare),
      clusterNode = nodeShares(counts, 'cluster');
    const lUneven = localRanked.length > 1,
      lHigh = localRanked[0]!,
      lLowest = localRanked.at(-1)!;
    const fedBy = (id: string) => pods.find((p) => p.id === id)!.node;
    const localCuts = counts.flatMap((c, j) =>
      c === 0
        ? [`${NODES[j]} gets no band`]
        : c === 1
          ? [`${NODES[j]} hands its whole ${frac(localNode[j]!)} to pod ${pods.find((p) => p.node === j)!.id}`]
          : [`${NODES[j]} cuts its ${frac(localNode[j]!)} into ${named(c)} bands of ${frac(shares(counts, 'local')[pods.find((p) => p.node === j)!.id]!)}`],
    );
    const cutWords = localCuts.length > 1 ? `${localCuts.slice(0, -1).join(', ')} and ${localCuts.at(-1)}` : localCuts[0]!;
    await this.step('flow', {
      title: lUneven
        ? `Under Local, ${NODES[fedBy(lHigh[1][0]!)]}’s whole ${frac(localNode[fedBy(lHigh[1][0]!)]!)} flows into pod ${lHigh[1][0]}`
        : `Both policies give each pod ${frac(lHigh[0])}; only Cluster’s bands cross nodes`,
      line: 'Band width is share of requests; colour is the node a request enters.',
      caption:
        `Each band is as wide as its share of the outside requests and takes the colour of the node it enters. The load balancer makes the first cut, by node; each node’s rules make the second, among the pods they list. ` +
        `Under Cluster each node’s ${frac(clusterNode[0]!)} fans out to all ${n} pods, so every pod bar collects ${named(counts.length)} colours and ends at ${frac(q(1, n))}. ` +
        `Under Local ${cutWords}` +
        (lUneven
          ? `, so pod ${lHigh[1][0]}’s bar ends ${value(lHigh[0]) / value(lLowest[0])} times as wide as pod ${lLowest[1][0]}’s.`
          : `, so every pod ends at ${frac(lHigh[0])}, as under Cluster, and no band crosses to another node.`),
    });
    await s.clear();
    const flowLeft = flowPanel(counts, 'cluster', -3.85, s.palette.ink, s.palette.paper, policy === 'cluster'),
      flowRight = flowPanel(counts, 'local', 3.85, s.palette.ink, s.palette.paper, policy === 'local');
    await s.enter(flowLeft.group, flowRight.group, { describe: () => `${flowLeft.words()} ${flowRight.words()}` });
    // A phone opens on this scenario's own policy; the other panel is the next stop of the tour.
    s.opening(policy === 'cluster' ? flowLeft.group : flowRight.group);
    const flowState = (p: Policy) => ({
      nodes: nodeShares(counts, p).map(frac),
      bands: flows(counts, p).map((b) => [NODES[b.node], b.pod, frac(b.share)]),
    });
    this.state.flow = { cluster: flowState('cluster'), local: flowState('local') };

    // ------------------------------------------------------------------ the client's address
    if (policy === 'cluster') {
      // ---------------------------------------------------------------- snat
      const target = hopTarget(counts);
      await this.step('snat', {
        title: 'The pod sees the node’s address, not the client’s',
        line: `Node 3 swaps ${CLIENT_IP} for its own address, ${nodeIp(2)}.`,
        // proxier.go:1104-1110: under Cluster every packet in the external chain is marked for masquerade,
        // "in case we cross nodes"; source-ip.md:205 "node2 replaces the source IP address (SNAT)".
        caption: `Under Cluster, kube-proxy marks every outside request for source NAT, in case it crosses nodes. Node 3 replaces the client’s address, ${CLIENT_IP}, with its own, ${nodeIp(2)}, and pod ${target} sees that. Requests that stay on their node are rewritten too.`,
      });
      // The flow picture gives way to the cluster again.
      await s.clear();
      d = await s.show({ source: cluster(counts, policy) }, { box: DIAGRAM });
      await d.walk(
        [
          ['lb', 'k3'],
          ['k3', target],
        ],
        { trail: true },
      );
      await d.note('lb', `from ${CLIENT_IP}`, { side: 'below', size: SIZE });
      await d.note(target, `from ${seenSource('cluster', 2)}`, { side: 'above', size: SIZE });
      this.state.seen = seenSource('cluster', 2);
    } else {
      // ---------------------------------------------------------------- local path
      await this.step('local-path', {
        title: 'The request stays on its node and keeps the client’s address',
        line: `Pod a sees ${CLIENT_IP}: no source NAT and no second hop.`,
        // proxier.go:1104-1146: under Local no masquerade rule applies to outside traffic, which goes to
        // the local chain; source-ip.md:219-222 "kube-proxy only proxies proxy requests to local endpoints".
        caption: `Node 1’s rules list only its own pods, so the request never leaves Node 1, and kube-proxy adds no source NAT for it. Pod a sees the client’s address, ${CLIENT_IP}. Under Local no outside request takes a second hop.`,
      });
      await s.clear();
      d = await s.show({ source: cluster(counts, policy) }, { box: DIAGRAM });
      await d.walk(
        [
          ['lb', 'k1'],
          ['k1', 'a'],
        ],
        { trail: true },
      );
      await d.note('a', `from ${seenSource('local', 0)}`, { side: 'above', size: SIZE });
      this.state.seen = seenSource('local', 0);
    }

    // ------------------------------------------------------------------ compare
    const theirs = shares(counts, other);
    const local = policy === 'local' ? share : theirs,
      cl = policy === 'cluster' ? share : theirs;
    const uneven = byShare(local).length > 1;
    const lTop = byShare(local)[0]!,
      lLow = byShare(local).at(-1)!;
    await this.step('compare', {
      title: uneven
        ? `With ${counts.join(', ')} pods, Local trades even load for the client’s address`
        : `With ${counts.join(', ')} pods, Local keeps both even load and the client’s address`,
      line: `Cluster sends ${inN(secondHop(counts, 'cluster'))} requests to another node; Local sends none.`,
      caption:
        `Cluster spreads requests evenly over the pods, but ${inN(secondHop(counts, 'cluster'))} cross to another node and every pod sees a node’s address. Local keeps each request on its node with the client’s address. ` +
        (uneven
          ? `The load balancer weighs nodes, not pods, so pod ${lTop[1][0]} takes ${value(lTop[0]) / value(lLow[0])} times the load of pod ${lLow[1][0]}.`
          : `Here each node with pods runs the same number, so splitting by node splits evenly by pod.`),
    });
    await s.clearOverlays();
    await d.clearNotes();
    await d.unmark();
    const half = (p: Policy, box: Box) =>
      s.card(
        [
          ...shareRows(p === 'local' ? local : cl),
          ['Second hop', inN(secondHop(counts, p))],
          ['Pod sees', p === 'local' ? 'client address' : 'node address'],
        ],
        { at: box, align: 'top', fontSize: SIZE, title: POLICY[p], enter: false },
      );
    const left = await half('cluster', regionBox(BELOW, { right: -0.15 })),
      right = await half('local', regionBox(BELOW, { left: 0.15 }));
    for (const [policy, card] of [['cluster', left], ['local', right]] as const) {
      card.key = `traffic-compare:${policy}`;
      card.values.get('Second hop')!.key = `${card.key}:hop`;
      card.values.get('Pod sees')!.key = `${card.key}:source`;
      for (const [label, value] of card.values)
        if (label !== 'Second hop' && label !== 'Pod sees') {
          card.labels.get(label)!.key = `${card.key}:pods:${label}`;
          value.key = `${card.key}:share:${label}`;
        }
    }
    await s.enter(left, right);
    this.state.compare = {
      cluster: Object.fromEntries(ids.map((id) => [id, frac(cl[id]!)])),
      local: Object.fromEntries(ids.map((id) => [id, frac(local[id]!)])),
    };

    // ------------------------------------------------------------------ caveats
    await this.step('caveats', {
      title: 'What these shares leave out',
      line: 'Shares are iptables-mode averages; IPVS defaults to round robin.',
      // ipvs/proxier.go:91-92 defaultScheduler "rr"; service_health.go:255 the weight header;
      // create-external-load-balancer.md:161 "some cloud providers do not let you configure different weights".
      caption:
        'The shares are long-run averages for kube-proxy’s iptables mode; IPVS mode defaults to round robin. kube-proxy’s health check reports each node’s pod count in a header, but the docs warn that some cloud load balancers cannot weight nodes. Topology-aware routing and session affinity are left out.',
    });
    await s.clearOverlays();
    await s.card(
      [
        ['Mode', 'iptables; IPVS uses round robin'],
        ['Load balancer', 'equal share per healthy node'],
        ['Health check header', 'X-Load-Balancing-Endpoint-Weight'],
        ['Topology-aware routing', 'not modelled'],
        ['Session affinity', 'not modelled'],
      ],
      { at: BELOW, fontSize: SIZE },
    );

  }
}
