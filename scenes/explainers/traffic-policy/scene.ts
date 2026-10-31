import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/traffic-policy.ts';
import { Scene } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import {
  CLIENT_IP,
  PLACEMENTS,
  endpointsOn,
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
    const nodeParts = (j: number) => [groups[j]!, `k${j + 1}`, ...pods.filter((p) => p.node === j).map((p) => p.id)];

    // ------------------------------------------------------------------ topology
    await readerFirst(this, s, readerFrames(key, policy));
    await this.step('topology', {
      detail: true,
      title: `${n} pods on three nodes behind one load balancer`,
      line: 'The load balancer sends to nodes; each node’s rules pick a pod.',
      caption: `A Service of type LoadBalancer: a cloud load balancer sends outside requests to the nodes, and rules that kube-proxy writes on each node hand every request to a pod. ${placementWords(counts)}. The setting chooses externalTrafficPolicy: ${POLICY[policy]}.`,
    });
    await s.clear();
    const d = await s.show({ source: cluster(counts, policy) }, { box: DIAGRAM });
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
      detail: true,
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
        `In iptables mode kube-proxy writes one rule per pod. Rule i of n matches with probability 1/(n−i), and the last always matches, so each pod gets 1/n. ` +
        (policy === 'cluster'
          ? `Under Cluster every node lists all ${n} pods: ${spelled}, so each gets 1/${n} of what the node receives.`
          : chainPods.length === 1
            ? `Under Local Node 1 lists only its one pod, in a single rule that always matches.`
            : `Under Local Node 1 lists only its ${chainPods.length} pods: ${spelled}, so each gets ${frac(each[0]!)} of what Node 1 receives.`),
    });
    await s.clearOverlays();
    if (policy === 'cluster') await d.mark(['k1', 'k2', 'k3'], { as: 'chain shown' });
    else {
      await d.focus(nodeParts(0), { zoom: 0.9 });
      await d.mark(['k1'], { as: 'chain shown' });
    }
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
        detail: true,
        title: `Under Cluster, ${inN(hop)} requests leave the node they reach`,
        line: `Node 3 sends this request on to pod ${target} on Node 2.`,
        // source-ip.md:204-209: the node that receives the packet sends it on to the node with the endpoint.
        caption: `Each node gets a third of the requests and picks among all ${n} pods. A request leaves its node when the pick runs elsewhere: ${counts
          .map((c, j) => `${inN(leave[j]!)} on ${NODES[j]}`)
          .join(', ')}. Here Node 3 sends one to pod ${target} on Node 2.`,
      });
      await s.clearOverlays();
      await d.unmark();
      await d.focus(['lb', 'k3', 'k2', target], { zoom: 0.95 });
      await d.walk(
        [
          ['lb', 'k3'],
          ['k3', target],
        ],
        { trail: true },
      );
      // The two nodes in view say how many of the requests they get they send on (Node 1's share is in the caption).
      for (const j of [1, 2]) await d.note(`k${j + 1}`, `${inN(leave[j]!)} leave`, { side: 'below', size: SIZE });
      this.state.secondHop = frac(hop);

      // ---------------------------------------------------------------- snat
      await this.step('snat', {
        detail: true,
        title: 'The pod sees the node’s address, not the client’s',
        line: `Node 3 swaps ${CLIENT_IP} for its own address, ${nodeIp(2)}.`,
        // proxier.go:1104-1110: under Cluster every packet in the external chain is marked for masquerade,
        // "in case we cross nodes"; source-ip.md:205 "node2 replaces the source IP address (SNAT)".
        caption: `Under Cluster, kube-proxy marks every outside request for source NAT, in case it crosses nodes. Node 3 replaces the client’s address, ${CLIENT_IP}, with its own, ${nodeIp(2)}, and pod ${target} sees that. Requests that stay on their node are rewritten too.`,
      });
      await s.clearOverlays();
      await d.note('lb', `from ${CLIENT_IP}`, { side: 'below', size: SIZE });
      await d.note(target, `from ${seenSource('cluster', 2)}`, { side: 'above', size: SIZE });
      this.state.seen = seenSource('cluster', 2);
    } else {
      // ---------------------------------------------------------------- health check
      const failing = counts.flatMap((c, j) => (passes(counts, 'local', j) ? [] : [j])),
        healthy = counts.flatMap((c, j) => (passes(counts, 'local', j) ? [j] : []));
      await this.step('health', {
        detail: true,
        title: failing.length
          ? `${nodeList(failing)} runs no pod, so it fails the health check`
          : 'Every node runs a pod, so every node passes the health check',
        line: `${nodeList(healthy)} answer 200 and each get ${frac(node[healthy[0]!]!)} of requests.`,
        // service_health.go:257-261: 200 when the node has local endpoints, 503 when it has none.
        // source-ip.md:362-363: nodes without endpoints fail the load balancer's health checks.
        caption: `Under Local, kube-proxy answers the load balancer’s health check on each node: 200 when the node runs a pod of the Service, 503 when it runs none. ${
          failing.length ? `The load balancer stops sending to ${nodeList(failing)}, so ` : 'So '
        }${nodeList(healthy)} each get ${frac(node[healthy[0]!]!)} of the requests.`,
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

      // ---------------------------------------------------------------- local path
      await this.step('local-path', {
        detail: true,
        title: 'The request stays on its node and keeps the client’s address',
        line: `Pod a sees ${CLIENT_IP}: no source NAT and no second hop.`,
        // proxier.go:1104-1146: under Local no masquerade rule applies to outside traffic, which goes to
        // the local chain; source-ip.md:219-222 "kube-proxy only proxies proxy requests to local endpoints".
        caption: `Node 1’s rules list only its own pods, so the request never leaves Node 1, and kube-proxy adds no source NAT for it. Pod a sees the client’s address, ${CLIENT_IP}. Under Local no outside request takes a second hop.`,
      });
      await s.clearOverlays();
      await d.unmark();
      await d.focus(nodeParts(0), { zoom: 0.9 });
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

    // ------------------------------------------------------------------ shares
    const ranked = byShare(share),
      even = ranked.length === 1;
    const top = ranked[0]!,
      low = ranked.at(-1)!;
    const ratio = value(top[0]) / value(low[0]);
    await this.step('shares', {
      detail: true,
      title: even
        ? `Each pod gets ${frac(top[0])} of the requests`
        : `${podList(top[1]).replace(/^p/, 'P')} ${top[1].length > 1 ? 'get' : 'gets'} ${frac(top[0])} of the requests; ${podList(low[1])} ${low[1].length > 1 ? `get ${frac(low[0])} each` : `gets ${frac(low[0])}`}`,
      line:
        policy === 'cluster'
          ? `Each node splits its 1/3 among all ${n} pods.`
          : `Split by node, not pod: each node with pods gets ${frac(node[0]!)}.`,
      caption:
        policy === 'cluster'
          ? `The load balancer gives each node 1/3, and each node’s rules give each of the ${n} pods 1/${n} of that. Summed over the three nodes, each pod gets 1/${n} of all requests, wherever it runs.`
          : `The load balancer splits by node, not by pod: ${nodeList(counts.flatMap((_, j) => (passes(counts, policy, j) ? [j] : [])))} each get ${frac(node[0]!)}. ` +
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

    // ------------------------------------------------------------------ compare
    const theirs = shares(counts, other);
    const local = policy === 'local' ? share : theirs,
      cl = policy === 'cluster' ? share : theirs;
    const uneven = byShare(local).length > 1;
    const lTop = byShare(local)[0]!,
      lLow = byShare(local).at(-1)!;
    await this.step('compare', {
      detail: true,
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
      detail: true,
      title: 'What these shares leave out',
      line: 'Shares are iptables-mode averages; IPVS defaults to round robin.',
      // ipvs/proxier.go:91-92 defaultScheduler "rr"; service_health.go:255 the weight header;
      // create-external-load-balancer.md:161 "some cloud providers do not let you configure different weights".
      caption:
        'The shares are long-run averages for kube-proxy’s iptables mode; IPVS mode defaults to round robin. kube-proxy’s health check reports each node’s pod count in a header, but the docs warn that some cloud load balancers cannot weight nodes. Topology-aware routing and session affinity are left out.',
    });
    await s.clearOverlays();
    await d.dim(null);
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
