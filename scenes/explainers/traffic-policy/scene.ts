import { Scene, Group } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, Card, CodeBlock, mermaid, answerOf, view, having } from '../../../explain/index.ts';
import type { CardRow, CardOptions, View, Diagram, PictureNote, Having } from '../../../explain/index.ts';
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
} from './model.ts';
import type { PlacementKey, Policy, Q } from './model.ts';
import { NODES, POLICY, parse, flowPanel } from './picture.ts';
import type { FlowState } from './picture.ts';
import { counted, listed, numberWord } from '../lib/format.ts';

// Sources: kubernetes/kubernetes at tag v1.37.1 and kubernetes/website at commit 0c2509f; the lines each
// claim rests on are quoted in model.ts and beside the steps below.
const K8S = 'https://github.com/kubernetes/kubernetes/blob/v1.37.1/';
const WEB = 'https://github.com/kubernetes/website/blob/0c2509f55f9de644acef9232e4ec1ab6cbd01dcc/content/en/docs/';

// excalidraw was tried first: its hatched fills, recoloured and thickened by a mark, hid the marked labels.
const STYLE = 'github-light';

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
    mermaid.frontMatter({ architecture: { fontSize: 24, iconSize: 60 } }),
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

const podList = (ids: readonly string[]) => (ids.length === 1 ? `pod ${ids[0]}` : `pods ${listed(ids)}`);
const nodeList = (nodes: readonly number[]) => listed(nodes.map((j) => NODES[j]!));
/** "Node 1 runs 3 pods, Node 2 runs 1 and Node 3 runs none." */
const placementWords = (counts: readonly number[]) =>
  listed(counts.map((n, j) => `${NODES[j]} runs ${n === 0 ? 'none' : j === 0 ? counted(n, 'pod') : n}`));
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
/** What the steps record, accumulated: the fields the views below draw from. The setup is recorded first; each other part from the step that records it. */
interface TrafficState {
  policy: Policy;
  placement: number[];
  client: string;
  flow?: Record<Policy, FlowState>;
  compare?: Record<Policy, Record<string, string>>;
  hops?: Record<Policy, string>;
  chain?: (string | null)[];
  chainPods?: string[];
  chainShares?: string[];
  secondHop?: string;
  passes?: boolean[];
  shares?: Record<string, string>;
  seen?: string;
}
// How the cluster diagram is shown, apart from its source: the nodes marked, the links walked and
// the notes. That is `shown`, not the model; the diagram's view draws it, and each change is a sync.
// A step's slate starts plain: the overlays clear and what the diagram shows leaves `shown`. A focus
// moves the live diagram, so the stage shows the live diagram, not the view, while it moves.
type ClusterShown = { marks: Record<string, { color: string; as: string }>; walked: [string, string][]; notes: PictureNote[] };
const BELOW: Box = [-7.55, -4.25, 7.55, -1.45];
const SIZE = 0.24;


