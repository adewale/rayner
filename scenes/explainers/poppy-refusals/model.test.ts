import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal } from '../../../explain/index.ts';
import { AGENT, OPERATIONS, SID, USER_IDS, COMPANY } from '../poppy/model.ts';
import {
  APIS, EXAMPLE_COMPANY, FIXES, MCP_METADATA, MCP_URL, REFUSAL_EVENTS, RETRY_AFTER, STORY, TROUBLES,
  agentAfter, carriedIn, choose, compatible, healthy, libraryKeepsToken, next, pending, pursue, remedy, respond, start, troubled,
  type Fix, type Holding, type Reply, type RefusalEvent, type Trouble, type World,
} from './model.ts';

// Each test names the section of the Personal Agent Protocol draft 0.4 it holds the model to
// (https://personalagentprotocol.org/docs/0.4/spec). The draft was read, not run: there is no
// reference implementation here, so these pin the model to the draft's rules, its error table
// (section 7) and its examples.

const RW = ['orders:read', 'orders:write'] as const, RO = ['orders:read'] as const;
const holding = (over: Partial<Holding> = {}): Holding => ({
  token: healthy().request.token, refresh: RW, signedOut: false, resent: false, version: '0.4',
  implements: ['0.3', '0.4'], extensions: [], offered: {}, ...over,
});
const replyTo = (trouble: Trouble) => { const t = troubled(trouble); return respond(t.request, t.company); };
const play = (events: readonly RefusalEvent[], from: World = start()) => events.reduce<World>((w, e) => {
  const after = next(w, e);
  assert.ok(!isRefusal(after), `${e} was refused: ${isRefusal(after) ? after.reason : ''}`);
  return after as World;
}, from);
const reasonOf = (w: World, e: RefusalEvent) => { const n = next(w, e); return isRefusal(n) ? n.reason : null; };

test('section 7: Poppy lists two API types, OpenAPI and MCP, and the example Company lists one of each', () => {
  assert.deepEqual(APIS.map((a) => a.type), ['openapi', 'mcp']);
  assert.equal(APIS[1]!.url, 'https://mcp.example.com/mcp');
});

test('section 7: both API types take the Session header and access tokens, and answer a healthy request', () => {
  const api = healthy('exchange'), mcp = healthy('sizes', { mcpKey: true });
  assert.deepEqual(respond(api.request, api.company), { status: 200 });
  assert.deepEqual(respond(mcp.request, mcp.company), { status: 200 });
  for (const { request } of [api, mcp]) {
    assert.equal(request.session!.iss, AGENT.clientId);
    assert.equal(request.session!.sub, USER_IDS[COMPANY.domain]);
    assert.ok(request.token);
  }
});

test('section 7: each trouble gets the status and error code of the error table', () => {
  const got = Object.fromEntries(TROUBLES.map((t) => [t, replyTo(t)]));
  assert.deepEqual(got, {
    expire: { status: 401, error: 'invalid_token' },
    'read-only': { status: 403, error: 'insufficient_scope', needs: 'orders:write' },
    delegation: { status: 400, error: 'invalid_session', reason: 'the header’s delegation has expired' },
    end: { status: 400, error: 'session_ended' },
    'old-copy': { status: 400, error: 'version_unsupported' },
    'too-fast': { status: 429, retryAfter: RETRY_AFTER },
    mcp: { status: 401, error: 'invalid_token', resourceMetadata: MCP_METADATA },
  } satisfies Record<Trouble, Reply>);
});

test('section 7: with no access token, an account request gets 401 with no error code, naming the scope', () => {
  const { request, company } = healthy('exchange', { token: false });
  assert.deepEqual(respond(request, company), { status: 401, needs: 'orders:write' });
});

test('3.3: a request the Company handles only with an extension it does not declare gets 403 extension_required, naming it', () => {
  const company = { ...EXAMPLE_COMPANY, requires: { exchange: { name: 'example.com/gift-wrap', versions: ['2', '1'] } } };
  const plain = healthy('exchange');
  assert.deepEqual(respond(plain.request, company), { status: 403, error: 'extension_required', extension: 'example.com/gift-wrap' });
  const declared = { ...plain.request, extensions: [{ name: 'example.com/gift-wrap', v: '2' }] };
  assert.deepEqual(respond(declared, company), { status: 200 });
  const unlisted = { ...plain.request, extensions: [{ name: 'example.com/gift-wrap', v: '3' }] };
  assert.equal(respond(unlisted, company).error, 'extension_required', 'a version the Company does not list declares nothing it can use');
});

