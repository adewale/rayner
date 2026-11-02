# Which address should Express call the client?

Your Express app sits behind a CDN and a load balancer. Every connection reaching the app comes from the load balancer, so the socket address identifies that machine rather than the visitor. The trust proxy setting tells Express how to look past it.

There appear to be two proxies, so you choose trust proxy 2. But the load balancer also accepts requests directly from the internet. An attacker skips the CDN and sends a request with X-Forwarded-For: 1.2.3.4, an address they invented. Will Express report the attacker's actual address?

The load balancer appends the address it really saw, 198.51.100.9. Express receives the header 1.2.3.4, 198.51.100.9 over a connection from 10.0.0.5. The header is a list of reported addresses, not a certificate that each address is genuine. A sender can supply its own entries before the proxies add theirs.

Express reads outward from the connection it can observe: first 10.0.0.5, then the header from right to left. It skips trusted addresses and stops at the first one it does not trust. If it reaches the farthest entry, that entry becomes req.ip without another trust check.

A numeric setting trusts positions. With 2, the load balancer occupies the first trusted position and the attacker's real address occupies the second. Express treats that second position as another proxy even though no CDN handled this request. The next entry is 1.2.3.4, so the attacker chooses req.ip. The source implements the numeric setting by comparing the address's index with the configured number; it does not inspect which machine occupies that index.

Follow the same request through the CDN instead. The two trusted positions now contain the load balancer and CDN, and the next address is the real sender. The hop count succeeds on this route and fails on the shorter one. Choosing a count requires knowing every route into the app, not just the intended route.

An address list makes a different decision: trust the load balancer's network and the CDN's range, rather than the first two positions. On the direct route it skips the load balancer but stops at the attacker's actual address. On the CDN route it skips both proxies. That gives the right sender for the three requests shown, provided the trusted ranges contain only trusted proxies and those proxies preserve an accurate forwarding chain.

Compare all twelve combinations of request and trust setting. The setting true walks to the farthest reported address; a smaller hop count stops too soon on the longer route; the count of two goes too far on the shorter route. The address list works across these routes because the trust decision follows the proxy's identity rather than its position.
