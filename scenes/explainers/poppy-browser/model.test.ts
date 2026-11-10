import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal } from '../../../explain/index.ts';
import { AGENT, COMPANY, OPERATIONS, POPPY_JSON, SID, THIEF, USER_IDS } from '../poppy/model.ts';
import {
  ACCOUNT, ATTACK_CODE, PAGE_STATUS, ATTACKER, AUTHORIZE_URL, BROWSER_SIGN_IN, CODES, ENDPOINT, JOIN_EVENTS, PAGE_RESPONSE, PHISH_CODE, SIGN_INS, SIGN_IN_ENDS, STORY,
  agentMayJoin, agentTakesCode, authorize, authorizeRequest, bound, end, browse, browserSignInMeans, browsingPlan, emptyCompany, endSignIn,
  issuerWebUnscoped, joinEffect, load, mayRequestBrowserSignIn, mustSupportBrowserSignIn, newBrowser, next, pageFetch, pageRuleFailures,
  plantJoinCookie, start, storyOf, submit, tokenFor, userToken, webProblems, websiteAllows,
  type Browser, type JoinEvent, type SignIn, type World,
} from './model.ts';

// Each test names the section of the Personal Agent Protocol draft 0.4 it holds the model to
// (https://personalagentprotocol.org/docs/0.4/spec). The specification was read, not run: there is
// no reference implementation here, so these pin the model to the draft's rules and examples.

const SIGNED_IN = userToken(['orders:read', 'orders:write', BROWSER_SIGN_IN]);
const sub = USER_IDS[COMPANY.domain];
/** The four steps, run by the User's agent with its own browser. */
function join(token?: ReturnType<typeof userToken>, browser: Browser = newBrowser('agent’s browser')) {
  const loaded = load(emptyCompany(), browser);
  const authorized = authorize(loaded.company, authorizeRequest(AGENT, loaded.code, sub, SID, token));
  return { loaded, authorized, ...submit(authorized.company, loaded.browser, loaded.code) };
}
/** The world after these events, from the start of a scenario. */
const play = (signIn: SignIn, events: readonly JoinEvent[]) =>
  events.reduce<World>((w, e) => {
    const after = next(w, e);
    assert.ok(!isRefusal(after), `${e} was refused: ${isRefusal(after) ? after.reason : ''}`);
    return after as World;
  }, start(signIn));
const reasonOf = (w: World, e: JoinEvent) => { const n = next(w, e); return isRefusal(n) ? n.reason : null; };

test('6, step 1: the browser-session page is served with 200, as the spec’s example response is', () => {
  assert.equal(PAGE_STATUS, 200);
  const w = play('signed in', ['load']);
  assert.equal(w.last?.event === 'load' && w.last.status, 200);
});

test('section 6: the endpoint comes from poppy.json, and the authorize URL is the endpoint with /authorize', () => {
  assert.equal(ENDPOINT, 'https://example.com/poppy/browser-session');
  assert.equal(AUTHORIZE_URL, 'https://example.com/poppy/browser-session/authorize');
  assert.equal(AUTHORIZE_URL, OPERATIONS.browse.url, 'chapter 1’s browse request is this step 2');
});

test('6, step 1: the spec’s example response meets every rule for the page and its cookie, and each missing value opens a hole', () => {
  assert.deepEqual(pageRuleFailures(PAGE_RESPONSE), []);
  const cookie = PAGE_RESPONSE.cookie, headers = PAGE_RESPONSE.headers;
  assert.deepEqual(pageRuleFailures({ headers, cookie: { ...cookie, sameSite: 'None' } }), ['a form submitted from another site would carry the join cookie']);
  assert.deepEqual(pageRuleFailures({ headers, cookie: { ...cookie, name: 'poppy_join', domain: 'example.com' } }), ['another host on the Company’s domain could set the join cookie']);
  assert.deepEqual(pageRuleFailures({ headers: { ...headers, 'Content-Security-Policy': '' }, cookie }), ['another site could frame the page and watch or misuse it']);
  assert.deepEqual(pageRuleFailures({ headers: { ...headers, 'Cache-Control': 'private' }, cookie }), ['a cache could keep the page and its code']);
  assert.deepEqual(pageRuleFailures({ headers: { ...headers, 'Cross-Origin-Opener-Policy': 'unsafe-none' }, cookie }), ['the page that opened it could keep a window reference to it']);
  assert.equal(cookie.maxAge, 60);
  assert.equal(cookie.httpOnly, true);
});

