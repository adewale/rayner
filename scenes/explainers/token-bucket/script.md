# How does a token bucket let a burst through but refuse a flood?

An API server has to stop one client from using up all its work, but a short burst is often legitimate: a page that loads may fire five requests at once. Requests the server accepts get 200, OK; requests this limit refuses get 429, Too Many Requests. One rule has to allow the burst and still bound what comes after it.

Give the client a balance of five tokens. An accepted request spends one; a request that finds less than one token is refused. As time passes the balance refills, but never above five. That balance is the token bucket.

Six requests arrive at the same instant. The first five spend the saved tokens, and the sixth finds none and gets 429. Would a faster refill have saved it? No: no time passed, so there was nothing to refill. A burst can spend only the tokens saved up, and only elapsed time adds more.

At the default two tokens a second, half a second earns one token. R7 arrives then, spends it and succeeds. At one token a second the same wait earns half a token, which is not enough, so R7 is refused; at four a second it earns two. The balance keeps fractions, but a request must spend a whole token.

Another half second brings R8 and R9 together. At two tokens a second that half second restores one token, R8 spends it, and R9, arriving in the same instant, finds what R8 left: nothing. When requests compete for the last token, arrival order decides.

R10 comes after four quiet seconds. At two tokens a second the empty balance would gain eight, but the cap stops it at five, and the line on the chart rises to five and runs flat. Waiting longer never buys a bigger burst than the bucket holds. At one token a second the same four seconds earn only four, so this wait does not reach the cap.

No timer has to tick the balance up between requests. When a request arrives, the server adds the elapsed time multiplied by the rate, caps the result at five and only then decides whether to spend a token. The rising line shows the credit that calculation would find at any moment.

Run the same ten arrival times at one, two and four tokens a second. R6 fails at all three, because a burst draws on the same five saved tokens whatever the rate. R10 succeeds at all three, but that is a fact about these rates, not about the rule: below a fifth of a token a second, R10 would find less than one token after its wait and be refused too. Capacity sets how big a burst can be; the rate sets how soon the client can send again. R7 to R9 ask for three requests in one second, faster than one token a second can pay for, and at that rate two of them are refused: once the saved tokens are gone, the client is held to the rate, which is how the bucket refuses a flood.
