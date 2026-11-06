# How does a token bucket let a burst through but refuse a flood?

- **Reader:** knows that an API server answers each request, and may have met 429 Too Many Requests; has not seen how one rule can allow a short burst and still bound what follows it.
- **Answer:** A burst can spend only the tokens saved up, and only elapsed time adds more
- **Changed condition:** the refill rate: one, two or four tokens a second, with the bucket held at five. R6 is refused at every rate, because no time passes inside the burst; R7 is refused at one token a second and accepted at two and four; at one token a second two of R7 to R9 are refused; the four-second wait is clipped by the cap at two and four tokens a second but not at one.
- **Reader's own work:** predict how many of six simultaneous requests get 200 before the burst plays; choose a refill rate and watch which later requests fail; send requests themselves on the live bucket; answer the check questions, which change the bucket size, the arrival pattern and R10's arrival time.
- **Checked against:** golang.org/x/time/rate v0.15.0: `tools/oracle/token-bucket` runs `rate.NewLimiter(r, 5).AllowN` on the explainer’s ten arrival times at one, two and four tokens a second, and `test/explain-models.test.ts` holds the model’s answers and balances to `test/fixtures/token-bucket-xtime.json`; the model is also checked against an independent quarter-token ledger at varied rates and capacities, and `test/explain-token-bucket.test.ts` holds the check answers and the boundary below which R10 is refused to the model. This schedule only; not every feature of the Go package.
- **Leaves out:** more than one client, a bucket that does not start full, requests costing more than one token, queueing, reserving future tokens, server work, and clocks that run backwards; the comparison claims “R10 is accepted at every rate” only for the three rates shown.

## Check yourself

1. R6 is refused at all three rates. Would a faster refill or a bigger bucket let it through, and why?
   A bigger bucket. R1 to R6 arrive at the same instant, so no time passes and refill adds nothing at any rate. A bucket of six tokens, still at 2 a second, answers R6 with 200.
2. At 2 tokens a second, a client sends one request every 0.4 seconds from a full bucket and never pauses. Is any request refused, and what share gets through in the long run?
   Yes. Each gap earns 0.8 tokens and each request spends one, so the saved five drain by 0.2 a request and request 22 is the first refused. From then on 80 of every 100 get through, 2 a second: the refill rate, however long the flood lasts.
3. Suppose R10 arrived at 1.5 s instead of 5 s. At which of the three rates would it be refused?
   At 1 token a second only. At 1 a second R9 leaves 0 and R10 finds 0.5; at 2 a second R9 leaves 0 and R10 finds 1; at 4 a second R9 leaves 1 and R10 finds 3. Half a second has to earn the token R9 did not leave.

## Why this explainer

A rate limit has to stop one client from using up a server’s work, yet a page that loads may legitimately fire five requests at once. The token bucket answers both with one balance, and the point to take away is the split between its two numbers: capacity sets how big a burst can be, the rate sets how soon the client can send again.

The arrival schedule is built to isolate each part. Six simultaneous requests isolate capacity from the refill rate, so the reader who expects a faster refill to save R6 is wrong at every rate. R8 and R9, arriving together, isolate elapsed time from the number of requests: arrival order decides who gets the last token. The final four-second wait exposes the cap, which throws refill away at two and four tokens a second but not at one. Three rates against the same schedule turn the opening claim into a comparison.

The plotted refill line shows the credit allow() would find at any moment between calls, although the implementation updates its balance lazily, only when a request arrives; no timer ticks it up. The final comparison’s “R10 is accepted at every rate” means the three rates shown, and the caption says so in its next sentence, with the boundary below a fifth of a token a second where R10 is refused too. The `fork` explainer quotes that sentence and its fidelity test pins it, and fork imports this explainer’s model, so `model.ts`’s exports must stay as they are.

The bucket is the Lantern token-bucket scene’s model, compared with Go’s golang.org/x/time/rate; 429 is from RFC 6585 §4.