test('6, step 1: loading the page gives a fresh code and sets only the join cookie; it starts, ends and changes no Session', () => {
  const joined = join(SIGNED_IN);
  const again = load(joined.company, joined.browser);
  assert.notEqual(again.code, joined.loaded.code);
  assert.deepEqual(again.company.sessions, joined.company.sessions);
  assert.deepEqual({ ...again.browser, join: null }, { ...joined.browser, join: null });
  assert.equal(again.company.codes.at(-1)!.authorized, null);
  assert.equal(new Set(CODES).size, CODES.length, 'every code differs');
  assert.equal(load(emptyCompany(), newBrowser('b')).code, 'bc_K9wdP4sNe7Lq2Xa8TfUj3B');
});

test('6, step 2: the Company checks the Session header (5.3), the scope, then the code; it answers 204 and records the Session', () => {
  const loaded = load(emptyCompany(), newBrowser('agent’s browser'));
  const ok = authorize(loaded.company, authorizeRequest(AGENT, loaded.code, sub, SID, SIGNED_IN));
  assert.deepEqual(ok.answer, { status: 204 });
  assert.deepEqual(ok.company.codes[0]!.authorized, { sid: SID, agent: AGENT.clientId, account: ACCOUNT, scopes: SIGNED_IN.scopes });
  assert.deepEqual(ok.company.sessions, [SID], 'the authorize request starts the Session if its sid is new');
  const out = authorize(loaded.company, authorizeRequest(AGENT, loaded.code, sub, SID));
  assert.deepEqual(out.company.codes[0]!.authorized, { sid: SID, agent: AGENT.clientId, account: null, scopes: [] }, 'a join without a token names the Session only');
  // The code fails: twice, unknown, expired.
  assert.deepEqual(authorize(ok.company, authorizeRequest(AGENT, loaded.code, sub, SID)).answer, { status: 400, error: 'invalid_request', reason: 'the code was authorized before' });
  assert.deepEqual(authorize(loaded.company, authorizeRequest(AGENT, 'bc_guess', sub, SID)).answer, { status: 400, error: 'invalid_request', reason: 'the Company did not issue this code' });
  const stale = { ...loaded.company, codes: loaded.company.codes.map((r) => ({ ...r, expired: true })) };
  assert.deepEqual(authorize(stale, authorizeRequest(AGENT, loaded.code, sub, SID)).answer, { status: 400, error: 'invalid_request', reason: 'the code has expired' });
  // The Session header fails as at any resource: missing, or a token under another agent's header.
  assert.equal(authorize(loaded.company, { code: loaded.code }).answer.error, 'invalid_session');
  const stolen = authorizeRequest(THIEF, loaded.code, 'usr_thief', 'sid_thief', SIGNED_IN);
  assert.deepEqual(authorize(loaded.company, stolen).answer, { status: 400, error: 'invalid_session', reason: 'the access token was issued to another agent' });
});

test('6, step 2: a token without poppy:browser-sign-in gets 403 insufficient_scope, and the same code can then be authorized without a token', () => {
  const loaded = load(emptyCompany(), newBrowser('agent’s browser'));
  const lacking = authorize(loaded.company, authorizeRequest(AGENT, loaded.code, sub, SID, userToken(['orders:read', 'orders:write'])));
  assert.deepEqual(lacking.answer, { status: 403, error: 'insufficient_scope', needs: BROWSER_SIGN_IN });
  assert.equal(lacking.company.codes[0]!.authorized, null, 'the code is left as it was');
  assert.deepEqual(authorize(lacking.company, authorizeRequest(AGENT, loaded.code, sub, SID)).answer, { status: 204 });
});

test('6, step 3: the browser that loaded the page, with its cookie, joins the Session; the join cookie is cleared', () => {
  const joined = join(SIGNED_IN);
  assert.deepEqual(joined.answer, { status: 303, location: '/' });
  assert.equal(joined.browser.join, null);
  assert.deepEqual(joined.company.codes[0]!, { ...joined.company.codes[0]!, submitted: true, seated: true, joined: true });
  assert.deepEqual(joined.browser.session, { value: 'Pz81kQ', grant: { sid: SID, agent: AGENT.clientId, account: ACCOUNT, scopes: SIGNED_IN.scopes } });
});

