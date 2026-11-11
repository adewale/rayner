import { isRefusal, refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
import { AGENT, COMPANY, POPPY_JSON, SID, THIEF, USER_IDS, answer as verifySession, sign } from '../poppy/model.ts';
import type { AccessToken, Scope, SessionJwt } from '../poppy/model.ts';

// Poppy (Personal Agent Protocol, draft 0.4), section 6 and 10.6: how the agent's browser joins a
// Session. A browser sends cookies, not the agent's headers, so it cannot carry the Session header
// (5.2) or the access token (4.5). Instead the Company's browser-session page gives the browser a
// one-time code and, in the same response, a short-lived cookie that ties the code to that browser.
// The agent authorizes the code in a request of its own, with its Session header and, if signed in,
// its access token. The browser then submits the code with the cookie, and only then does the
// Company set the Session's cookie. The code and the cookie are two halves that meet only in the
// browser that loaded the page; the authorization comes only from the agent; the token never
// reaches the browser.
//
// The Company here is example.com from chapter 1 (`../poppy/model.ts`): its domain, its poppy.json,
// the agent, the User ID and the Session ID are imported from there, and the authorize request's
// Session header is checked by chapter 1's `answer`, which holds the rules of 5.3.
//
// What it leaves out, each beside the rule it qualifies below: time (the code's and the join
// cookie's short life, Max-Age 60, so `expired` is a field nobody sets in the story), real
// randomness (codes and cookie values are fixed strings from a list), the browser's own cookie
// rules beyond SameSite and the __Host- prefix, and how the agent's software reads the page (10.2).

/** The browser-session endpoint example.com lists in its poppy.json (3, 6). */
export const ENDPOINT = POPPY_JSON.web.browser_session_endpoint;
/** Where the agent authorizes a code (6, step 2): `{browser_session_endpoint}/authorize`. */
export const AUTHORIZE_URL = `${ENDPOINT}/authorize`;
/** The scope an access token needs to sign the browser in (6, 4.7). */
export const BROWSER_SIGN_IN = 'poppy:browser-sign-in';
export type WebScope = Scope | typeof BROWSER_SIGN_IN;

/** The cookie names of the spec's example. The Company chooses its own names and values (6). */
export const JOIN_COOKIE = '__Host-poppy_join';
export const SESSION_COOKIE = '__Host-sb_session';

/** The codes the Company hands out, in order, and the join cookie value it pairs with each. Real ones are random and unguessable (6, step 1). */
export const CODES = ['bc_K9wdP4sNe7Lq2Xa8TfUj3B', 'bc_R5tyH1mGz6Vc0Dp9WkQx2E', 'bc_Vn3qT8xLw2Rk9mZ4yHc1Ad', 'bc_Ws8eJ3nBq5Yt1Lm7Gx0Pa4'] as const;
const JOIN_VALUES = ['Hk3sX9', 'Lr6tB2', 'Jq7mW2', 'Np4cZ8'] as const;
/** The Session cookie values the Company sets, in order (6, step 3). */
const SESSION_VALUES = ['Pz81kQ', 'Tf27vR', 'Ux50aD'] as const;

/** The attacker: another client (chapter 1's thief), its own Session at example.com, and an account it controls (10.6). */
export const ATTACKER = { client: THIEF, sub: 'usr_Mx2c9T', sid: 'Kd4nP0', account: 'M', site: 'evil.example' } as const;
/** The User's account at example.com, as the spec's table calls it. */
export const ACCOUNT = 'A';

// ---------------------------------------------------------------------------------------------
// Step 1: the page and its cookie.

/** What the browser-session page's response sets: its headers and the join cookie. */
export type PageResponse = {
  headers: Record<string, string>;
  cookie: { name: string; path: string; maxAge: number; secure: boolean; httpOnly: boolean; sameSite: 'Strict' | 'Lax' | 'None'; domain?: string };
};
/** The response of the spec's example (6, step 1), with the values the guides suggest. */
export const PAGE_RESPONSE: PageResponse = {
  headers: {
    'Content-Type': 'text/html',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin',
  },
  cookie: { name: JOIN_COOKIE, path: '/', maxAge: 60, secure: true, httpOnly: true, sameSite: 'Strict' },
};

/**
 * Which of step 1's MUSTs a page response fails, each said as what an attacker could then do (6,
 * step 1; 10.6). The cookie must not be sent with a form from another site, and no other host on
 * the Company's domain may set it; the page must not be cached, framed, or kept as a window
 * reference by the page that opened it.
 * Left out: this recognises only the values the guides suggest (SameSite, the __Host- prefix,
 * no-store, frame-ancestors, COOP); a Company may meet the same MUSTs another way.
 */
export function pageRuleFailures(response: PageResponse): string[] {
  const { headers, cookie } = response, failures: string[] = [];
  if (cookie.sameSite === 'None') failures.push('a form submitted from another site would carry the join cookie');
  if (!(cookie.name.startsWith('__Host-') && cookie.secure && cookie.path === '/' && cookie.domain === undefined))
    failures.push('another host on the Company’s domain could set the join cookie');
  if (!/no-store/.test(headers['Cache-Control'] ?? '')) failures.push('a cache could keep the page and its code');
  if (!/frame-ancestors 'none'/.test(headers['Content-Security-Policy'] ?? '')) failures.push('another site could frame the page and watch or misuse it');
  if (headers['Cross-Origin-Opener-Policy'] !== 'same-origin') failures.push('the page that opened it could keep a window reference to it');
  return failures;
}

/** The Session a code is authorized for (6, step 2): the agent that signed, and, if signed in, the token's account and scopes. */
export type Grant = { sid: string; agent: string; account: string | null; scopes: readonly WebScope[] };
/**
 * The Company's record of one code. The Company knows the browser only by the cookie value it
 * paired the code with. Once submitted, `seated` says whether the matching join cookie came with
 * it, and `joined` whether every check passed and the Session's cookie was set (6, step 3).
 */
export type CodeRecord = { code: string; cookie: string; authorized: Grant | null; submitted: boolean; expired: boolean; seated: boolean; joined: boolean };
/** What the Company holds: the codes it issued, the Sessions it has started (5.3), and how many Session cookies it has set. */
export type Company = { codes: readonly CodeRecord[]; sessions: readonly string[]; cookiesSet: number };
/**
 * A browser, as the Company sees it: its join cookie (step 1), the Session's cookie (step 3), and
 * a login it had on the website without this protocol. It has no field for an access token: in
 * this model, as in section 6, there is no way for one to get there.
 */
export type Browser = { name: string; join: string | null; session: { value: string; grant: Grant } | null; login: string | null };

export const emptyCompany = (): Company => ({ codes: [], sessions: [], cookiesSet: 0 });
export const newBrowser = (name: string, login: string | null = null): Browser => ({ name, join: null, session: null, login });

/**
 * Step 1 (6): the browser loads the endpoint with a GET, as a top-level navigation. The Company
 * answers with a page whose form holds a fresh one-time code, and sets the join cookie that ties
 * that code to this browser. Loading MUST NOT start, end or change any Session, or change the
 * browser's other cookies: only the join cookie changes, and a second load replaces it.
 */
export function load(company: Company, browser: Browser): { company: Company; browser: Browser; code: string; response: PageResponse } {
  const i = company.codes.length, code = CODES[i] ?? `bc_${i}`, cookie = JOIN_VALUES[i] ?? `jn_${i}`;
  return {
    company: { ...company, codes: [...company.codes, { code, cookie, authorized: null, submitted: false, expired: false, seated: false, joined: false }] },
    browser: { ...browser, join: cookie },
    code,
    response: PAGE_RESPONSE,
  };
}

// ---------------------------------------------------------------------------------------------
// Step 2: the agent authorizes the code, in its own request.

/** An access token, as section 6 needs it: chapter 1's, plus the account it acts for and the browser scope. */
export type WebToken = { value: string; client: string; account: string; scopes: readonly WebScope[]; revoked?: boolean };
/** The same token as chapter 1's model types it, for chapter 1's Session checks; the scope check for poppy:browser-sign-in is done here. */
const asAccessToken = (t: WebToken): AccessToken => ({
  value: t.value, client: t.client, scopes: t.scopes.filter((s): s is Scope => s !== BROWSER_SIGN_IN), ...(t.revoked ? { revoked: true } : {}),
});

/** The authorize request: a JSON body with the code, the Session header, and an access token if signed in. */
export type AuthorizeRequest = { session?: SessionJwt; token?: WebToken; code: string };
/** What the Company answers to step 2. */
export type Answer = { status: number; error?: 'invalid_session' | 'invalid_token' | 'insufficient_scope' | 'invalid_request'; needs?: WebScope; reason?: string };

/** The request an agent sends in step 2: its Session header signed for the authorize URL, covering the token when it sends one (5.2). */
export function authorizeRequest(client: { clientId: string }, code: string, sub: string, sid: string, token?: WebToken): AuthorizeRequest {
  const base = { method: 'POST', url: AUTHORIZE_URL, ...(token ? { token: asAccessToken(token) } : {}) };
  return { session: sign(client, base, sub, sid), code, ...(token ? { token } : {}) };
}

/**
 * Step 2 (6), at the Company. The Session header is checked as at any resource (5.3, chapter 1's
 * rules), which starts the Session if its sid is new; then the token, which MUST have
 * poppy:browser-sign-in or the request gets 403 insufficient_scope (and the code is left as it
 * was, so the agent may authorize it again without a token); then the code, which must be one the
 * Company issued, unexpired, and not authorized before, else 400 invalid_request. On success the
 * code is recorded as authorized for that Session and, if signed in, for the token's account and
 * scopes, and the answer is 204.
 * Left out: the draft checks issued, unexpired and not-yet-authorized here, and says nothing of a
 * code already submitted; this model follows it literally (such a code still fails at step 3).
 */
export function authorize(company: Company, request: AuthorizeRequest): { company: Company; answer: Answer } {
  const { session, token, code } = request;
  const checked = verifySession({ method: 'POST', url: AUTHORIZE_URL, ...(session ? { session } : {}), ...(token ? { token: asAccessToken(token) } : {}) });
  if (checked.status !== 204) return { company, answer: checked as Answer };
  const sid = session!.sid, started = company.sessions.includes(sid) ? company : { ...company, sessions: [...company.sessions, sid] };
  if (token && !token.scopes.includes(BROWSER_SIGN_IN)) return { company: started, answer: { status: 403, error: 'insufficient_scope', needs: BROWSER_SIGN_IN } };
  const record = company.codes.find((r) => r.code === code);
  const invalid = (reason: string) => ({ company: started, answer: { status: 400, error: 'invalid_request' as const, reason } });
  if (!record) return invalid('the Company did not issue this code');
  if (record.expired) return invalid('the code has expired');
  if (record.authorized) return invalid('the code was authorized before');
  const grant: Grant = { sid, agent: session!.iss, account: token ? token.account : null, scopes: token ? token.scopes : [] };
  return { company: { ...started, codes: started.codes.map((r) => (r === record ? { ...r, authorized: grant } : r)) }, answer: { status: 204 } };
}

// ---------------------------------------------------------------------------------------------
// Step 3: the browser submits the code with the cookie.

/** What the Company answers to step 3: a redirect with the Session's cookie, or an error page naming every check that failed. */
export type SubmitAnswer = { status: 303; location: string } | { status: 400; failed: readonly string[] };

/**
 * Whether a form posted from a page on `site` is same-site with the Company's website, so that a
 * SameSite=Strict cookie goes with it. Hosts on the Company's own domain are the same site, which
 * is why the join cookie also needs the __Host- prefix (6, step 1).
 */
export const sameSite = (site: string) => site === COMPANY.domain || site.endsWith(`.${COMPANY.domain}`);

/**
 * A host on the Company's domain other than the website setting a join cookie in a browser. A
 * __Host- cookie can be set only by the host itself, without a Domain attribute, so with the
 * spec's cookie this is refused (6, step 1; 10.6).
 */
export function plantJoinCookie(browser: Browser, value: string, cookieName: string = JOIN_COOKIE): Browser | Refusal {
  if (cookieName.startsWith('__Host-')) return refuse(`${cookieName} can be set only by ${COMPANY.domain} itself, so another host cannot plant it`);
  return { ...browser, join: value };
}

/**
 * Step 3 (6), at the Company. The browser posts the code from a page on `from`; it sends its join
 * cookie only when the form is same-site (SameSite=Strict). The Company MUST check that the cookie
 * came and matches the code, and that the code was authorized, is unexpired and has not been
 * submitted before. A code is used by the first request that submits it, whatever the result. If
 * every check passes, it sets the Session's cookie, clears the join cookie and redirects; a join
 * with an access token signs the browser in to that account in place of any login it had, and a
 * join without one leaves that login as it was (the draft's SHOULD NOT end or change it, followed).
 * If not, it sets no cookie and returns an error page.
 * Left out: the draft says "redirects" and "an error status" without numbers; 303 and 400 are this model's.
 */
export function submit(company: Company, browser: Browser, code: string, from: string = COMPANY.domain): { company: Company; browser: Browser; answer: SubmitAnswer } {
  const sent = sameSite(from) ? browser.join : null, record = company.codes.find((r) => r.code === code), failed: string[] = [];
  if (!sent) failed.push(sameSite(from) ? 'the browser sent no join cookie' : `the form came from ${from}, so the browser sent no join cookie`);
  else if (!record || record.cookie !== sent) failed.push('the join cookie was set with another code');
  if (!record) failed.push('the Company did not issue this code');
  else {
    if (!record.authorized) failed.push('no agent authorized the code');
    if (record.expired) failed.push('the code has expired');
    if (record.submitted) failed.push('the code was submitted before');
  }
  const ok = !failed.length && !!record?.authorized, seated = !!sent && record?.cookie === sent;
  const spent = record ? { ...company, codes: company.codes.map((r) => (r === record ? { ...r, submitted: true, seated, joined: ok } : r)) } : company;
  if (!ok || !record?.authorized) return { company: spent, browser, answer: { status: 400, failed } };
  const grant = record.authorized, value = SESSION_VALUES[company.cookiesSet] ?? `sb_${company.cookiesSet}`;
  return {
    company: { ...spent, cookiesSet: company.cookiesSet + 1 },
    browser: { ...browser, join: null, session: { value, grant }, login: grant.account ? null : browser.login },
    answer: { status: 303, location: '/' },
  };
}

// ---------------------------------------------------------------------------------------------
// Step 4: the browser browses.

/** Who a browser's request acts as: the Session it belongs to, the account, and whether the Session's scopes or the browser's own login decided it. */
export type Visit = { session: string | null; account: string | null; scopes: readonly WebScope[] | null; via: 'session' | 'own login' | null };

/**
 * Step 4 (6): the browser sends the Session's cookie, and the Company handles its requests as the
 * Session. After a signed-in join, they act with the Session's account and scopes, whatever other
 * cookies the browser holds; after a join without a token, they belong to the Session and any
 * login the browser had still applies, without scopes, since it came from outside this protocol.
 */
export function browse(browser: Browser): Visit {
  const own = { account: browser.login, scopes: null, via: browser.login ? ('own login' as const) : null };
  if (!browser.session) return { session: null, ...own };
  const g = browser.session.grant;
  return g.account ? { session: g.sid, account: g.account, scopes: g.scopes, via: 'session' } : { session: g.sid, ...own };
}

/** When the Session's sign-in ends (6). */
export const SIGN_IN_ENDS = [
  'the Session ends',
  'the cookie expires',
  'the User signs out or disconnects the agent',
  'the browser signs out on the website',
  'the agent joins again without an access token',
] as const;

/** The Session's sign-in ends: the cookie MUST stop acting for the account (6, 5.5). A login the join replaced does not come back. */
export const endSignIn = (browser: Browser): Browser =>
  browser.session ? { ...browser, session: { ...browser.session, grant: { ...browser.session.grant, account: null, scopes: [] } } } : browser;

/** The User's agent's token: issued to the agent, for account A, with these scopes. */
export const userToken = (scopes: readonly WebScope[], account: string = ACCOUNT): WebToken => ({ value: 'at_Qp4w', client: AGENT.clientId, account, scopes });

/**
 * The spec's table (6): what a join does to a login the browser already had. The model runs the
 * four steps for real, with the agent's own browser, and then ends the Session's sign-in.
 * `tokenFor` is the account of the access token sent in step 2, or null for a join without one.
 */
export function joinEffect(before: string | null, tokenFor: string | null): { whileJoined: Visit; afterSignInEnds: Visit } {
  const loaded = load(emptyCompany(), newBrowser('agent’s browser', before));
  const token = tokenFor ? userToken(['orders:read', 'orders:write', BROWSER_SIGN_IN], tokenFor) : undefined;
  const authorized = authorize(loaded.company, authorizeRequest(AGENT, loaded.code, USER_IDS[COMPANY.domain], SID, token));
  const joined = submit(authorized.company, loaded.browser, loaded.code);
  return { whileJoined: browse(joined.browser), afterSignInEnds: browse(endSignIn(joined.browser)) };
}

// ---------------------------------------------------------------------------------------------
// The agent's rules.

/** Where a code reached the agent from. */
export type CodeSource = 'its own browser’s page' | 'a message' | 'a conversation' | 'another page';
/**
 * The agent MUST take the code only from the page its own browser loaded from the endpoint in step
 * 1, and MUST NOT authorize a code from anywhere else: such a code may come from someone else's
 * browser, which would then join the User's Session (6, step 2; 10.6). The Company cannot tell the
 * difference, so this rule is the agent's alone.
 */
export function agentTakesCode(source: CodeSource): true | Refusal {
  return source === 'its own browser’s page' ? true : refuse(`a code from ${source} may come from someone else’s browser, and the agent authorizes only a code its own browser loaded`);
}

/** The agent MUST join only a browser it controls, never the User's own, or the Company would treat the User's own visits as the agent's (6). */
export function agentMayJoin(browser: 'a browser the agent controls' | 'the User’s own browser'): true | Refusal {
  return browser === 'a browser the agent controls' ? true : refuse('the Company would treat the User’s own visits as the agent’s');
}

/** The parts of a poppy.json section 6 reads. */
export type WebDoc = { organization: { domain: string }; web?: { browser_session_endpoint?: string; disabled?: boolean; unscoped?: boolean }; agent?: unknown; apis?: unknown };

/**
 * How the agent may browse a Company's website (6). With web.disabled it SHOULD NOT use a browser,
 * and uses the Company Agent or APIs instead: a request the protocol cannot enforce, since a
 * Company cannot always tell an agent's browser from a person's. With browser_session_endpoint it
 * MUST join its browser to a Session first. Otherwise it browses as an ordinary signed-out visitor.
 */
export function browsingPlan(doc: WebDoc): 'use the Company Agent or APIs' | 'join the browser to a Session first' | 'browse as a signed-out visitor' {
  if (doc.web?.disabled) return 'use the Company Agent or APIs';
  if (doc.web?.browser_session_endpoint) return 'join the browser to a Session first';
  return 'browse as a signed-out visitor';
}

/**
 * What a Company's poppy.json must not say about its website (6): web.disabled with
 * browser_session_endpoint, web.disabled without agent or apis, and web.unscoped without
 * browser_session_endpoint.
 */
export function webProblems(doc: WebDoc): string[] {
  const web = doc.web ?? {}, problems: string[] = [];
  if (web.disabled && web.browser_session_endpoint) problems.push('web.disabled with browser_session_endpoint');
  if (web.disabled && doc.agent === undefined && doc.apis === undefined) problems.push('web.disabled without agent or apis');
  if (web.unscoped && !web.browser_session_endpoint) problems.push('web.unscoped without browser_session_endpoint');
  return problems;
}

/** An agent requests poppy:browser-sign-in only from a Company that lists browser_session_endpoint (6). */
export const mayRequestBrowserSignIn = (doc: WebDoc) => !!doc.web?.browser_session_endpoint;
/** A Company that lists browser_session_endpoint and offers sign-in MUST support poppy:browser-sign-in, though it MAY grant it to fewer clients or Users (6, 4.7). */
export const mustSupportBrowserSignIn = (doc: WebDoc, offersSignIn: boolean) => !!doc.web?.browser_session_endpoint && offersSignIn;

/** Whether the Company's website can apply its own scopes to a signed-in browser. */
export type Website = 'applies scopes' | 'cannot apply scopes';
/** The sign-in types that can grant a scope (4). */
export type SignInType = 'Direct' | 'Device' | 'Mediated';
/**
 * What poppy:browser-sign-in allows (6). A website that applies the cookie's scopes gets nothing
 * beyond the token's other scopes from it, and the Company MAY grant it without asking the User. A
 * website that cannot treats it as everything the account can do there: the Company MUST describe
 * it that way, MUST ask the User to approve it in Direct and Device Sign-In, decides itself in
 * Mediated Sign-In (no consent page), and MUST set web.unscoped in poppy.json.
 */
export function browserSignInMeans(website: Website, signIn: SignInType): { allows: string; approval: string; webUnscoped: boolean; description?: string } {
  if (website === 'applies scopes') return { allows: 'nothing beyond the token’s other scopes', approval: 'the Company may grant it without asking', webUnscoped: false };
  return {
    allows: 'everything the account can do on the website',
    approval: signIn === 'Mediated' ? 'the Company decides' : 'the User must approve it',
    webUnscoped: true,
    description: 'Browse the website, and see and do anything your account can do there',
  };
}

/** Domains with the same issuer give the scope one meaning (3.2, 6): if any of their websites is unscoped, each sets web.unscoped. */
export const issuerWebUnscoped = (websites: readonly Website[]) => websites.includes('cannot apply scopes');

/**
 * Whether a signed-in browser's action needing `needs` is allowed (6). A website that applies
 * scopes allows it only if the Session's scopes include it, and SHOULD show an error naming the
 * missing scope; one that cannot apply scopes allows anything the account can do.
 */
export function websiteAllows(visit: Visit, needs: Scope, website: Website): { allowed: true } | { allowed: false; shows: string } {
  if (visit.via !== 'session') return { allowed: false, shows: 'sign in' };
  if (website === 'cannot apply scopes' || visit.scopes!.includes(needs)) return { allowed: true };
  return { allowed: false, shows: `missing scope: ${needs}` };
}

// ---------------------------------------------------------------------------------------------
// A page fetched without a browser (5.2), for contrast.

/**
 * What the agent sends when it fetches a page of the website with its own HTTP client, rather than
 * a browser (5.2). It SHOULD send a Session header, only for an HTTPS URL whose host is exactly
 * organization.domain, signed for the URL without its query or fragment; it MUST NOT send an access
 * token, so the header has no ath and the request is signed out, even when a browser joined to the
 * Session is signed in. A browser, headless or not, sends no header: it joins as section 6 says.
 * A redirect is fetched by the same rule for its new URL. web.disabled does not cover these fetches.
 * Left out: "the documents above" that 5.2 also excludes are taken to be the /.well-known/
 * documents; an invalid_session answer, after which the agent MAY fetch again without the header.
 */
export function pageFetch(url: string, doc: WebDoc, client: 'its own HTTP client' | 'a browser', _browserSignedIn = false): { session: SessionJwt | null; token: null } {
  if (client === 'a browser') return { session: null, token: null };
  // Scheme, host (lower case, no port or user info here) and path, without the query or fragment.
  const m = /^([a-z]+):\/\/([^/?#:]+)([^?#]*)/i.exec(url);
  if (!m) return { session: null, token: null };
  const [, scheme, host, path] = m as unknown as [string, string, string, string], origin = `${scheme.toLowerCase()}://${host.toLowerCase()}`;
  if (scheme.toLowerCase() !== 'https' || host.toLowerCase() !== doc.organization.domain.toLowerCase() || path.startsWith('/.well-known/')) return { session: null, token: null };
  return { session: sign(AGENT, { method: 'GET', url: `${origin}${path || '/'}` }, USER_IDS[COMPANY.domain], SID), token: null };
}

// ---------------------------------------------------------------------------------------------
// The story, as a machine: the agent's browser joins, and an attacker tries both ways in.

/** How the User's agent stands with example.com: the scenario. */
export type SignIn = 'signed out' | 'signed in' | 'signed in without the browser scope';
export const SIGN_INS: readonly SignIn[] = ['signed out', 'signed in', 'signed in without the browser scope'];

/** The token the agent holds in each scenario, if any. */
export function tokenFor(signIn: SignIn): WebToken | null {
  if (signIn === 'signed out') return null;
  return userToken(signIn === 'signed in' ? ['orders:read', 'orders:write', BROWSER_SIGN_IN] : ['orders:read', 'orders:write']);
}

export type JoinEvent = 'fetch' | 'load' | 'authorize' | 'submit' | 'browse' | 'forge' | 'phish';
/** Every event, in the order the player shows its buttons. */
export const JOIN_EVENTS: readonly JoinEvent[] = ['fetch', 'load', 'authorize', 'submit', 'browse', 'forge', 'phish'];
/** The page the agent fetches without a browser, for contrast: a help article. */
export const HELP_URL = 'https://example.com/help/exchanges';

/**
 * The status of a page the website serves: the help page fetched without a browser, the
 * browser-session page (6, step 1, whose example response is 200 OK) and a page the joined browser
 * opens. The draft gives a status only for the browser-session page; the others are ordinary pages,
 * served whether signed in or not, and this model serves them all with 200.
 */
export const PAGE_STATUS = 200;

/** What the last event did: the middle of the picture. */
export type Last =
  | { event: 'fetch'; status: number; session: boolean; token: boolean }
  | { event: 'load'; status: number; code: string }
  | { event: 'authorize'; code: string; withToken: boolean; answer: Answer }
  | { event: 'submit'; code: string; answer: SubmitAnswer }
  | { event: 'browse'; status: number; visit: Visit }
  | { event: 'forge'; code: string; answer: SubmitAnswer }
  | { event: 'phish'; code: string; declined: string; answer: SubmitAnswer };

/**
 * The world of the story: the scenario, the Company, the agent's browser and the page it shows
 * (the code on the browser-session page, or null once the browser has moved on), the attacker's
 * browser, whether the agent has dropped its token after a 403 (6, step 2), and the last event.
 */
export type World = { signIn: SignIn; company: Company; browser: Browser; page: string | null; attacker: Browser; dropped: boolean; last: Last | null };

/** The attacker's two codes: the first it authorized in its own signed-in Session, the second it loaded last, so its browser holds that one's cookie. */
export const ATTACK_CODE = CODES[0];
export const PHISH_CODE = CODES[1];

/**
 * Before the story: the attacker's browser has loaded the browser-session page twice. It
 * authorized the first code in its own Session, signed in to account M, for the forged form; it
 * keeps the second, whose join cookie its browser holds, to send to the User's agent in a message.
 */
export function start(signIn: SignIn): World {
  const first = load(emptyCompany(), newBrowser('attacker’s browser'));
  const token: WebToken = { value: 'at_Mz7t', client: ATTACKER.client.clientId, account: ATTACKER.account, scopes: [BROWSER_SIGN_IN] };
  const authorized = authorize(first.company, authorizeRequest(ATTACKER.client, first.code, ATTACKER.sub, ATTACKER.sid, token));
  const second = load(authorized.company, first.browser);
  return { signIn, company: second.company, browser: newBrowser('agent’s browser'), page: null, attacker: second.browser, dropped: false, last: null };
}

/**
 * Where the story stops though the model would go on: the agent's browser loads the page at most
 * twice (once, and once more after a failed submission) and joins once, and the attacker strikes
 * only once the browser has joined (the model's attacks fail the same way before; the tests show it).
 */
export function bound(w: World, event: JoinEvent): string | undefined {
  if ((event === 'forge' || event === 'phish') && !w.browser.session) return 'in this story the attacker strikes once your agent’s browser has joined';
  if (event === 'load' && w.browser.session) return 'the story joins the browser once';
  if (event === 'load' && !w.page && w.company.codes.length >= 4) return 'the story loads the page twice at most';
  return undefined;
}

/**
 * Where the story ends: once both attacks have been tried, the player starts the reader again from
 * the start, so they can join the browser and play the attacker themselves.
 */
export function end(w: World): string | undefined {
  const used = (code: string) => w.company.codes.find((r) => r.code === code)!.submitted;
  return used(ATTACK_CODE) && used(PHISH_CODE) ? 'both of the attacker’s codes are spent' : undefined;
}

/**
 * The world after `event`, or the reason it cannot happen, written to follow the event's name. A
 * request the Company answers with an error still happens: the world records the answer.
 */
export function next(w: World, event: JoinEvent): World | Refusal {
  const record = (code: string) => w.company.codes.find((r) => r.code === code)!;
  switch (event) {
    case 'fetch': {
      // 5.2: a page fetched with the agent's own HTTP client carries the Session header and never a token.
      const sent = pageFetch(HELP_URL, POPPY_JSON, 'its own HTTP client', !!w.browser.session?.grant.account);
      return { ...w, last: { event: 'fetch', status: PAGE_STATUS, session: !!sent.session, token: sent.token !== null } };
    }
    case 'load': {
      // 6, step 2: the agent completes steps 2 and 3 right away, so it does not load a second code while one is open.
      if (w.page) return refuse(`the browser’s page already shows ${w.page.slice(0, 7)}, which the agent has not used yet`);
      const loaded = load(w.company, w.browser);
      return { ...w, company: loaded.company, browser: loaded.browser, page: loaded.code, last: { event: 'load', status: PAGE_STATUS, code: loaded.code } };
    }
    case 'authorize': {
      if (!w.page) return refuse('the browser has no browser-session page open, so there is no code to read');
      // The draft's step 2 records a code as authorized once; this agent does not send it twice.
      if (record(w.page).authorized) return refuse(`the agent has authorized ${w.page.slice(0, 7)} already, and a code is authorized once`);
      const token = w.dropped ? null : tokenFor(w.signIn);
      const sent = authorize(w.company, authorizeRequest(AGENT, w.page, USER_IDS[COMPANY.domain], SID, token ?? undefined));
      return {
        ...w, company: sent.company,
        // 6, step 2: after insufficient_scope, the agent authorizes the same code again without an access token.
        dropped: w.dropped || sent.answer.error === 'insufficient_scope',
        last: { event: 'authorize', code: w.page, withToken: !!token, answer: sent.answer },
      };
    }
    case 'submit': {
      if (!w.page) return refuse('the browser has no browser-session form to submit, so it loads the page first');
      const sent = submit(w.company, w.browser, w.page);
      // Either way the browser leaves the form: redirected into the website, or shown an error page.
      return { ...w, company: sent.company, browser: sent.browser, page: null, last: { event: 'submit', code: w.page, answer: sent.answer } };
    }
    case 'browse':
      // 6: a Company that lists browser_session_endpoint is browsed only by a joined browser.
      if (!w.browser.session) return refuse(`${COMPANY.domain} lists a browser-session endpoint, so the agent joins its browser to the Session before browsing`);
      return { ...w, last: { event: 'browse', status: PAGE_STATUS, visit: browse(w.browser) } };
    case 'forge': {
      // 10.6: a page on evil.example posts the attacker's authorized code from the agent's browser.
      if (record(ATTACK_CODE).submitted) return refuse('the attacker’s code was used by the first form that submitted it, and a code works once');
      const sent = submit(w.company, w.browser, ATTACK_CODE, ATTACKER.site);
      return { ...w, company: sent.company, browser: sent.browser, last: { event: 'forge', code: ATTACK_CODE, answer: sent.answer } };
    }
    case 'phish': {
      // 10.6: a message hands the agent the code from the attacker's browser. The agent authorizes it
      // only if its rule lets it (it does not); then the attacker's browser submits the code with its cookie.
      if (record(PHISH_CODE).submitted) return refuse('the attacker’s browser has used its code already, and a code works once');
      const takes = agentTakesCode('a message'), token = w.dropped ? null : tokenFor(w.signIn);
      const company = isRefusal(takes) ? w.company : authorize(w.company, authorizeRequest(AGENT, PHISH_CODE, USER_IDS[COMPANY.domain], SID, token ?? undefined)).company;
      const sent = submit(company, w.attacker, PHISH_CODE);
      return {
        ...w, company: sent.company, attacker: sent.browser,
        last: { event: 'phish', code: PHISH_CODE, declined: isRefusal(takes) ? takes.reason ?? '' : '', answer: sent.answer },
      };
    }
  }
}

/** The events of the story, in order: what the steps replay. */
export const STORY: readonly JoinEvent[] = ['fetch', 'load', 'authorize', 'submit', 'browse', 'forge', 'phish'];
/** The story with the 403 of the scenario without the browser scope: the agent authorizes twice. */
export const storyOf = (signIn: SignIn): readonly JoinEvent[] =>
  signIn === 'signed in without the browser scope' ? ['fetch', 'load', 'authorize', 'authorize', 'submit', 'browse', 'forge', 'phish'] : STORY;
