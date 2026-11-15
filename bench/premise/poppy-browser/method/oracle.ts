// The oracle: the Personal Agent Protocol draft 1.0 (in progress; as published on 2026-11-13), section 6 and
// 10.6, read and not run. These are the draft's example values and rules as scenes/explainers/poppy-browser/
// model.test.ts pins them (the test named for each is given beside it). There is no reference implementation
// to record from, so this oracle is the specification's text, not a measurement.

/** "section 6: the endpoint comes from poppy.json, and the authorize URL is the endpoint with /authorize". */
export const ENDPOINT = 'https://example.com/poppy/browser-session';
export const AUTHORIZE_URL = 'https://example.com/poppy/browser-session/authorize';

/** "6, step 1: the spec's example response ...": 200, and the join cookie's attributes. */
export const PAGE = { status: 200, maxAge: 60, httpOnly: true, sameSite: 'Strict', namePrefix: '__Host-' } as const;

/** Step 2's answers: "answers 204"; "a token without poppy:browser-sign-in gets 403 insufficient_scope". */
export const AUTHORIZE = { ok: 204, lacking: { status: 403, error: 'insufficient_scope', needs: 'poppy:browser-sign-in' } } as const;

/** Step 3: "joins the Session; the join cookie is cleared" with a redirect (303 to / is the model's number; the draft says "redirects"). */
export const SUBMIT_OK = { status: 303, location: '/' } as const;

/** 10.6, the two attacks, as the story test pins their answers. */
export const FORGE_FAILED = ['the form came from evil.example, so the browser sent no join cookie'] as const;
export const PHISH = {
  declined: 'a code from a message may come from someone else’s browser, and the agent authorizes only a code its own browser loaded',
  failed: ['no agent authorized the code'],
} as const;

/** "6: the table of what a join does to a login the browser already had": [login before, join's token account] -> [while joined, after sign-in ends]. */
export const LOGIN_TABLE: readonly { before: string | null; token: string | null; whileJoined: string; after: string }[] = [
  { before: null, token: null, whileJoined: 'not logged in; requests belong to the Session', after: 'not logged in' },
  { before: null, token: 'A', whileJoined: 'signed in to A, with the token’s scopes', after: 'signed out' },
  { before: 'A', token: null, whileJoined: 'logged in as A through its own login', after: 'logged in as A' },
  { before: 'B', token: 'A', whileJoined: 'signed in to A, with the token’s scopes', after: 'signed out; the login as B does not come back' },
];
