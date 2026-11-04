# Construction and scope

The 3, 1, 0 placement separates equal node shares from equal pod shares. The 2, 2, 0 and 1, 1, 1 scenarios show that Local need not be uneven. Explain the conditional iptables probabilities before combining node and pod shares; otherwise the familiar-looking fractions conceal the mechanism.

Shares are long-run averages for kube-proxy's iptables mode and equal load-balancer shares among healthy nodes. They are not a schedule or a throughput prediction. The model omits topology-aware routing, session affinity and weighting by pod count. IPVS uses a different selection mechanism. The source-address comparison concerns the outside-request path drawn here, not every Kubernetes network implementation.

Sources: [Kubernetes 1.37.1 iptables proxier](https://github.com/kubernetes/kubernetes/blob/v1.37.1/pkg/proxy/iptables/proxier.go), its [health-check implementation](https://github.com/kubernetes/kubernetes/blob/v1.37.1/pkg/proxy/healthcheck/service_health.go), and [Kubernetes source-IP documentation](https://kubernetes.io/docs/tutorials/services/source-ip/). The source annotations in `scene.ts` identify the exact implementation branches.