test('section 7 and 3.3: access token errors travel in WWW-Authenticate, the others in a JSON body', () => {
  assert.equal(carriedIn({ status: 401 }), 'WWW-Authenticate');
  assert.equal(carriedIn({ status: 401, error: 'invalid_token' }), 'WWW-Authenticate');
  assert.equal(carriedIn({ status: 403, error: 'insufficient_scope' }), 'WWW-Authenticate');
  for (const error of ['invalid_session', 'session_ended', 'version_unsupported'] as const) assert.equal(carriedIn({ status: 400, error }), 'JSON body');
  assert.equal(carriedIn({ status: 403, error: 'extension_required' }), 'JSON body', 'extension_required is not an access token error');
  assert.equal(carriedIn({ status: 429, retryAfter: 30 }), 'Retry-After header');
});

test('5.3: Session errors are 400, so an OAuth library that discards a token on 401 keeps a valid one', () => {
  for (const trouble of ['delegation', 'end', 'old-copy'] as const) {
    const reply = replyTo(trouble);
    assert.equal(reply.status, 400);
    assert.equal(libraryKeepsToken(reply), true, trouble);
    assert.equal(libraryKeepsToken({ ...reply, status: 401 }), false, `${trouble} as a 401 would cost a good token`);
  }
  assert.equal(libraryKeepsToken(replyTo('expire')), false, 'an invalid_token is meant to be discarded');
});

test('section 7: 401 with no code is handled as insufficient_scope: a refresh token that covers it, else ask the User for every scope still needed', () => {
  assert.deepEqual(remedy({ status: 401, needs: 'orders:write' }, holding({ token: undefined })), { kind: 'refresh', scope: 'orders:write' });
  assert.deepEqual(remedy({ status: 401, needs: 'orders:write' }, holding({ token: undefined, refresh: RO })), { kind: 'sign-in', scopes: RW });
  assert.deepEqual(remedy({ status: 401, needs: 'orders:write' }, holding({ token: undefined, refresh: null })), { kind: 'sign-in', scopes: ['orders:write'] });
});

test('section 7 and 4.7: 403 insufficient_scope: refresh if the refresh token covers the scope; otherwise sign in again for every scope, keeping the old ones', () => {
  const reply = replyTo('read-only');
  assert.deepEqual(remedy(reply, holding({ refresh: RW })), { kind: 'refresh', scope: 'orders:write' });
  assert.deepEqual(remedy(reply, holding({ refresh: RO })), { kind: 'sign-in', scopes: RW });
});

test('5.5 and section 7: after the User signs out or disconnects the agent, it continues signed out and does not ask again', () => {
  assert.deepEqual(remedy(replyTo('read-only'), holding({ signedOut: true })), { kind: 'signed-out' });
  assert.deepEqual(remedy({ status: 401, needs: 'orders:write' }, holding({ signedOut: true, token: undefined })), { kind: 'signed-out' });
  assert.deepEqual(remedy(replyTo('expire'), holding({ signedOut: true })), { kind: 'signed-out' }, 'refresh fails with invalid_grant');
});

test('section 7 and 4.4: 401 invalid_token: refresh', () => {
  assert.deepEqual(remedy(replyTo('expire'), holding()), { kind: 'refresh' });
  assert.deepEqual(remedy(replyTo('expire'), holding({ refresh: null })), { kind: 'signed-out' }, 'with no refresh token there is nothing to refresh');
});

test('4.5 and section 7: invalid_token with resource_metadata for another resource: a token with resource set to it, for that service only', () => {
  assert.deepEqual(remedy(replyTo('mcp'), holding()), { kind: 'refresh', resource: MCP_URL });
  const mcpToken = healthy('sizes', { mcpKey: true }).request.token!;
  assert.equal(mcpToken.resource, MCP_URL);
  assert.deepEqual(remedy({ status: 401, error: 'invalid_token', resourceMetadata: MCP_METADATA }, holding({ token: mcpToken })), { kind: 'refresh', resource: MCP_URL }, 'a key for it that has expired is refreshed for the same resource');
});

test('4.5 and section 7: a token issued for the MCP server is refused at the API, and the default token at the MCP server', () => {
  const mcpKey = healthy('sizes', { mcpKey: true }).request.token!;
  const atApi = healthy('order', { token: mcpKey });
  assert.equal(respond(atApi.request, atApi.company).error, 'invalid_token');
  assert.equal(replyTo('mcp').error, 'invalid_token');
});

test('section 7 and 5.3: 400 invalid_session: stop and fix the cause; a new Session does not fix it', () => {
  const reply = replyTo('delegation');
  assert.deepEqual(remedy(reply, holding()), { kind: 'fix' });
  const inNew = troubled('delegation', { sid: 'Kp8mR3' });
  assert.equal(respond(inNew.request, inNew.company).error, 'invalid_session', 'the same header in a new Session is refused the same way');
});

