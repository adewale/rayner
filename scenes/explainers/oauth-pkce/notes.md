# Construction and scope

The opening theft is replayed after the code is bound to a challenge, making the changed token-endpoint requirement visible. The no-attacker setting follows the legitimate exchange; it does not remove the challenge check.

This is RFC 7636's intercepted-authorization-code threat for a public native client, using S256. The example verifier and challenge come from appendix B; a real sign-in needs a fresh, unpredictable verifier. The challenge calculation is checked against that vector. A readable challenge does not make recovering a random verifier practical, but SHA-256 is not a mathematical guarantee that a preimage cannot exist.

The diagram omits ordinary token-request fields and validation not needed for the comparison; the opening caption names the client ID and redirect URI so this omission does not imply they are unnecessary. PKCE does not protect a compromised client that leaks its verifier or replace other OAuth checks. Sources: [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636) and [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749).
