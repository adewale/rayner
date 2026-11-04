// How a Service of type LoadBalancer spreads outside requests over its pods, for both values of
// externalTrafficPolicy, under kube-proxy's iptables mode. Pure TypeScript with no Node APIs: the
// scene runs it in the page.
//
// Sources, kubernetes/kubernetes at tag v1.37.1 (commit f78e722310e50bcaca9276be22276d9e91d91308):
//   pkg/proxy/iptables/proxier.go:390-392    computeProbability(n) = fmt.Sprintf("%0.10f", 1.0/float64(n))
//   pkg/proxy/iptables/proxier.go:1454-1472  rule i of n matches "--probability" probability(n-i);
//                                            "The final (or only if n == 1) rule is a guaranteed match."
//   pkg/proxy/iptables/proxier.go:861-866    external traffic uses the local policy chain under Local
//   pkg/proxy/iptables/proxier.go:1200-1213  the cluster chain lists clusterEndpoints, the local chain localEndpoints
//   pkg/proxy/iptables/proxier.go:1104-1110  under Cluster every external packet is marked for masquerade,
//                                            "in case we cross nodes"
//   pkg/proxy/healthcheck/service_health.go:249-261  the health check answers 200 only with local endpoints, else 503
//   cmd/kube-proxy/app/server_linux.go:50-53  iptables is the default mode on Linux
// kubernetes/website at commit 0c2509f55f9de644acef9232e4ec1ab6cbd01dcc:
//   content/en/docs/tasks/access-application-cluster/create-external-load-balancer.md:161-165
//     "With each target weighted equally in terms of sending traffic to Nodes ... The external load
//     balancer is unaware of the number of Pods on each node". The model takes that as given: the
//     load balancer gives every node that passes its health check an equal share.

export type Policy = 'cluster' | 'local';
export type PlacementKey = '3-1-0' | '2-2-0' | '1-1-1';
/** Pods on nodes 1, 2 and 3. */
export const PLACEMENTS: Record<PlacementKey, readonly number[]> = {
  '3-1-0': [3, 1, 0],
  '2-2-0': [2, 2, 0],
  '1-1-1': [1, 1, 1],
};
/** Addresses in the style of the source-IP tutorial (source-ip.md): node IPs 10.240.0.x, client 198.51.100.79. */
export const nodeIp = (node: number) => `10.240.0.${node + 1}`;
export const CLIENT_IP = '198.51.100.79';

/** An exact fraction, num/den in lowest terms. */
export type Q = readonly [num: number, den: number];
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const q = (num: number, den = 1): Q => {
  const g = gcd(num, den) || 1;
  return [num / g, den / g];
};
export const add = (a: Q, b: Q) => q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
export const mul = (a: Q, b: Q) => q(a[0] * b[0], a[1] * b[1]);
export const sub = (a: Q, b: Q) => q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
export const value = (a: Q) => a[0] / a[1];
export const frac = (a: Q) => (a[1] === 1 ? String(a[0]) : `${a[0]}/${a[1]}`);
/** A share as a percentage with at most one decimal: 50%, 16.7%. */
export const percent = (a: Q) => `${+(value(a) * 100).toFixed(1)}%`;

export interface Pod {
  id: string;
  /** Zero-based node. */
  node: number;
}
/** Pods a, b, c ... in node order. */
export function podsOf(counts: readonly number[]): Pod[] {
  const out: Pod[] = [];
  counts.forEach((n, node) => {
    for (let i = 0; i < n; i++) out.push({ id: String.fromCharCode(97 + out.length), node });
  });
  return out;
}

/**
 * proxier.go:390-392, Go's "%0.10f" of 1/n. toFixed rounds the exact binary value to nearest as Go
 * does; they could differ only on an exact tie, which 1/n first meets at n = 2048.
 */
export const computeProbability = (n: number) => (1 / n).toFixed(10);