export default class TrafficPolicyExplainer extends Scene<TrafficState, { cluster?: ClusterShown }> {
  static meta = {
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
    // The sentences that reach beyond the scenario on screen, and the tests that hold them.
    claims: [
      { says: 'every pod sees a node’s address', test: 'model.test.ts: under Cluster every outside request' },
      { says: 'kube-proxy marks every outside request for source NAT', test: 'model.test.ts: under Cluster every outside request' },
      { says: 'hand every request to a pod', test: 'model.test.ts: the shares sum to 1' },
      { says: 'only the pods on that node', test: 'model.test.ts: the shares sum to 1' },
      { says: 'each node’s rules list only its own pods', test: 'model.test.ts: the shares sum to 1' },
      { says: 'Node 1’s rules list only its own pods', test: 'model.test.ts: the shares sum to 1' },
      { says: 'Node 1 lists only its', test: 'model.test.ts: the shares sum to 1' },
      { says: 'every node lists all', test: 'model.test.ts: the shares sum to 1' },
      { says: 'always matches', test: 'model.test.ts: then a rule that always matches' },
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
    const answer = answerOf(this);
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
    const ink = s.look.ink,
      paper = s.look.paper;
    /** A card drawn from the state: a view that builds it from `rows(state)`, so check holds it to the state. */
    const cardOf = (rows: (st: TrafficState) => readonly CardRow[], opts: CardOptions, keys?: (card: Card) => void): View<Card> =>
      view(
        this,
        (state) => {
          const card = new Card(this, s.palette, rows(state), opts);
          keys?.(card);
          return card;
        },
        { place: false },
      );
    /** Both policies' flows, from what the flow step records. */
    const flowPictures = (st: Having<TrafficState, 'flow'>) => ({
      cluster: flowPanel(st.placement, 'cluster', st.flow.cluster, -3.85, ink, paper, st.policy === 'cluster'),
      local: flowPanel(st.placement, 'local', st.flow.local, 3.85, ink, paper, st.policy === 'local'),
    });

    const PLAIN: ClusterShown = { marks: {}, walked: [], notes: [] };
    const drawCluster = (of: Diagram) => (_st: TrafficState, sh: { cluster?: ClusterShown }) => {
      const c = having(sh, 'cluster').cluster;
      return { marks: { ...of.trail(c.walked), ...c.marks }, notes: c.notes };
    };
    let clusterView: View | null = null;
    const showCluster = async (change: Partial<ClusterShown>) => {
      clusterView ??= s.diagramView(d, drawCluster(d));
      this.shown.cluster = { ...having(this.shown, 'cluster').cluster, ...change };
      await this.play(clusterView.sync());
    };
    const nextSlate = async () => {
      await s.clearOverlays();
      if (clusterView) await showCluster(PLAIN);
    };
    /** The live diagram back in its view's place, for a focus; the next change shows it by the view again. */
    const liveCluster = () => {
      if (clusterView) s.liveDiagram(d);
      clusterView = null;
    };
    const above = (id: string, text: string): PictureNote => ({ id, text, side: 'above', size: SIZE }),
      below = (id: string, text: string): PictureNote => ({ id, text, side: 'below', size: SIZE });

    // ------------------------------------------------------------------ topology
    await this.step('topology', {
      title: `${n} pods on three nodes behind one load balancer`,
      line: `Predict: with externalTrafficPolicy ${POLICY[policy]}, which pod gets the most requests?`,
      caption: `A Service of type LoadBalancer: a cloud load balancer sends outside requests to the nodes, and rules that kube-proxy writes on each node hand every request to a pod. ${placementWords(counts)}. The Service’s externalTrafficPolicy sets which pods a node may pick: under Cluster, the default, any pod in the cluster; under Local, only the pods on that node. This one is set to ${POLICY[policy]}.`,
    });
    await s.clear();
    this.state.placement = [...counts];
    this.state.policy = policy;
    this.state.client = CLIENT_IP;
    let d = await s.show({ source: cluster(counts, policy) }, { box: DIAGRAM });
    this.shown.cluster = PLAIN;
    const setup = cardOf(
      (st) => [
        ['externalTrafficPolicy', POLICY[st.policy]],
        ['Pods on nodes 1, 2, 3', st.placement.join(', ')],
        ['Client address', st.client],
        ['kube-proxy mode', 'iptables, the Linux default'],
      ],
      { at: BELOW, fontSize: SIZE },
    );
    await s.enter(setup, { runTime: 0.35, shift: [0, -0.08] });

    // ------------------------------------------------------------------ rules
    // The chain shown: every pod under Cluster (the same on every node); Node 1's own pods under Local.
    const chainPods = endpointsOn(counts, policy, 0).map((p) => p.id);
    const chain = rules(chainPods),
      each = ruleShares(chainPods.length);
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
    await nextSlate();
    // The whole cluster stays in view, so Node 2 and Node 3 are never cut off at the edge.
    await showCluster({ marks: Object.fromEntries((policy === 'cluster' ? ['k1', 'k2', 'k3'] : ['k1']).map((id) => [id, { color: d.emphasis, as: 'chain shown' }])) });
    this.state.chain = chain.map((r) => r.probability);
    // The pods the chain lists, in its order, which the code panel names.
    this.state.chainPods = chainPods;
    // The real chain lists KUBE-SEP-<hash> targets; here each target is named by its pod. The panel is
    // a view of the chain the step records: each rule's probability and the pod it jumps to.
    const code = view(
      this,
      (state) => {
        const st = having(state, 'chain', 'chainPods');
        return new CodeBlock(
          this,
          s.palette,
          [
            `# ${st.policy === 'cluster' ? 'KUBE-SVC' : 'KUBE-SVL'} chain on ${st.policy === 'cluster' ? 'every node' : 'Node 1'}, one rule per pod`,
            ...st.chainPods.map((pod, i) =>
              st.chain[i] ? `-m statistic --mode random --probability ${st.chain[i]} -j pod ${pod}` : `-j pod ${pod}`,
            ),
          ],
          { at: BELOW, fontSize: 0.22 },
        );
      },
      { place: false },
    );
    await s.enter(code);
    // Each pod in the chain says its share of the node's requests.
    await showCluster({ notes: chainPods.map((id, i) => above(id, frac(each[i]!))) });
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
          .map((_, j) => `${inN(leave[j]!)} on ${NODES[j]}`)
          .join(', ')}. Here Node 3 sends one to pod ${target} on Node 2.`,
      });
      await nextSlate();
      const hops: [string, string][] = [
        ['lb', 'k3'],
        ['k3', target],
      ];
      await d.walk(hops);
      await showCluster({ walked: hops });
      // Nodes 2 and 3 say how many of the requests they get they send on (Node 1's share is in the caption).
      await showCluster({ notes: [1, 2].map((j) => below(`k${j + 1}`, `${inN(leave[j]!)} leave`)) });
      this.state.secondHop = frac(hop);

    } else {
      // ---------------------------------------------------------------- health check
      const failing = counts.flatMap((_, j) => (passes(counts, 'local', j) ? [] : [j])),
        healthy = counts.flatMap((_, j) => (passes(counts, 'local', j) ? [j] : []));
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
      await nextSlate();
      liveCluster();
      await d.enlarge('all');
      if (failing.length)
        await showCluster({
          marks: Object.fromEntries(failing.flatMap((j) => [groups[j]!, `k${j + 1}`]).map((id) => [id, { color: s.look.bad, as: 'fails the health check' }])),
        });
      // Each node's health check answer, said under the node.
      await showCluster({
        notes: counts.map((c, j) => below(`k${j + 1}`, `${passes(counts, 'local', j) ? '200' : '503'}, ${counted(c, 'local pod')}`)),
      });
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
          ? `${answer}: it gives each node 1/3, and under Cluster each node’s rules give each of the ${n} pods 1/${n} of that. Summed over the three nodes, each pod gets 1/${n} of all requests, wherever it runs.`
          : `${answer}: ${nodeList(counts.flatMap((_, j) => (passes(counts, policy, j) ? [j] : [])))} each get ${frac(node[0]!)}. ` +
            (counts.every((c) => c <= 1)
              ? 'Each sends all of its share to its one pod'
              : counts
                  .flatMap((c, j) =>
                    c === 0
                      ? []
                      : [
                          c === 1
                            ? `${NODES[j]} sends all of its ${frac(node[j]!)} to pod ${pods.find((p) => p.node === j)!.id}`
                            : `${NODES[j]} splits its ${frac(node[j]!)} ${numberWord(c)} ways`,
                        ],
                  )
                  .join('; ')) +
            (even
              ? ', so every pod gets the same.'
              : `, so pod ${top[1][0]} gets ${ratio} times as many requests as pod ${low[1][0]}.`),
    });
    await nextSlate();
    liveCluster();
    await d.enlarge('all');
    await showCluster({ notes: ids.map((id) => above(id, percent(share[id]!))) });
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
          : [`${NODES[j]} cuts its ${frac(localNode[j]!)} into ${numberWord(c)} bands of ${frac(shares(counts, 'local')[pods.find((p) => p.node === j)!.id]!)}`],
    );
    const cutWords = listed(localCuts);
    await this.step('flow', {
      title: lUneven
        ? `Under Local, ${NODES[fedBy(lHigh[1][0]!)]}’s whole ${frac(localNode[fedBy(lHigh[1][0]!)]!)} flows into pod ${lHigh[1][0]}`
        : `Both policies give each pod ${frac(lHigh[0])}; only Cluster’s bands cross nodes`,
      line: 'Band width is share of requests; colour is the node a request enters.',
      caption:
        `Each band is as wide as its share of the outside requests and takes the colour of the node it enters. The load balancer makes the first cut, by node; each node’s rules make the second, among the pods they list. ` +
        `Under Cluster each node’s ${frac(clusterNode[0]!)} fans out to all ${n} pods, so every pod bar collects ${numberWord(counts.length)} colours and ends at ${frac(q(1, n))}. ` +
        `Under Local ${cutWords}` +
        (lUneven
          ? `, so pod ${lHigh[1][0]}’s bar ends ${value(lHigh[0]) / value(lLowest[0])} times as wide as pod ${lLowest[1][0]}’s.`
          : `, so every pod ends at ${frac(lHigh[0])}, as under Cluster, and no band crosses to another node.`),
    });
    await s.clear();
    // The cluster's view went with the rest of the stage.
    clusterView = null;
    this.shown.cluster = PLAIN;
    const flowState = (p: Policy): FlowState => ({
      nodes: nodeShares(counts, p).map(frac),
      bands: flows(counts, p).map((b) => [NODES[b.node]!, b.pod, frac(b.share)]),
    });
    this.state.flow = { cluster: flowState('cluster'), local: flowState('local') };
    // Both panels are one view of the recorded flows.
    const panels = view(
      this,
      (state) => {
        const both = flowPictures(having(state, 'flow'));
        return new Group(both.cluster.group, both.local.group);
      },
      { place: false },
    );
    await s.enter(panels, {
      describe: () => {
        const both = flowPictures(having(this.state, 'flow'));
        return `${both.cluster.words()} ${both.local.words()}`;
      },
    });
    // A phone opens on this scenario's own policy; the other panel is the next stop of the tour.
    s.opening(panels.current.children[policy === 'cluster' ? 0 : 1]!);

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
      const hops: [string, string][] = [
        ['lb', 'k3'],
        ['k3', target],
      ];
      await d.walk(hops);
      await showCluster({ walked: hops });
      await showCluster({ notes: [below('lb', `from ${CLIENT_IP}`), above(target, `from ${seenSource('cluster', 2)}`)] });
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
      const hops: [string, string][] = [
        ['lb', 'k1'],
        ['k1', 'a'],
      ];
      await d.walk(hops);
      await showCluster({ walked: hops });
      await showCluster({ notes: [above('a', `from ${seenSource('local', 0)}`)] });
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
    await nextSlate();
    this.state.compare = {
      cluster: Object.fromEntries(ids.map((id) => [id, frac(cl[id]!)])),
      local: Object.fromEntries(ids.map((id) => [id, frac(local[id]!)])),
    };
    this.state.hops = { cluster: frac(secondHop(counts, 'cluster')), local: frac(secondHop(counts, 'local')) };
    // Each policy's card is a view of its recorded shares and second hop.
    const half = (p: Policy, box: Box) =>
      cardOf(
        (st) => [
          ...shareRows(Object.fromEntries(Object.entries(having(st, 'compare').compare[p]).map(([id, f]) => [id, parse(f)]))),
          ['Second hop', inN(parse(having(st, 'hops').hops[p]))],
          ['Pod sees', p === 'local' ? 'client address' : 'node address'],
        ],
        { at: box, align: 'top', fontSize: SIZE, title: POLICY[p], key: `traffic-compare:${p}` },
        // Its rows keyed by label, not by index as the key option keys them: scene.review.json targets these.
        (card) => {
          card.values.get('Second hop')!.key = `${card.key}:hop`;
          card.values.get('Pod sees')!.key = `${card.key}:source`;
          for (const [label, value] of card.values)
            if (label !== 'Second hop' && label !== 'Pod sees') {
              card.labels.get(label)!.key = `${card.key}:pods:${label}`;
              value.key = `${card.key}:share:${label}`;
            }
        },
      );
    const left = half('cluster', regionBox(BELOW, { right: -0.15 })),
      right = half('local', regionBox(BELOW, { left: 0.15 }));
    await s.enter(left, right);

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