test('6, step 3: every check is named when it fails, and a code is used by the first request that submits it, whatever the result', () => {
  const loaded = load(emptyCompany(), newBrowser('agent’s browser'));
  const early = submit(loaded.company, loaded.browser, loaded.code);
  assert.deepEqual(early.answer, { status: 400, failed: ['no agent authorized the code'] });
  assert.deepEqual([early.company.codes[0]!.seated, early.company.codes[0]!.joined], [true, false], 'the cookie came and fitted; the stamp was missing');
  assert.equal(early.browser.session, null, 'no cookie is set');
  const late = authorize(early.company, authorizeRequest(AGENT, loaded.code, sub, SID));
  assert.deepEqual(late.answer, { status: 204 }, 'the draft’s step 2 does not check for a code already submitted');
  assert.deepEqual(submit(late.company, loaded.browser, loaded.code).answer, { status: 400, failed: ['the code was submitted before'] });
  assert.deepEqual(submit(loaded.company, newBrowser('x'), 'bc_guess').answer, { status: 400, failed: ['the browser sent no join cookie', 'the Company did not issue this code'] });
});

test('6, step 3: an authorized code submitted from a browser without its cookie fails: another browser, or this one with a newer cookie', () => {
  const loaded = load(emptyCompany(), newBrowser('agent’s browser'));
  const authorized = authorize(loaded.company, authorizeRequest(AGENT, loaded.code, sub, SID, SIGNED_IN));
  assert.deepEqual(submit(authorized.company, newBrowser('someone else’s browser'), loaded.code).answer, { status: 400, failed: ['the browser sent no join cookie'] });
  const reloaded = load(authorized.company, loaded.browser);
  assert.deepEqual(submit(reloaded.company, reloaded.browser, loaded.code).answer, { status: 400, failed: ['the join cookie was set with another code'] });
});

test('10.6: an attacker’s authorized code posted from another site fails for want of the cookie, and a host on the domain cannot plant one', () => {
  const w = start('signed in');
  const forged = submit(w.company, newBrowser('victim'), ATTACK_CODE, ATTACKER.site);
  assert.deepEqual(forged.answer, { status: 400, failed: ['the form came from evil.example, so the browser sent no join cookie'] });
  assert.deepEqual(forged.company.codes.find((r) => r.code === ATTACK_CODE)!, { ...forged.company.codes[0]!, submitted: true, seated: false, joined: false });
  // Even a browser holding a join cookie sends none with a cross-site form (SameSite=Strict).
  const holding = load(w.company, newBrowser('victim'));
  assert.equal(submit(holding.company, holding.browser, ATTACK_CODE, ATTACKER.site).answer.status, 400);
  // A host on the Company's domain is the same site, so the __Host- prefix is what stops it planting the attacker's cookie.
  const attackCookie = w.company.codes.find((r) => r.code === ATTACK_CODE)!.cookie;
  assert.ok(isRefusal(plantJoinCookie(newBrowser('victim'), attackCookie)));
  const planted = plantJoinCookie(newBrowser('victim'), attackCookie, 'poppy_join') as Browser;
  const hijacked = submit(w.company, planted, ATTACK_CODE, `uploads.${COMPANY.domain}`);
  assert.equal(hijacked.answer.status, 303, 'without the prefix, the attack works');
  assert.deepEqual(browse(hijacked.browser), { session: ATTACKER.sid, account: ATTACKER.account, scopes: [BROWSER_SIGN_IN], via: 'session' });
});

test('6, step 2 and 10.6: the agent authorizes only a code its own browser loaded; the Company could not tell, so that rule is all that stops it', () => {
  assert.equal(agentTakesCode('its own browser’s page'), true);
  for (const source of ['a message', 'a conversation', 'another page'] as const) {
    const r = agentTakesCode(source);
    assert.ok(isRefusal(r) && r.reason === `a code from ${source} may come from someone else’s browser, and the agent authorizes only a code its own browser loaded`);
  }
  // What a careless agent would cause: the attacker's browser joins the User's Session, signed in to the User's account.
  const w = start('signed in');
  const careless = authorize(w.company, authorizeRequest(AGENT, PHISH_CODE, sub, SID, SIGNED_IN));
  assert.deepEqual(careless.answer, { status: 204 });
  const joined = submit(careless.company, w.attacker, PHISH_CODE);
  assert.equal(joined.answer.status, 303);
  assert.deepEqual(browse(joined.browser), { session: SID, account: ACCOUNT, scopes: SIGNED_IN.scopes, via: 'session' });
});