test('section 7 and 5.5: 400 session_ended: start a new Session and send again, once', () => {
  assert.deepEqual(remedy(replyTo('end'), holding()), { kind: 'new-session' });
  assert.deepEqual(remedy(replyTo('end'), holding({ resent: true })), { kind: 'stop', why: 'the new Session got session_ended too' });
});

test('3.4: compatible versions share major and, before 1.0, minor; the agent chooses the newest compatible one', () => {
  assert.equal(compatible('0.4', '0.4'), true);
  assert.equal(compatible('0.4', '0.3'), false);
  assert.equal(compatible('1.2', '1.0'), true);
  assert.equal(compatible('2.0', '1.9'), false);
  assert.equal(choose({ protocol_version: '0.4', supported_versions: { '0.3': 'https://example.com/poppy/0.3.json' } }, ['0.3', '0.4']), '0.4');
  assert.equal(choose({ protocol_version: '0.4', supported_versions: { '0.3': 'https://example.com/poppy/0.3.json' } }, ['0.3']), '0.3');
  assert.equal(choose({ protocol_version: '0.4' }, ['0.3']), null, 'with none compatible the agent uses none of them');
});

test('3.4 and section 7: version_unsupported: fetch poppy.json again; another version means a new Session and one more send, the same version means stop', () => {
  assert.deepEqual(remedy(replyTo('old-copy'), holding({ version: '0.3' })), { kind: 'reread' });
  assert.deepEqual(remedy(replyTo('old-copy'), holding({ version: '0.3', resent: true })), { kind: 'stop', why: 'the request was already sent again under a newly chosen version' });
  const missing = { ...healthy().request, version: undefined };
  assert.deepEqual(respond(missing, EXAMPLE_COMPANY), { status: 400, error: 'version_unsupported' }, 'a request without Poppy-Version');
});

test('3.3: extension_required: declare the extension in a new Session if the agent implements a listed version, else stop (the model’s reading)', () => {
  const reply: Reply = { status: 403, error: 'extension_required', extension: 'example.com/gift-wrap' };
  const offered = { 'example.com/gift-wrap': ['2', '1'] };
  assert.deepEqual(remedy(reply, holding({ offered, extensions: [{ name: 'example.com/gift-wrap', v: '1' }] })), { kind: 'declare', extension: { name: 'example.com/gift-wrap', v: '1' } });
  assert.deepEqual(remedy(reply, holding({ offered, extensions: [] })), { kind: 'stop', why: 'the agent does not implement a version of example.com/gift-wrap the Company lists' });
});

test('5.6: 429 asks the agent to wait at least Retry-After before sending again', () => {
  assert.deepEqual(remedy(replyTo('too-fast'), holding()), { kind: 'wait', seconds: RETRY_AFTER });
});

test('section 7: every refusal in the table gets one remedy, and no two codes share one', () => {
  const kinds = TROUBLES.filter((t) => t !== 'mcp').map((t) => remedy(replyTo(t), holding({ refresh: t === 'read-only' ? RO : RW, version: t === 'old-copy' ? '0.3' : '0.4' })).kind);
  assert.deepEqual(kinds, ['refresh', 'sign-in', 'fix', 'new-session', 'reread', 'wait']);
  assert.equal(new Set(kinds).size, kinds.length);
});

test('5.5, 3.4 and section 7: the agent pursuing a request sends it at most twice when Sessions keep ending, and stops', () => {
  const run = pursue('exchange', { company: { ...EXAMPLE_COMPANY, ended: 'all' } });
  assert.deepEqual(run.map((s) => s.reply.error ?? s.reply.status), ['session_ended', 'session_ended']);
  assert.deepEqual(run.map((s) => s.move.kind), ['new-session', 'stop']);
  const naive = pursue('exchange', { company: { ...EXAMPLE_COMPANY, ended: 'all' }, once: false, limit: 6 });
  assert.equal(naive.length, 6, 'without the once rule the agent and the Company loop until something else stops them');
});

test('section 7: invalid_session is never sent again until the cause is fixed', () => {
  const run = pursue('exchange', { dlgExpired: true });
  assert.deepEqual(run.map((s) => [s.reply.status, s.move.kind]), [[400, 'fix'], [200, 'done']]);
  assert.equal(run[1]!.sid, run[0]!.sid, 'fixing the delegation keeps the Session');
});

test('section 7: every trouble, pursued from a healthy agent, ends in 200 after its one remedy', () => {
  for (const trouble of TROUBLES) {
    const run = pursue(trouble === 'mcp' ? 'sizes' : 'exchange', agentAfter(trouble));
    assert.equal(run.length, 2, trouble);
    assert.deepEqual(run[1]!.reply, { status: 200 }, trouble);
  }
});