export interface Rule {
  /** The --probability argument, or null for the last rule, which always matches. */
  probability: string | null;
  /** The pod the rule jumps to. */
  pod: string;
}
/** proxier.go:1454-1472: the chain kube-proxy writes for these endpoints, in order. */
export function rules(endpoints: readonly string[]): Rule[] {
  const n = endpoints.length;
  return endpoints.map((pod, i) => ({ probability: i < n - 1 ? computeProbability(n - i) : null, pod }));
}
/** The chance each rule is the one that matches: a rule is tried only if every rule before it missed. */
export function ruleShares(n: number): Q[] {
  let missed = q(1);
  const out: Q[] = [];
  for (let i = 0; i < n; i++) {
    const p = i < n - 1 ? q(1, n - i) : q(1);
    out.push(mul(missed, p));
    missed = mul(missed, sub(q(1), p));
  }
  return out;
}

/** The endpoints a node's chain lists for outside traffic: every pod under Cluster, its own under Local. */
export function endpointsOn(counts: readonly number[], policy: Policy, node: number): Pod[] {
  const all = podsOf(counts);
  return policy === 'cluster' ? all : all.filter((p) => p.node === node);
}
/**
 * Whether a node passes the load balancer's health check. Under Local the check port answers 200 only
 * when the node has a local endpoint (service_health.go:257-261). Under Cluster any node can reach any
 * pod, and the model gives every node a share, as create-external-load-balancer.md:126-128 describes
 * ("Cluster ... should have good overall load-spreading").
 */
export function passes(counts: readonly number[], policy: Policy, node: number): boolean {
  return policy === 'cluster' || counts[node]! > 0;
}
/** The share of all outside requests the load balancer sends each node. */
export function nodeShares(counts: readonly number[], policy: Policy): Q[] {
  const healthy = counts.filter((_, j) => passes(counts, policy, j)).length;
  return counts.map((_, j) => (passes(counts, policy, j) ? q(1, healthy) : q(0)));
}
/** Each pod's share of all outside requests: the node's share times the node's chain's share for it. */
export function shares(counts: readonly number[], policy: Policy): Record<string, Q> {
  const out: Record<string, Q> = Object.fromEntries(podsOf(counts).map((p) => [p.id, q(0)]));
  nodeShares(counts, policy).forEach((share, node) => {
    const eps = endpointsOn(counts, policy, node);
    if (!eps.length) return;
    const each = ruleShares(eps.length);
    eps.forEach((p, i) => (out[p.id] = add(out[p.id]!, mul(share, each[i]!))));
  });
  return out;
}
/** One band of the flow picture: the share of all outside requests that enter at `node` and reach `pod`. */
export interface Flow {
  node: number;
  pod: string;
  share: Q;
}
/** Every band with traffic, node by node and pod by pod in each node's chain: the node's share times the rule's share. */
export function flows(counts: readonly number[], policy: Policy): Flow[] {
  return nodeShares(counts, policy).flatMap((share, node) => {
    const eps = endpointsOn(counts, policy, node);
    const each = ruleShares(eps.length);
    return value(share) === 0 ? [] : eps.map((p, i) => ({ node, pod: p.id, share: mul(share, each[i]!) }));
  });
}
/** The share of outside requests that a node sends on to a pod on another node: the second hop. */
export function secondHop(counts: readonly number[], policy: Policy): Q {
  let out = q(0);
  nodeShares(counts, policy).forEach((share, node) => {
    const eps = endpointsOn(counts, policy, node);
    const away = eps.filter((p) => p.node !== node).length;
    if (eps.length) out = add(out, mul(share, q(away, eps.length)));
  });
  return out;
}
/** The source address a pod sees on an outside request that arrived at `node`. */
export const seenSource = (policy: Policy, node: number) => (policy === 'cluster' ? nodeIp(node) : CLIENT_IP);

/** Everything the scene shows for one case. */
export function story(key: PlacementKey, policy: Policy) {
  const counts = PLACEMENTS[key];
  const pods = podsOf(counts);
  return {
    counts,
    pods: pods.map((p) => p.id),
    passes: counts.map((_, j) => passes(counts, policy, j)),
    nodeShares: nodeShares(counts, policy).map(frac),
    shares: Object.fromEntries(Object.entries(shares(counts, policy)).map(([k, v]) => [k, frac(v)])),
    secondHop: frac(secondHop(counts, policy)),
  };
}
