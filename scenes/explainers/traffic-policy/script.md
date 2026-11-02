# Script: how does traffic policy divide requests among pods?

Questions the reader brings: I set externalTrafficPolicy: Local to keep client addresses. Why is one pod hot? How does Kubernetes pick a pod for an outside request?

Start from a concrete cluster: a Service of type LoadBalancer with four pods, three on Node 1, one on Node 2 and none on Node 3. A cloud load balancer sends outside requests to the nodes, and rules kube-proxy writes on each node hand each request to a pod. The Service's externalTrafficPolicy sets which pods a node may pick: under Cluster, the default, any pod; under Local, only its own. This one is Local. Ask the reader: which pod gets the most requests?

First, how a node picks. In iptables mode kube-proxy writes one rule per pod, and rule i of n matches with probability 1/(n−i): 1/3, then 1/2, then always. That gives each pod the same 1/n of what the node receives, the part of this explainer most readers have not seen. Under Local, Node 1's chain lists only its three pods.

Then how the load balancer picks a node. Under Local, kube-proxy answers its health check with 200 on a node that runs a pod and 503 on one that runs none, so Node 3 drops out, and Node 1 and Node 2 get half each.

The answer: the load balancer weighs nodes, not pods. Node 1 splits its half three ways, 1/6 per pod; Node 2 gives all of its half to pod d, three times pod a's load. Under Cluster (the setting) every node lists all four pods and each gets 1/4, but two requests in three cross to another node first.

The comparison makes the trade explicit: Cluster evens the load but sends requests across nodes and rewrites their source address; Local keeps each request on its node with the client's address and gives uneven load whenever nodes run different numbers of pods (2, 2, 0 and 1, 1, 1 are even). Then the address itself: under Local, pod a sees 198.51.100.79; under Cluster, the pod sees the forwarding node's address. The last step names what the shares leave out.

**The aha:** the per-pod percentages land on the diagram: 16.7% over each pod on Node 1, 50% over pod d.

**Sentence to remember:** the load balancer weighs nodes, not pods, so under Local a pod's share is its node's share divided by the pods on that node.

**Check questions**, in `meta.checks`, asked after the last step:

1. With pods placed 3, 1, 0 and Local, why does pod d get three times the requests of pod a?
2. A node's chain lists three pods. With what probabilities do its rules match, and what share does each pod get?
3. With pods placed 2, 2, 0, are Local's shares even?

| Step | Script | Reader predicts |
| --- | --- | --- |
| topology | paragraph 1: the cluster and the two policies | which pod gets the most |
| rules | paragraph 2: the 1/(n−i) chain | |
| health (Local) / second-hop (Cluster) | paragraph 3: how the load balancer picks a node | |
| shares | paragraph 4: the answer, on the diagram | |
| compare | paragraph 5: Cluster against Local | |
| local-path (Local) / snat (Cluster) | paragraph 5: the address the pod sees | |
| caveats | paragraph 5: what the model leaves out | |