test('6: the agent joins only a browser it controls, never the User’s own', () => {
  assert.equal(agentMayJoin('a browser the agent controls'), true);
  const r = agentMayJoin('the User’s own browser');
  assert.ok(isRefusal(r) && r.reason === 'the Company would treat the User’s own visits as the agent’s');
});

test('6: the access token never passes through the browser: no request the browser sends and no state it reaches holds it', () => {
  for (const signIn of SIGN_INS)
    for (const w of reachable(signIn)) {
      for (const b of [w.browser, w.attacker]) {
        const seen = JSON.stringify(b);
        assert.ok(!seen.includes('at_Qp4w') && !seen.includes('at_Mz7t'), seen);
      }
    }
  // The browser's step 3 request is its cookie and the code; step 2's is the agent's, with the token.
  const loaded = load(emptyCompany(), newBrowser('agent’s browser'));
  assert.deepEqual(Object.keys(authorizeRequest(AGENT, loaded.code, sub, SID, SIGNED_IN)).sort(), ['code', 'session', 'token']);
});

test('6: the table of what a join does to a login the browser already had', () => {
  const visit = (session: string | null, account: string | null, via: 'session' | 'own login' | null, scopes: readonly string[] | null = null) => ({ session, account, scopes, via });
  // Not logged in, join without a token: not logged in, requests belong to the Session; then not logged in.
  assert.deepEqual(joinEffect(null, null), { whileJoined: visit(SID, null, null), afterSignInEnds: visit(SID, null, null) });
  // Not logged in, join with a token for A: signed in to A with the token's scopes; then signed out.
  assert.deepEqual(joinEffect(null, 'A'), { whileJoined: visit(SID, 'A', 'session', SIGNED_IN.scopes), afterSignInEnds: visit(SID, null, null) });
  // Logged in as A, join without a token: still logged in as A through its own login; then logged in as A.
  assert.deepEqual(joinEffect('A', null), { whileJoined: visit(SID, 'A', 'own login'), afterSignInEnds: visit(SID, 'A', 'own login') });
  // Logged in as A or B, join with a token for A: signed in to A with the token's scopes; then signed out, the earlier login gone.
  for (const before of ['A', 'B'])
    assert.deepEqual(joinEffect(before, 'A'), { whileJoined: visit(SID, 'A', 'session', SIGNED_IN.scopes), afterSignInEnds: visit(SID, null, null) });
  assert.equal(SIGN_IN_ENDS.length, 5);
  assert.deepEqual(browse(endSignIn(newBrowser('b'))), visit(null, null, null), 'ending sign-in on a browser with no Session changes nothing');
});

test('6: poppy:browser-sign-in allows nothing beyond the other scopes where the website applies them, and full access, approved and flagged, where it cannot', () => {
  for (const flow of ['Direct', 'Device', 'Mediated'] as const)
    assert.deepEqual(browserSignInMeans('applies scopes', flow), { allows: 'nothing beyond the token’s other scopes', approval: 'the Company may grant it without asking', webUnscoped: false });
  assert.equal(browserSignInMeans('cannot apply scopes', 'Direct').approval, 'the User must approve it');
  assert.equal(browserSignInMeans('cannot apply scopes', 'Device').approval, 'the User must approve it');
  assert.equal(browserSignInMeans('cannot apply scopes', 'Mediated').approval, 'the Company decides');
  assert.equal(browserSignInMeans('cannot apply scopes', 'Direct').webUnscoped, true);
  assert.equal(browserSignInMeans('cannot apply scopes', 'Direct').description, 'Browse the website, and see and do anything your account can do there');
  assert.equal(issuerWebUnscoped(['applies scopes', 'cannot apply scopes']), true, 'one unscoped website under an issuer makes every one set web.unscoped');
  assert.equal(issuerWebUnscoped(['applies scopes', 'applies scopes']), false);
  // A scoped website applies the cookie's scopes and names a missing one.
  const readOnly = join(userToken(['orders:read', BROWSER_SIGN_IN])).browser;
  assert.deepEqual(websiteAllows(browse(readOnly), 'orders:write', 'applies scopes'), { allowed: false, shows: 'missing scope: orders:write' });
  assert.deepEqual(websiteAllows(browse(readOnly), 'orders:write', 'cannot apply scopes'), { allowed: true });
  assert.deepEqual(websiteAllows(browse(readOnly), 'orders:read', 'applies scopes'), { allowed: true });
});

