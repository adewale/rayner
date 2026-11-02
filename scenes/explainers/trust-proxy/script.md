# Script: which address should Express call the client?

Question the reader brings: my Express app sits behind a CDN and a load balancer. I set `trust proxy` so `req.ip` is the visitor's address, not the load balancer's. Which setting is right, and can a visitor lie?

An app reaches the internet through a CDN and then a load balancer, so it sees every connection come from the load balancer. Express's guide says to set `trust proxy` to the number of proxies, here 2. But the load balancer also accepts connections from the internet, so an attacker can skip the CDN. With trust proxy 2, what is `req.ip` for the attacker's request?

It is 1.2.3.4, an address the attacker made up. The only way Express learns about anything beyond the load balancer is the X-Forwarded-For header: each proxy appends the address its connection came from, and nothing stops the sender writing entries of its own first. The attacker sends `X-Forwarded-For: 1.2.3.4` to the load balancer, which appends the attacker's real address, 198.51.100.9.

Express reads the addresses from its own connection outward: the socket's 10.0.0.5, then the header's entries right to left. It skips each address it trusts, and req.ip is the nearest address Express does not trust, or the farthest one if it trusts all the others. A number n trusts the first n addresses by position alone, whatever they are. On this path the second address is the attacker's own, so Express trusts it as if it were the CDN, and the next entry, the one the attacker wrote, is req.ip. The source says so in one line: a number becomes `function(a, i){ return i < val }`.

The same setting is right for the client through the CDN and for the attacker through the CDN: both paths have two proxies. It fails only on the path with one proxy fewer, which is what Express's guide warns about: a hop count assumes every path has the same length. An address list that trusts the load balancer's network and the CDN edge's range trusts machines, not positions, and gets all three requests right, provided those ranges hold only your proxies.

**The aha:** on the short path, the count of two lands on the attacker's own address, and the address after it is one the attacker typed.

**Sentence to remember:** a hop count trusts positions; trust your proxies by address, or an attacker on a shorter path chooses req.ip.

**Check questions**, in `meta.checks`, asked after the last step:

1. Why does trust proxy 2 report an address the attacker wrote when the attacker skips the CDN?
2. Which address does Express never test, and why does that matter with trust proxy true?
3. What must hold for the address list to stay right?

**The reader's lever:** two settings, the trust setting and the request. Each of the twelve combinations is checked against real Express 5.3.0.

| Step | Script | Reader predicts |
| --- | --- | --- |
| paths | paragraph 1: two ways in, the question | req.ip for this setting and request |
| follow | paragraph 2: the answer, and X-Forwarded-For as each machine sees it | why Express picks that entry |
| read | paragraph 3: the walk outward, trusted by position, and the answer sentence | |
| code | paragraph 3, last sentence: the setting's branch and the loop in the source | |
| requests | paragraph 4: the same setting against all three requests | |
| why | paragraph 4: the short path, and the guide's warning | |
| ranges | paragraph 4: the address list | |
| table | all twelve answers from real Express | |
