# Script: how does a token bucket let a burst through but refuse a flood?

Questions the reader brings: Why would a server refuse a request? What is a token bucket? Why does it accept five requests at once and refuse the sixth?

An API server shares its work among many clients. If one client sends requests as fast as it can, everyone else waits. So the server limits each client. It answers a request it will serve with 200, OK, and one it refuses with 429, Too Many Requests: slow down and try later. The limit should still let a client send a short burst, such as a page loading five things at once.

A token bucket does both with one number. The server keeps a balance of tokens for the client, at most five: the bucket. Each accepted request spends one token, and a request that finds less than one gets 429. Ten requests from one client are coming: six at the same instant, then three within the next second, then one after a long quiet spell.

Six arrive at once. The first five each spend a token and get 200. The sixth finds none and gets 429. No time passed between them, and tokens come back only with time: each call adds the time since the last call multiplied by the refill rate, two tokens a second here. Nothing runs between calls. That is the answer: a burst can spend only the tokens saved up, and only elapsed time adds more.

So whether R7, half a second later, gets through depends on the rate. Half a second buys one token at two a second, so R7 finds exactly one and gets 200. At one token a second it buys half a token and R7 gets 429; at four it buys two. R8 at one second finds what another half second added; R9 arrives at the same instant as R8, so it finds what R8 left.

A client that goes quiet cannot save up a flood. R10 waits four seconds. At two tokens a second that would bring the balance to eight, but min(5, …) stops it at five: the chart's line climbs, then runs flat along the top, and the tokens that would have come are thrown away. At four a second the line reaches five even sooner. At one a second the same wait brings only four, under the cap: the cap matters once the wait is long enough for the rate.

Last, the same ten requests at one, two and four tokens a second. R6 is refused at every rate and R10 accepted at every rate; in between, a slower refill refuses more of the requests that follow a burst.

**The aha:** R10's line climbs to five and runs flat. Waiting longer buys nothing, so the bucket's size, not the length of the wait, bounds the next burst.

**Sentence to remember:** a burst can spend only the tokens saved up, and only elapsed time adds more, never past the bucket's five.

**Check questions**, in `meta.checks`, asked after the last step:

1. At 4 tokens a second, R9 leaves 1 token and R10 arrives four seconds later. How many tokens does R10 find, and why not 17?
2. At 2 tokens a second, R8 and R9 arrive at the same instant. Why does R8 get 200 and R9 get 429?
3. At 1 token a second, what does R7 find half a second after the burst?

**Grounding:** the model (`TokenBucket` in `scenes/explainers/lib/models.ts`) is compared with `golang.org/x/time/rate` v0.15.0 on this schedule at every rate (`tools/oracle/token-bucket`, `test/fixtures/token-bucket-xtime.json`). 429 is defined in RFC 6585, section 4.

| Step | Script | Reader predicts |
| --- | --- | --- |
| balance | paragraphs 1 and 2: why limit, 200 and 429, the bucket of five, the ten requests | how many of six simultaneous requests get 200 |
| burst | paragraph 3: five 200s, a 429, refill only with time, and the answer | R7 at 0.5 s: 200 or 429? |
| refill | paragraph 4: the rate decides R7; R8 and R9 | |
| later | paragraph 5: the cap clips a long wait: the aha | |
| trace | paragraph 6: the same requests at three rates | |
