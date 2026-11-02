# Why does one pod get three times the traffic?

A Kubernetes Service has four pods: three on Node 1, one on Node 2 and none on Node 3. A cloud load balancer sends outside requests to nodes, then rules written by kube-proxy choose a pod. With externalTrafficPolicy set to Local, a node can choose only its own pods. Which pod gets the most requests?

First consider Node 1's three pods. In iptables mode, the first rule takes one third of arriving requests. The second rule sees only the remaining two thirds and takes half of those: another one third of the original total. The last rule takes what remains. The rule probabilities differ because each later rule sees fewer requests; the resulting pod shares are equal.

The load balancer makes a separate choice before any of those rules run. Under Local, a node with a pod of this Service passes the health check; a node without one fails. Node 3 drops out. In this example the load balancer divides requests equally between the two healthy nodes.

Node 1 gets half the requests and divides that half among three pods: one sixth each. Node 2 gets the other half and gives it all to pod d. Pod d therefore receives three times as much traffic as any pod on Node 1. Equal treatment of nodes does not imply equal treatment of pods when those nodes hold different numbers of pods.

Change the policy to Cluster. Each node can now choose any of the four pods. Each pod receives one quarter of each node's traffic, so its total share is one quarter too. The entry node need not contain the selected pod: in this placement, two requests in three take a second hop to another node.

That second hop also explains part of the address trade. In the iptables path shown, Cluster applies source NAT to outside requests: it replaces the client's address with the forwarding node's address, including requests whose chosen pod is local. Local keeps the request on its entry node and preserves the client's address.

Try a placement of two pods on each of two nodes instead. Under Local, each healthy node still gets half, but now each divides that half two ways, giving every pod one quarter. The unevenness came from unequal pod counts per healthy node, not from Local inevitably favouring a particular pod. A load balancer that weights nodes by their pod counts could change the result as well.
