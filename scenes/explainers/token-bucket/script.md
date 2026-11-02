# How can a server allow a burst but refuse a flood?

An API server needs to stop one client from consuming all its work, but a short burst can be useful: loading a page may require five requests at once. Requests the server accepts get 200, OK. Those refused by this limit get 429, Too Many Requests. How can one rule allow the short burst and still bound what follows?

Give the client a balance of five tokens. An accepted request spends one; a request that finds less than one is refused. Refill the balance as time passes, but never above five. This balance is the token bucket: its capacity sets the saved burst, while its refill rate sets how quickly the client can earn another request.

Six requests arrive at the same instant. The first five spend the saved tokens. The sixth finds zero and gets 429. Raising the refill rate cannot help that sixth request: no time has passed in which to earn a token.

At the default rate of two tokens a second, a half-second wait earns one token. R7 arrives then, spends it and succeeds. At one token a second, the same wait earns only half a token, so R7 is refused. At four a second, it earns two. Fractional balances matter even though each request spends a whole token.

Another half second passes before R8. At two tokens a second that restores one token, which R8 spends. R9 arrives at the same instant as R8 and finds what R8 left, with no additional refill. At this rate R8 succeeds and R9 fails. Arrival order matters when requests compete for the last token.

R10 arrives after four quiet seconds. At two tokens a second, the empty balance could have gained eight tokens, but the capacity stops it at five. The line rises to the cap and then stays flat. Waiting longer does not buy a larger saved burst. At one token a second, these four seconds earn only four tokens, so this particular wait does not yet reach the cap.

The balance need not be updated by a background timer. When a request arrives, the server adds elapsed time multiplied by the rate, caps the result at five, then decides whether it can spend a token. The rising line shows the credit available at each time, even while no request is running.

Compare the same ten arrival times at one, two and four tokens a second. All three rates refuse R6 because the initial burst exhausts the same five-token capacity. All three accept R10 after its wait. Between those moments, the refill rate decides how quickly the client can resume sending requests.