test('6: poppy.json’s web fields: endpoint, disabled and unscoped, and what each obliges', () => {
  const doc = POPPY_JSON;
  assert.equal(browsingPlan(doc), 'join the browser to a Session first');
  assert.equal(browsingPlan({ organization: doc.organization }), 'browse as a signed-out visitor');
  assert.equal(browsingPlan({ organization: doc.organization, web: { disabled: true }, apis: doc.apis }), 'use the Company Agent or APIs');
  assert.deepEqual(webProblems(doc), []);
  assert.deepEqual(webProblems({ organization: doc.organization, web: { disabled: true, browser_session_endpoint: ENDPOINT } }), ['web.disabled with browser_session_endpoint', 'web.disabled without agent or apis']);
  assert.deepEqual(webProblems({ organization: doc.organization, web: { unscoped: true } }), ['web.unscoped without browser_session_endpoint']);
  assert.equal(mayRequestBrowserSignIn(doc), true);
  assert.equal(mayRequestBrowserSignIn({ organization: doc.organization }), false);
  assert.equal(mustSupportBrowserSignIn(doc, true), true);
  assert.equal(mustSupportBrowserSignIn(doc, false), false);
});

test('5.2: a page fetched with the agent’s own client carries the Session header, signed out, only on the Company’s exact host', () => {
  for (const signedIn of [false, true]) {
    const sent = pageFetch('https://example.com/help/exchanges?lang=en#size', POPPY_JSON, 'its own HTTP client', signedIn);
    assert.equal(sent.token, null);
    assert.deepEqual(sent.session, { iss: AGENT.clientId, aud: COMPANY.issuer, sid: SID, sub, htm: 'GET', htu: 'https://example.com/help/exchanges', key: AGENT.clientId });
    assert.equal('ath' in sent.session!, false, 'no ath: the request is signed out');
  }
  for (const url of ['https://help.example.com/exchanges', 'http://example.com/help', 'https://example.com/.well-known/poppy.json'])
    assert.equal(pageFetch(url, POPPY_JSON, 'its own HTTP client').session, null, url);
  assert.equal(pageFetch('https://example.com/help', POPPY_JSON, 'a browser').session, null, 'a headless browser is a browser, and joins instead');
  // web.disabled does not cover these fetches.
  assert.ok(pageFetch('https://example.com/help', { ...POPPY_JSON, web: { disabled: true } }, 'its own HTTP client').session);
});

test('the story: the agent’s browser joins, browses, and both attacks fail, in each scenario', () => {
  const after = (signIn: SignIn, k: number) => play(signIn, storyOf(signIn).slice(0, k));
  // Signed in with the scope: the browser browses signed in to A.
  assert.deepEqual(after('signed in', 1).last, { event: 'fetch', status: 200, session: true, token: false });
  assert.deepEqual(after('signed in', 2).last, { event: 'load', status: 200, code: 'bc_Vn3qT8xLw2Rk9mZ4yHc1Ad' });
  assert.deepEqual(after('signed in', 3).last, { event: 'authorize', code: 'bc_Vn3qT8xLw2Rk9mZ4yHc1Ad', withToken: true, answer: { status: 204 } });
  assert.deepEqual(after('signed in', 4).last, { event: 'submit', code: 'bc_Vn3qT8xLw2Rk9mZ4yHc1Ad', answer: { status: 303, location: '/' } });
  assert.deepEqual(after('signed in', 5).last, { event: 'browse', status: 200, visit: { session: SID, account: ACCOUNT, scopes: SIGNED_IN.scopes, via: 'session' } });
  assert.deepEqual(after('signed in', 6).last, { event: 'forge', code: ATTACK_CODE, answer: { status: 400, failed: ['the form came from evil.example, so the browser sent no join cookie'] } });
  const last = after('signed in', 7).last;
  assert.deepEqual(last, {
    event: 'phish', code: PHISH_CODE,
    declined: 'a code from a message may come from someone else’s browser, and the agent authorizes only a code its own browser loaded',
    answer: { status: 400, failed: ['no agent authorized the code'] },
  });
  // Signed out: the browser joins the Session signed out.
  assert.deepEqual(after('signed out', 3).last, { event: 'authorize', code: CODES[2], withToken: false, answer: { status: 204 } });
  assert.deepEqual(after('signed out', 5).last, { event: 'browse', status: 200, visit: { session: SID, account: null, scopes: null, via: null } });
  // Without the browser scope: 403, then the same code without a token, and the browser joins signed out.
  const lacking = 'signed in without the browser scope';
  assert.deepEqual(after(lacking, 3).last, { event: 'authorize', code: CODES[2], withToken: true, answer: { status: 403, error: 'insufficient_scope', needs: BROWSER_SIGN_IN } });
  assert.deepEqual(after(lacking, 4).last, { event: 'authorize', code: CODES[2], withToken: false, answer: { status: 204 } });
  assert.deepEqual(after(lacking, 6).last, { event: 'browse', status: 200, visit: { session: SID, account: null, scopes: null, via: null } });
  assert.deepEqual(storyOf('signed in'), STORY);
  // The attacks leave the User's Session and the agent's browser as they were.
  const joined = after('signed in', 5), attacked = after('signed in', 7);
  assert.deepEqual(attacked.browser, joined.browser);
  assert.equal(attacked.attacker.session, null);
});

