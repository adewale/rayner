# Why stealing an authorization code is not enough

A mobile app signs a user in through a browser. The authorization server returns a short-lived code in a redirect to the app's custom URI scheme. Another app can register the same scheme and intercept that redirect. The legitimate app is a public client: a secret embedded in its distributed program could be extracted, so it cannot rely on such a secret to authenticate the token request. In the unprotected exchange shown, the malicious app can redeem the intercepted code. What extra proof could distinguish the app that started the sign-in from the app that caught the redirect?

The legitimate app creates a fresh random secret for this sign-in and keeps it: the code verifier. Before the redirect, it sends a derived value, the code challenge. With the S256 method, the challenge is the SHA-256 hash of the verifier, encoded as base64url. The server binds that challenge to the authorization code it will issue.

The challenge can travel through the browser without revealing a usable verifier. Given a sufficiently random verifier, finding a value that hashes to its challenge is computationally infeasible. The verifier itself takes a different route: the client's direct TLS connection to the token endpoint.

Replay the theft. The malicious app catches the same sort of redirect and obtains the code, but redeeming this code now requires a verifier too. It submits a guess. The token endpoint hashes the guess using S256 and compares it with the challenge bound to the code. They differ, so it returns invalid_grant instead of a token.

The legitimate app presents the code with the verifier it retained. The server applies the same calculation, finds a match and returns the token. The server did not need to receive the secret in advance; the earlier challenge let it recognize the correct secret later.

Follow the channels rather than treating every sign-in value as equally sensitive. The challenge and code pass through the browser and redirect; the verifier stays with the client until the token request. PKCE blocks this intercepted-code attack by requiring proof from the app that began the exchange. If an attacker obtains the verifier as well as the code, that protection is lost.
