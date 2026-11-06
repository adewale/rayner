# How does traffic policy divide requests among pods?

- **Reader:** has deployed a Service on Kubernetes, or knows what nodes, pods and a cloud load balancer are, and has met externalTrafficPolicy as a setting without knowing what it does to the load.
- **Answer:** The load balancer weighs nodes, not pods
- **Changed condition:** the policy and the placement. With pods 3, 1, 0 under Local, the lone pod on Node 2 gets three times the requests of each pod on Node 1; under Cluster every pod gets a quarter, but two requests in three take a second hop and every pod sees a node's address instead of the client's. With 2, 2, 0 or 1, 1, 1, Local is even too, which shows the unevenness comes from unequal pod counts on healthy nodes, not from Local itself.
- **Reader's own work:** predict which pod gets the most requests; switch policy and placement to see the shares, second hop and client address change; answer the check questions about placements and chains the page does not draw.
- **Checked against:** kube-proxy's own code and tests at Kubernetes v1.37.1, in `test/explain-traffic-policy.test.ts`: the rule probabilities against `computeProbability`'s expected strings in `proxier_test.go` and a Go run of `proxier.go`'s formatting, and the two-endpoint chain against kube-proxy's expected output. The health-check, source-NAT and equal-weight load-balancer behaviour are read from the cited source and docs, not run; the shares that follow are checked only by the model's own property tests (they sum to 1 and follow each policy's rule).
- **Leaves out:** IPVS mode, topology-aware routing, session affinity and load balancers that weight nodes by pod count; shares are long-run averages for iptables mode, not a schedule or throughput; the source-address comparison covers the outside-request path drawn here, not every network implementation.

## Check yourself

1. Under Local, with pods placed 4, 1, 0, what share of the requests does the pod on Node 2 get, and what does each pod on Node 1 get?
   Node 3 fails the health check, so Node 1 and Node 2 get 1/2 each. Node 2’s one pod keeps all of its 1/2; Node 1 splits its 1/2 four ways, 1/8 each. The lone pod gets 4 times as many requests.
2. Under Cluster, every node’s chain lists four pods. With what probabilities do its rules match, and what share does each pod get?
   1/4, then 1/3, then 1/2, then always: each rule matches 1/(n−i) of the requests that reach it, so each pod gets 1/4 of what the node receives.
3. Which placements of four pods on these three nodes give every pod the same share under Local?
   Only 4, 0, 0 and 2, 2, 0, in any order of the nodes. Under Local each healthy node gets an equal share and splits it among its own pods, so the shares are even exactly when every node with pods runs the same number.

## Why this explainer

The surprise is that one pod gets three times the traffic of its siblings under a setting people choose to preserve client addresses. The 3, 1, 0 placement is chosen because it separates two things readers run together: equal shares per node and equal shares per pod. The load balancer splits by node; each node's rules split by pod; with unequal pod counts the two products differ.

The conditional iptables probabilities (1/3, then 1/2, then always) are explained before the node and pod shares are combined. Otherwise the familiar fractions conceal the mechanism, and readers who look at a real chain think the later pods are favoured.

The flow picture draws both policies as bands as wide as their share and coloured by entry node, so the reader sees the two cuts as one picture: under Cluster each pod's bar collects three colours, under Local pod d's bar is Node 2's whole band. The story then turns to what Cluster costs (the second hop and source NAT), so the ending is the real trade: even load against the client's address. The 2, 2, 0 and 1, 1, 1 scenarios are there to stop the reader concluding that Local is always uneven.

The check answers were computed from the model when they lived in the scene; if the model changes, recompute them. Sources are pinned: kubernetes/kubernetes at v1.37.1 and kubernetes/website at commit 0c2509f, with the exact lines quoted in `model.ts` and beside the steps.