// The machine the scene drives: a trouble sends the request and the Company refuses it; a fix is
// the reader's prediction of the remedy, refused with the draft's reason when it is the wrong one.

test('section 7: from each refusal, exactly one fix is taken, and the request then succeeds', () => {
  for (const trouble of TROUBLES) {
    const refused = play([trouble]);
    assert.ok(pending(refused), trouble);
    const taken = FIXES.filter((f) => !isRefusal(next(refused, f)));
    assert.equal(taken.length, 1, `${trouble}: ${taken.join(', ')}`);
    const fixed = next(refused, taken[0]!) as World;
    assert.deepEqual(fixed.last?.again, { status: 200 }, trouble);
    assert.equal(pending(fixed), false);
  }
});

test('section 7: the wrong remedies the status codes are meant to prevent are refused with the reason', () => {
  assert.equal(reasonOf(play(['delegation']), 'new-session'), 'a new Session does not fix invalid_session: the same header fails in any Session, so the agent stops and fixes the cause');
  assert.equal(reasonOf(play(['delegation']), 'refresh'), 'invalid_session is a 400: the access token is fine, so the agent keeps it');
  assert.equal(reasonOf(play(['end']), 'sign-in'), 'session_ended is a 400: the access token is fine, so the agent keeps it');
  assert.equal(reasonOf(play(['read-only']), 'refresh'), 'the refresh token covers only orders:read, and a refresh cannot add orders:write, so the agent asks you');
  assert.equal(reasonOf(play(['expire']), 'sign-in'), 'the refresh token still covers what the exchange needs, so the agent refreshes without asking you');
  assert.equal(reasonOf(play(['too-fast']), 'refresh'), `429 says the agent is sending too often; it waits at least ${RETRY_AFTER} s and sends the same request`);
  assert.equal(reasonOf(play(['expire']), 'wait'), 'invalid_token asks for a refresh, and waiting will not change the answer');
});

test('section 7: a remedy answers a refusal, so every fix is refused when nothing has been refused, and every trouble while a refusal waits', () => {
  for (const fix of FIXES) assert.equal(reasonOf(start(), fix), 'nothing has been refused, so there is nothing to remedy');
  const refused = play(['expire']);
  for (const trouble of TROUBLES) assert.equal(reasonOf(refused, trouble), 'the agent has a refusal to answer first: 401 invalid_token');
});

test('5.5: a new Session leaves the old Session’s cart behind; fixing the delegation keeps it (5.2)', () => {
  assert.equal(start().cart, true);
  assert.equal(play(['end', 'new-session']).cart, false);
  assert.equal(play(['old-copy', 'reread']).cart, false, 'a new version means a new Session (3.4)');
  assert.equal(play(['delegation', 'fix']).cart, true);
  assert.equal(play(['expire', 'refresh']).cart, true);
});

test('4.5: once the agent holds a key cut for the MCP server, its sizing call succeeds at once', () => {
  const w = play(['mcp', 'refresh']);
  assert.equal(w.mcpKey, true);
  const again = play(['mcp'], w);
  assert.deepEqual(again.last, { trouble: 'mcp', reply: { status: 200 }, fix: null, again: null });
  assert.equal(pending(again), false);
});

test('the scene’s machine (no section): the story replays without a refusal, and every reachable state leaves something to press', () => {
  play(STORY);
  const seen = new Map<string, World>([[JSON.stringify(start()), start()]]);
  for (const queue = [start()]; queue.length; ) {
    const w = queue.shift()!;
    const taken = REFUSAL_EVENTS.map((e) => next(w, e)).filter((n): n is World => !isRefusal(n));
    assert.ok(taken.length > 0, JSON.stringify(w));
    for (const n of taken) if (!seen.has(JSON.stringify(n))) { seen.set(JSON.stringify(n), n); queue.push(n); }
  }
  assert.ok(seen.size <= 60, `${seen.size} states`);
  assert.equal(SID, 'Yx2b7Q');
  assert.equal(OPERATIONS.exchange.needs, 'orders:write');
});

test('the scene’s machine (no section): the events are the troubles then the fixes, distinct, with no comma in a name', () => {
  assert.deepEqual(REFUSAL_EVENTS, [...TROUBLES, ...FIXES]);
  assert.equal(new Set(REFUSAL_EVENTS).size, REFUSAL_EVENTS.length);
  for (const e of REFUSAL_EVENTS) assert.doesNotMatch(e, /,/);
  const fixes: readonly Fix[] = FIXES;
  assert.equal(fixes.length, 6);
});
