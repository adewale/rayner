# Which address should Express call the client?

- **Reader:** runs an Express app behind a CDN and a load balancer and has set, or is about to set, `trust proxy`; knows what an IP address and an HTTP header are, but not how Express reads X-Forwarded-For.
- **Answer:** req.ip is the nearest address Express does not trust, or the farthest one if it trusts all the others
- **Changed condition:** the route into the app. With trust proxy 2 the client through the CDN gets its real address, but the attacker who skips the CDN chooses req.ip, because the shorter route puts the attacker's own address in the second trusted position. The trust setting (true, 1, 2 or an address list) changes which of the three requests come out right; only the address list gets all three.
- **Reader's own work:** predict whose address Express reports before the answer; choose any of the twelve setting-and-request scenarios; answer the check questions, which move the attack to two made-up entries, add a third proxy, and ask what the address list relies on.
- **Checked against:** real Express 5.3.0 (proxy-addr 2.0.8, forwarded 0.2.0): req.ip and req.ips recorded from one run over a real HTTP connection, with only the socket address stubbed, for the four offered settings and false, 0, 3 and 'uniquelocal' on the three requests' headers; `test/explain-trust-proxy.test.ts` requires the model to give exactly those answers, and checks its IPv4 range test against independent network arithmetic.
- **Leaves out:** IPv6 and IPv4-mapped addresses; proxies that replace or strip X-Forwarded-For instead of appending to it, and network rules that stop requests reaching the load balancer directly; it is not a complete deployment-hardening guide, and an address list is only as sound as its trusted ranges and the proxies inside them.

## Check yourself

1. The attacker skips the CDN again, but writes two made-up entries: X-Forwarded-For: 5.6.7.8, 1.2.3.4. Which address becomes req.ip with trust proxy 2, and which with true?
   With 2, 1.2.3.4: Express trusts the load balancer and the attacker’s real address by position, then stops at the next entry, the made-up one nearest to it. With true, 5.6.7.8: every address is trusted, so Express reaches the far end of the list and takes it without a test. Either way the attacker chose req.ip.
2. You put a firewall service at 100.64.0.20 in front of the CDN, so a client’s request now passes three proxies. With trust proxy 2, whose address does req.ip report for a client? Which setting gives the client’s address and still stops the attacker who skips the CDN?
   The firewall’s: the two trusted positions now hold the load balancer and the CDN edge, so the third proxy is the first address left. A count of 3 gives the client, but on the route that skips the CDN it trusts every address, and the attacker’s made-up entry becomes req.ip. The address list with 100.64.0.20 added gives the client, 203.0.113.7, and the attacker’s real address on the short route.
3. What must hold for the address list '10.0.0.0/8, 192.0.2.0/24' to keep req.ip right?
   Every trusted range must hold only your own proxies. The list trusts machines by address, not positions, so path length no longer matters, but an attacker inside a trusted range would be skipped like a proxy.

## Why this explainer

The usual advice is "set trust proxy to the number of proxies in front of you", and with one route into the app that advice works. The point here is that a hop count trusts positions, not machines: it is only right when every route has the same length. So the explainer needs a short route. With a single two-proxy route a correct hop count and an address list give the same answers, and the reader would have no reason to prefer one.

The default scenario is the failing one, trust proxy 2 with the attacker skipping the CDN, because that is the case the reader has probably configured without knowing it. The settings cross four trust policies with three requests so the reader can find for themselves that only the list is right for all three.

The routes step lines up the attacker's two routes by position counted from Express, so a count's cut and the list's per-address trust sit in one picture; that is the moment meant to stick. The code step then ties the numeric setting to `i < n` in Express's source, so the reader sees it never looks at the address. The table at the end is the twelve answers real Express gave, so the comparison rests on the real thing rather than on this model alone.

The proxies' habit of appending the address they saw is an assumption the scene states, not something Express's guide describes.