test('every refusal says why, and each event is refused or taken as the state decides', () => {
  const w = start('signed in');
  assert.deepEqual(JOIN_EVENTS.map((e) => reasonOf(w, e)), [
    null, null,
    'the browser has no browser-session page open, so there is no code to read',
    'the browser has no browser-session form to submit, so it loads the page first',
    'example.com lists a browser-session endpoint, so the agent joins its browser to the Session before browsing',
    null, null,
  ]);
  const loaded = play('signed in', ['load']);
  assert.equal(reasonOf(loaded, 'load'), 'the browser’s page already shows bc_Vn3q, which the agent has not used yet');
  assert.equal(reasonOf(play('signed in', ['load', 'authorize']), 'authorize'), 'the agent has authorized bc_Vn3q already, and a code is authorized once');
  assert.equal(reasonOf(play('signed in', ['forge']), 'forge'), 'the attacker’s code was used by the first form that submitted it, and a code works once');
  assert.equal(reasonOf(play('signed in', ['phish']), 'phish'), 'the attacker’s browser has used its code already, and a code works once');
  // Submitting before authorizing is answered, not refused: an error page, and the code is spent.
  const spent = play('signed in', ['load', 'submit']);
  assert.deepEqual(spent.last, { event: 'submit', code: CODES[2], answer: { status: 400, failed: ['no agent authorized the code'] } });
  assert.equal(reasonOf(spent, 'load'), null, 'after an error, the agent starts again at step 1');
  assert.equal(bound(play('signed in', ['load', 'submit', 'load', 'submit']), 'load'), 'the story loads the page twice at most');
  assert.equal(bound(play('signed in', ['load', 'authorize', 'submit']), 'load'), 'the story joins the browser once');
  assert.equal(bound(start('signed in'), 'forge'), 'in this story the attacker strikes once your agent’s browser has joined');
  assert.equal(end(play('signed in', STORY)), 'both of the attacker’s codes are spent');
  assert.equal(end(play('signed in', STORY.slice(0, 6))), undefined);
});

/** Every state the events reach from a scenario's start, within the story's bounds. */
function reachable(signIn: SignIn): World[] {
  const seen = new Map<string, World>([[JSON.stringify(start(signIn)), start(signIn)]]);
  for (const queue = [start(signIn)]; queue.length; ) {
    const w = queue.shift()!;
    for (const e of JOIN_EVENTS) {
      if (bound(w, e)) continue;
      const n = next(w, e);
      if (!isRefusal(n) && !seen.has(JSON.stringify(n))) { seen.set(JSON.stringify(n), n); queue.push(n); }
    }
  }
  return [...seen.values()];
}

test('10.6: in no reachable state does a wrong browser join: the attacker’s browser never gets the User’s Session, the agent’s never the attacker’s', () => {
  for (const signIn of SIGN_INS) {
    const states = reachable(signIn);
    assert.ok(states.length < 80, `${signIn}: ${states.length} states`);
    for (const w of states) {
      assert.equal(w.attacker.session, null);
      assert.ok(w.browser.session === null || w.browser.session.grant.sid === SID, JSON.stringify(w.browser));
      // A signed-in Session cookie exists only where the agent held the browser scope.
      if (w.browser.session?.grant.account) assert.equal(signIn, 'signed in');
      // Every state the story has not ended leaves an event to press; an ended one sends the reader back to the start.
      assert.ok(end(w) !== undefined || JOIN_EVENTS.some((e) => !bound(w, e) && !isRefusal(next(w, e))), JSON.stringify(w.last));
    }
    assert.ok(states.some((w) => end(w) !== undefined), 'the story can end');
  }
  assert.equal(tokenFor('signed out'), null);
});
