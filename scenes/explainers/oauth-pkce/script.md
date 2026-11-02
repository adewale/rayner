# Script: why stealing an authorization code is not enough

Questions the reader brings: What is PKCE for? If someone grabs my app's authorization code, why can't they use it?

A mobile or desktop app often gets its authorization code back as a redirect to a custom URI scheme. Another app on the device can register the same scheme, and the operating system may hand it the redirect and its code (RFC 7636 §1). The app is a public client: it has no client secret, because anything shipped inside it can be unpacked. So the token endpoint gives an access token to whoever presents the code, and the malicious app gets one. What could stop it?

Bind the code to a secret only the real client holds. For each sign-in the client makes a fresh random code_verifier and keeps it. It sends ahead only the code_challenge, the verifier's SHA-256 in base64url, a method called S256. Redeeming the code also needs the verifier, which never passes through the redirect. RFC 7636's example verifier gives the challenge E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM.

Now the flow again. The authorization request carries the challenge and S256 through the browser, so the challenge is treated as public. The server stores it with a short-lived code and redirects back. The malicious app catches the code as before, but its token request needs a verifier too. It can only guess one; S256 of the guess does not match the bound challenge, and the server answers invalid_grant. The real client sends the code with its verifier, the server's S256 of it equals the bound challenge, and it gets a token.

The challenge and the code pass through the browser and the operating system, where another app can read them. The verifier goes only in the client's own TLS request to the token endpoint, and S256 cannot be reversed, so whoever catches the redirect holds a code it cannot redeem. This holds only while the verifier itself stays on the client.

**The aha:** the theft from the first step is replayed move for move, and the same stolen code now earns invalid_grant.

**Sentence to remember:** PKCE binds the code to the hash of a secret the client keeps; the code travels through the redirect, the secret does not, so a stolen code cannot be redeemed.

**Check questions**, in `meta.checks`, asked after the last step:

1. Without PKCE, what does the malicious app need, besides the redirect it caught, to get a token?
2. The thief sends the stolen code with a guessed verifier. What does the server compute, and what does it answer?
3. RFC 7636's example verifier is dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk. Which challenge is bound to the code?

The challenge comes from `pkceChallenge` in `lib/models.ts`, tested against RFC 7636 appendix B. The setting replays the theft against PKCE (the default) or follows only the real client.

| Step | Script | Reader predicts |
| --- | --- | --- |
| stolen | paragraph 1, the theft without PKCE | what could stop the thief |
| secret | paragraph 2, verifier, challenge and S256 named, and the answer | |
| authorize | paragraph 3, the challenge sent through the browser | |
| code | paragraph 3, the code bound to the challenge | what happens when the thief redeems it (theft case) |
| attack | paragraph 3, invalid_grant (theft case only) | |
| exchange | paragraph 3, the real client's verifier matches | |
| channels | paragraph 4, where each value travels, and the limit | |
