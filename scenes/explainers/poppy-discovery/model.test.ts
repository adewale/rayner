import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal } from '../../../explain/index.ts';
import { COMPANY, USER_IDS } from '../poppy/model.ts';
import {
  AS_METADATA, BASE_WEB, EVENTS, FORGERIES, GATES, REAL_DOC, SERVERS, STORY,
  afterVersionUnsupported, asMetadataUrl, checkPoppyVersion, chooseVersion, compatible, confirmIssuer, companyOf,
  discover, extensionRequired, extensionVersion, fetchDocument, findIssuer, isReservedExtension, isStop, next,
  progress, prmUrl, readDocument, sameCompany, start, userIdAt, wellKnownUrl,
  type DiscoveryEvent, type PoppyDocument, type Server, type Stop, type Web, type World,
} from './model.ts';

// Each test names the section of the Personal Agent Protocol draft 1.0 it holds the model to
// (https://personalagentprotocol.org/docs/1.0/spec). The specification was read, not run: there is
// no reference implementation here, so these pin the model to the draft's rules and examples.

const ISSUER = 'https://auth.example.com';
const stopOf = (x: unknown): Stop => { assert.ok(isStop(x), `expected a stop, got ${JSON.stringify(x)}`); return x; };
const ok = <T>(x: T | Stop): T => { assert.ok(!isStop(x), `stopped: ${isStop(x) ? `${x.stopped}: ${x.reason}` : ''}`); return x as T; };
/** BASE_WEB with these URLs answered differently. */
const webWith = (changes: Web): Web => ({ ...BASE_WEB, ...changes });
const doc = (changes: Partial<PoppyDocument>): PoppyDocument => ({ ...REAL_DOC, ...changes });

test('section 3: the document lives at https://{domain}/.well-known/poppy.json', () => {
  assert.equal(wellKnownUrl('example.com'), 'https://example.com/.well-known/poppy.json');
  assert.equal(prmUrl('example.com'), 'https://example.com/.well-known/oauth-protected-resource');
});

test('section 3: the agent follows an HTTPS redirect, and the document speaks for the last host', () => {
  const got = ok(fetchDocument(BASE_WEB, 'www.example.com'));
  assert.deepEqual(got.hops, ['https://www.example.com/.well-known/poppy.json', 'https://example.com/.well-known/poppy.json']);
  assert.equal(got.host, 'example.com');
});

test('section 3: every redirect must be to an HTTPS URL', () => {
  const web = webWith({ 'https://www.example.com/.well-known/poppy.json': { status: 301, location: 'http://example.com/.well-known/poppy.json' } });
  assert.equal(stopOf(fetchDocument(web, 'www.example.com')).reason, 'the redirect to http://example.com/.well-known/poppy.json is not HTTPS');
});

test('section 3: the last URL’s path must be exactly /.well-known/poppy.json, with no query', () => {
  const upload = stopOf(fetchDocument(BASE_WEB, 'deals.example'));
  assert.deepEqual(upload, { stopped: 'fetch', reason: 'the last URL, https://example.com/uploads/poppy.json, is not at /.well-known/poppy.json' });
  const query = webWith({ 'https://deals.example/.well-known/poppy.json': { status: 302, location: 'https://example.com/.well-known/poppy.json?v=1' }, 'https://example.com/.well-known/poppy.json?v=1': { status: 200, body: REAL_DOC } });
  assert.equal(stopOf(fetchDocument(query, 'deals.example')).reason, 'the last URL, https://example.com/.well-known/poppy.json?v=1, has a query');
  // A redirect to another host is allowed when the path is exact: the document then speaks for that host.
  const moved = webWith({ 'https://deals.example/.well-known/poppy.json': { status: 302, location: 'https://example.com/.well-known/poppy.json' } });
  assert.equal(ok(fetchDocument(moved, 'deals.example')).host, 'example.com');
});

test('section 3: no document at the well-known URL, or a redirect loop, gives nothing to use (the hop limit is the model’s)', () => {
  assert.equal(stopOf(fetchDocument(BASE_WEB, 'nobody.example')).reason, 'https://nobody.example/.well-known/poppy.json answered 404, so there is no poppy.json');
  const loop = webWith({ 'https://loop.example/.well-known/poppy.json': { status: 302, location: 'https://loop.example/.well-known/poppy.json' } });
  assert.match(stopOf(fetchDocument(loop, 'loop.example')).reason, /more than 5 redirects/);
});

test('3.1: organization.domain must be the host that served the document, ignoring case and nothing else', () => {
  const served = (d: PoppyDocument, host = 'example.com') => readDocument({ hops: [], url: wellKnownUrl(host), host, doc: d }, BASE_WEB);
  assert.equal(ok(served(REAL_DOC)).domain, 'example.com');
  assert.equal(ok(served(doc({ organization: { name: 'Example Company', domain: 'EXAMPLE.com' } }))).domain, 'EXAMPLE.com');
  assert.equal(stopOf(served(doc({ organization: { name: 'Example Company', domain: 'example.com.' } }))).reason, 'the document names example.com., and example.com served it');
  assert.deepEqual(stopOf(discover('examp1e.com', BASE_WEB)), { stopped: 'read', reason: 'the document names example.com, and examp1e.com served it' });
});

test('3.1 (1.0): organization.domain carries the port when it is not 443, and an agent uses another port only when configured to', () => {
  const testing = { organization: { name: 'Example Company', domain: 'shop.example:8443' } };
  const at = (host: string, d: PoppyDocument, o: { otherPorts?: boolean } = {}) => readDocument({ hops: [], url: wellKnownUrl(host), host, doc: d }, BASE_WEB, o);
  assert.equal(stopOf(at('shop.example:8443', doc(testing))).reason, 'shop.example:8443 is not on port 443, and the agent uses another port only when configured to, such as for testing');
  assert.equal(ok(at('shop.example:8443', doc(testing), { otherPorts: true })).domain, 'shop.example:8443');
  assert.equal(stopOf(at('shop.example:8443', doc({ organization: { name: 'Example Company', domain: 'shop.example' } }), { otherPorts: true })).reason, 'the document names shop.example, and shop.example:8443 served it');
  // Port 443 is the default, so a URL that spells it out is served by the same host.
  const web = webWith({ 'https://example.com:443/.well-known/poppy.json': { status: 200, body: REAL_DOC }, 'https://www.example.com/.well-known/poppy.json': { status: 301, location: 'https://example.com:443/.well-known/poppy.json' } });
  assert.equal(ok(fetchDocument(web, 'www.example.com')).host, 'example.com');
});

test('3.1: a document needs protocol_version, organization, and at least one of agent, apis or web', () => {
  const served = (d: PoppyDocument) => readDocument({ hops: [], url: wellKnownUrl('example.com'), host: 'example.com', doc: d }, BASE_WEB);
  const { agent: _a, apis: _p, web: _w, ...noChannel } = REAL_DOC;
  assert.equal(stopOf(served(noChannel)).reason, 'the document lists none of agent, apis or web');
  const { protocol_version: _v, ...noVersion } = REAL_DOC;
  assert.equal(stopOf(served(noVersion)).reason, 'the document has no protocol_version');
  const { organization: _o, ...noOrganization } = REAL_DOC;
  assert.equal(stopOf(served(noOrganization)).reason, 'the document names no organization.domain');
  assert.deepEqual(ok(served(REAL_DOC)).channels, ['api', 'web', 'chat']);
  assert.deepEqual(ok(served({ ...noChannel, web: {} })).channels, ['web'], 'a website alone is a way in');
});

test('section 3 (HTTPS): an endpoint with another scheme is not used, and a website asked not to be browsed is not a way in', () => {
  const served = (d: PoppyDocument) => readDocument({ hops: [], url: wellKnownUrl('example.com'), host: 'example.com', doc: d }, BASE_WEB);
  assert.deepEqual(ok(served(doc({ apis: [{ type: 'openapi', url: 'http://api.example.com/openapi.json' }] }))).channels, ['web', 'chat']);
  assert.deepEqual(ok(served(doc({ web: { disabled: true } }))).channels, ['api', 'chat']);
});

test('3.2: the issuer comes from the domain’s protected resource metadata, and the issuer lists the domain back', () => {
  const read = ok(readDocument(ok(fetchDocument(BASE_WEB, 'example.com')), BASE_WEB));
  assert.deepEqual(ok(findIssuer(read, BASE_WEB)), { issuer: ISSUER });
  assert.equal(confirmIssuer(ISSUER, 'example.com', BASE_WEB), true);
  assert.deepEqual(ok(discover('www.example.com', BASE_WEB)), {
    host: 'example.com', domain: 'example.com', issuer: ISSUER, company: ISSUER, signIn: true, channels: ['api', 'web', 'chat'], version: '1.0',
  });
});

test('3.2: the issuer must list https://{organization.domain}, or a domain could claim another Company’s issuer', () => {
  assert.deepEqual(stopOf(discover('evil.example', BASE_WEB)), { stopped: 'listed', reason: 'https://auth.example.com does not list https://evil.example' });
  // Compared after lowercasing the host only: no trailing slash, port or path.
  const listing = (resources: string[]) => confirmIssuer(ISSUER, 'example.com', webWith({ [asMetadataUrl(ISSUER)]: { status: 200, body: { ...AS_METADATA, protected_resources: resources } } }));
  assert.equal(listing(['https://EXAMPLE.COM']), true);
  for (const listed of ['https://example.com/', 'https://example.com:443', 'https://example.com/shop', 'HTTPS://example.com']) assert.ok(isStop(listing([listed])), listed);
});

test('3.2: the issuer metadata’s issuer must match the issuer found, character for character', () => {
  const web = webWith({ [asMetadataUrl(ISSUER)]: { status: 200, body: { ...AS_METADATA, issuer: 'https://auth.example.com/' } } });
  assert.equal(stopOf(confirmIssuer(ISSUER, 'example.com', web)).reason, 'the metadata names the issuer https://auth.example.com/, not https://auth.example.com');
  assert.equal(stopOf(confirmIssuer(ISSUER, 'example.com', webWith({ [asMetadataUrl(ISSUER)]: 'timeout' }))).reason, 'the issuer’s metadata timed out, so the issuer cannot be verified');
});

test('3.2: the issuer’s metadata URL is RFC 8414’s, with the well-known part before an issuer’s path', () => {
  assert.equal(asMetadataUrl('https://auth.example.com'), 'https://auth.example.com/.well-known/oauth-authorization-server');
  assert.equal(asMetadataUrl('https://auth.provider.example/shop-a'), 'https://auth.provider.example/.well-known/oauth-authorization-server/shop-a');
});

test('3.2: 404 means no issuer: the Company is its HTTPS domain and offers signed-out Sessions only', () => {
  assert.deepEqual(ok(discover('corner.example', BASE_WEB)), {
    host: 'corner.example', domain: 'corner.example', issuer: null, company: 'https://corner.example', signIn: false, channels: ['web'], version: '1.0',
  });
  const empty = webWith({ [prmUrl('corner.example')]: { status: 200, body: { resource: 'https://corner.example', authorization_servers: [] } } });
  assert.equal(ok(discover('corner.example', empty)).issuer, null, 'an empty authorization_servers also means no issuer');
  // No issuer is valid only when the document names none and offers no sign-in.
  const naming = webWith({ [wellKnownUrl('corner.example')]: { status: 200, body: { ...SERVER_DOC('corner.example'), auth: { issuer: 'https://auth.corner.example' } } } });
  assert.equal(stopOf(discover('corner.example', naming)).reason, 'there is no issuer, but the document names https://auth.corner.example in auth.issuer');
});
const SERVER_DOC = (host: string) => (BASE_WEB[wellKnownUrl(host)] as { body: PoppyDocument }).body;

test('3.2: after a timeout, another error status or invalid metadata the agent stops, and never falls back to the domain', () => {
  const at = (answer: Web[string]) => discover('example.com', webWith({ [prmUrl('example.com')]: answer }));
  assert.deepEqual(stopOf(at('timeout')), { stopped: 'issuer', reason: 'the protected resource metadata timed out, and the agent does not fall back to the domain after an error' });
  assert.equal(stopOf(at({ status: 500 })).reason, 'the protected resource metadata answered 500, and the agent does not fall back to the domain after an error');
  assert.equal(stopOf(at({ status: 200, body: 'not json' })).reason, 'the protected resource metadata is invalid, and the agent does not fall back to the domain after an error');
  assert.equal(stopOf(at({ status: 200, body: { resource: 'https://example.com/', authorization_servers: [ISSUER] } })).reason, 'the protected resource metadata names the resource https://example.com/, not https://example.com');
});

test('3.2: for a Company whose issuer it knows, only metadata that lists no issuer establishes removal (the model reads a 404 as not explicit)', () => {
  const known = { known: ISSUER };
  assert.equal(stopOf(discover('example.com', webWith({ [prmUrl('example.com')]: { status: 404 } }), known)).reason, 'the agent knows the issuer https://auth.example.com, and a 404 does not establish that it was removed');
  const removed = webWith({ [prmUrl('example.com')]: { status: 200, body: { resource: 'https://example.com', authorization_servers: [] } } });
  const gone = ok(discover('example.com', removed, known));
  assert.deepEqual([gone.issuer, gone.company, gone.signIn], [null, 'https://example.com', false]);
  assert.equal(stopOf(discover('example.com', webWith({ [prmUrl('example.com')]: 'timeout' }), known)).stopped, 'issuer');
});

test('3.1 and 3.2: auth.issuer must name the one authorization server, or choose among several', () => {
  const twoServers = webWith({ [prmUrl('example.com')]: { status: 200, body: { resource: 'https://example.com', authorization_servers: ['https://staff.example.com', ISSUER] } } });
  assert.equal(stopOf(discover('example.com', twoServers)).reason, 'the metadata lists 2 authorization servers, and auth.issuer does not choose one');
  const chosen = webWith({ ...twoServers, [wellKnownUrl('example.com')]: { status: 200, body: doc({ auth: { issuer: ISSUER } }) } });
  assert.equal(ok(discover('example.com', chosen)).issuer, ISSUER);
  const wrong = webWith({ [wellKnownUrl('example.com')]: { status: 200, body: doc({ auth: { issuer: 'https://staff.example.com' } }) } });
  assert.equal(stopOf(discover('example.com', wrong)).reason, 'auth.issuer names https://staff.example.com, which the metadata does not list');
});

test('3.2: a Company that sets auth.disabled keeps its issuer as its identifier and offers no sign-in', () => {
  const off = webWith({ [wellKnownUrl('example.com')]: { status: 200, body: doc({ auth: { disabled: true } }) } });
  const got = ok(discover('example.com', off));
  assert.deepEqual([got.company, got.signIn], [ISSUER, false]);
});

test('3.2: several domains with the same issuer are one Company, with the same User ID; without an issuer each domain is its own', () => {
  const uk = ok(discover('example.co.uk', BASE_WEB)), com = ok(discover('www.example.com', BASE_WEB)), corner = ok(discover('corner.example', BASE_WEB));
  assert.equal(uk.company, com.company);
  assert.ok(sameCompany(uk, com));
  assert.equal(userIdAt(uk.company), USER_IDS[COMPANY.domain]);
  assert.equal(userIdAt(com.company), 'usr_Q7c1vK');
  assert.ok(!sameCompany(corner, com));
  assert.notEqual(userIdAt(corner.company), userIdAt(com.company));
  assert.equal(companyOf('Corner.Example', null), 'https://corner.example', 'the domain identifier has its host in lowercase and no trailing slash');
  // An issuer represents one Company: a provider gives each its own issuer, so they are different Companies.
  assert.notEqual(companyOf('a.example', 'https://auth.provider.example/shop-a'), companyOf('b.example', 'https://auth.provider.example/shop-b'));
});

test('section 3 and 10.3: each forgery is refused by exactly one check, and would be accepted without it', () => {
  assert.deepEqual(FORGERIES, { upload: 'fetch', copy: 'read', claim: 'listed' });
  for (const [server, gate] of Object.entries(FORGERIES) as [Server, (typeof GATES)[number]][]) {
    const { start: from, web } = SERVERS[server];
    assert.equal(stopOf(discover(from, web)).stopped, gate, server);
    for (const other of GATES.filter((g) => g !== gate)) assert.equal(stopOf(discover(from, web, { skip: other })).stopped, gate, `${server} without ${other}`);
    const accepted = ok(discover(from, web, { skip: gate }));
    // Without its check, each forgery would speak for example.com’s Company and receive its User ID.
    assert.equal(accepted.company, ISSUER, server);
    assert.equal(userIdAt(accepted.company), 'usr_Q7c1vK', server);
  }
});

test('10.3 (1.0): a lookalike that names itself passes every check, whatever name and logo it uses; the domain is the Company’s identity', () => {
  const web = webWith({
    [wellKnownUrl('examp1e.com')]: { status: 200, body: { ...REAL_DOC, organization: { name: 'Example Company', domain: 'examp1e.com' } } },
    [prmUrl('examp1e.com')]: { status: 404 },
  });
  const got = ok(discover('examp1e.com', web));
  assert.deepEqual([got.domain, got.company, got.signIn], ['examp1e.com', 'https://examp1e.com', false]);
  // Nothing ties it to example.com: another Company, so another User ID.
  assert.notEqual(userIdAt(got.company), userIdAt(ok(discover('example.com', BASE_WEB)).company));
});

test('3.4: versions are compatible with the same major and, before 1.0, the same minor', () => {
  assert.ok(compatible('0.4', '0.4'));
  assert.ok(!compatible('0.4', '0.3'));
  assert.ok(compatible('1.2', '1.0'));
  assert.ok(!compatible('2.0', '1.9'));
  assert.ok(!compatible('1.0', '0.4'), 'a 1.0 agent cannot read a 0.4 document');
});

test('3.4: the agent uses the newest compatible version, only from a URL on the host that served poppy.json', () => {
  assert.deepEqual(ok(chooseVersion(REAL_DOC, 'example.com', BASE_WEB, ['1.0'])).version, '1.0');
  assert.deepEqual(ok(chooseVersion(REAL_DOC, 'example.com', BASE_WEB, ['1.1'])).version, '1.0', 'from 1.0, a newer minor reads an older one');
  const old = ok(chooseVersion(REAL_DOC, 'example.com', BASE_WEB, ['0.3']));
  assert.deepEqual([old.version, old.url], ['0.3', 'https://example.com/poppy/0.3.json']);
  assert.equal(stopOf(chooseVersion(REAL_DOC, 'example.com', BASE_WEB, ['0.5'])).reason, 'no version the document offers, 1.0 or 0.3, is compatible with 0.5');
  const elsewhere = doc({ supported_versions: { '0.3': 'https://files.example.net/poppy/0.3.json' } });
  assert.ok(isStop(chooseVersion(elsewhere, 'example.com', webWith({ 'https://files.example.net/poppy/0.3.json': { status: 200, body: { ...REAL_DOC, protocol_version: '0.3' } } }), ['0.3'])), 'a version on another host is not used');
  const relabelled = webWith({ 'https://example.com/poppy/0.3.json': { status: 200, body: { ...REAL_DOC, protocol_version: '0.2', supported_versions: undefined } } });
  assert.ok(isStop(chooseVersion(REAL_DOC, 'example.com', relabelled, ['0.3'])), 'a version document must have the version it is listed under');
  const redirected = webWith({ 'https://example.com/poppy/0.3.json': { status: 302, location: 'https://example.com/poppy/old.json' } });
  assert.ok(isStop(chooseVersion(REAL_DOC, 'example.com', redirected, ['0.3'])), 'the agent does not follow a redirect from a version URL');
  const moved = webWith({ 'https://example.com/poppy/0.3.json': { status: 200, body: { ...REAL_DOC, protocol_version: '0.3', supported_versions: undefined, organization: { name: 'X', domain: 'example.co.uk' } } } });
  assert.ok(isStop(chooseVersion(REAL_DOC, 'example.com', moved, ['0.3'])), 'every version names the same organization.domain');
});

test('3.4: an endpoint answers a missing or incompatible Poppy-Version with 400 version_unsupported; the agent retries once in a new Session', () => {
  assert.equal(checkPoppyVersion('1.0', ['1.0', '0.3']), null);
  assert.equal(checkPoppyVersion('1.1', ['1.0']), null, 'from 1.0, a newer minor is compatible');
  assert.deepEqual(checkPoppyVersion(undefined, ['1.0']), { status: 400, error: 'version_unsupported' });
  assert.deepEqual(checkPoppyVersion('0.4', ['1.0', '0.3']), { status: 400, error: 'version_unsupported' });
  assert.equal(afterVersionUnsupported('1.0', '0.3', false), 'start a new Session and send the request again, once');
  assert.equal(afterVersionUnsupported('1.0', '1.0', false), 'stop sending the request');
  assert.equal(afterVersionUnsupported('1.0', null, false), 'stop sending the request');
  assert.equal(afterVersionUnsupported('1.0', '0.3', true), 'stop sending the request');
});

test('3.3: extensions: plain names are reserved, unknown ones are ignored, and a Company may answer extension_required', () => {
  assert.ok(isReservedExtension('operations'));
  assert.ok(!isReservedExtension('example.com/gift-wrap'));
  const listed = doc({ extensions: { 'example.com/gift-wrap': [{ version: '2' }, { version: '1' }] } });
  assert.equal(extensionVersion(listed, 'example.com/gift-wrap', ['1', '2']), '2');
  assert.equal(extensionVersion(listed, 'example.com/gift-wrap', ['1']), '1');
  assert.equal(extensionVersion(listed, 'example.com/gift-wrap', ['3']), null);
  assert.equal(extensionVersion(listed, 'shoes.example/fit', ['1']), null);
  assert.deepEqual(extensionRequired(listed, {}, 'example.com/gift-wrap'), { status: 403, error: 'extension_required', extension: 'example.com/gift-wrap' });
  assert.equal(extensionRequired(listed, { 'example.com/gift-wrap': '1' }, 'example.com/gift-wrap'), null);
  assert.deepEqual(extensionRequired(listed, { 'example.com/gift-wrap': '3' }, 'example.com/gift-wrap')?.status, 403, 'a version the Company does not list declares nothing');
});

// The machine the live step drives: who serves the document, and the agent's four checks in order.

const reasonOf = (w: World, e: DiscoveryEvent) => { const n = next(w, e); return isRefusal(n) ? n.reason : null; };
const run = (events: readonly DiscoveryEvent[], from = start()) => events.reduce<World>((w, e) => {
  const after = next(w, e);
  assert.ok(!isRefusal(after), `${e} was refused: ${isRefusal(after) ? after.reason : ''}`);
  return after as World;
}, from);
const C = (n: number): DiscoveryEvent[] => Array.from({ length: n }, () => 'check' as const);

test('section 3: the machine’s checks agree with discover() for every server', () => {
  for (const server of Object.keys(SERVERS) as Server[]) {
    let w = run(server === 'shop' ? [] : [server]);
    while (!isRefusal(next(w, 'check'))) w = next(w, 'check') as World;
    const { verdict } = progress(w), { start: from, web, known } = SERVERS[server], d = discover(from, web, { known });
    assert.ok(verdict, server);
    if (isStop(d)) assert.deepEqual(verdict, { accepted: false, gate: d.stopped, reason: d.reason }, server);
    else assert.deepEqual(verdict, { accepted: true, company: d.company, signIn: d.signIn, userId: userIdAt(d.company) }, server);
  }
});

test('section 3: the checks run in their fixed order, eight buttons in all, and each refused press says why', () => {
  assert.equal(EVENTS.length, 8);
  assert.deepEqual(C(4).reduce<World[]>((ws) => [...ws, next(ws.at(-1)!, 'check') as World], [start()]).map((w) => progress(w).results.map((r) => r.gate)),
    [[], ['fetch'], ['fetch', 'read'], ['fetch', 'read', 'issuer'], ['fetch', 'read', 'issuer', 'listed']]);
  assert.equal(reasonOf(start(), 'shop'), 'the agent is already about to fetch www.example.com’s poppy.json');
  assert.equal(reasonOf(run(['upload', 'check']), 'check'), 'the agent refused this document at the path check, so it checks nothing more');
  assert.equal(reasonOf(run(['copy', ...C(2)]), 'check'), 'the agent refused this document at the domain check, so it checks nothing more');
  assert.equal(reasonOf(run(['small', ...C(3)]), 'check'), 'corner.example has no issuer, so there is no listing to check');
  assert.equal(reasonOf(run(C(4)), 'check'), 'the agent has run all 4 checks and uses this document');
  assert.equal(reasonOf(run(C(2)), 'copy'), null, 'choosing another server starts again');
  assert.deepEqual(run([...C(2), 'copy']), { server: 'copy', ran: 0 });
});

test('section 3: every reachable state leaves an event to press, and the states are few', () => {
  const seen = new Map<string, World>([[JSON.stringify(start()), start()]]);
  for (const queue = [start()]; queue.length; ) {
    const w = queue.shift()!;
    const taken = EVENTS.map((e) => next(w, e)).filter((n): n is World => !isRefusal(n));
    assert.ok(taken.length > 0);
    for (const n of taken) if (!seen.has(JSON.stringify(n))) { seen.set(JSON.stringify(n), n); queue.push(n); }
  }
  // shop, uk and claim reach all four checks (5 states each), small and outage three (4 each), copy two (3), upload one (2).
  assert.equal(seen.size, 28);
});

test('the story replays without a refusal and ends where the reader can press', () => {
  const w = run(STORY);
  assert.deepEqual(w, { server: 'uk', ran: 4 });
  assert.deepEqual(progress(w).verdict, { accepted: true, company: ISSUER, signIn: true, userId: 'usr_Q7c1vK' });
});

// ---------------------------------------------------------------------------------------------
// Against the protocol's own published artifacts, not a reading of its text: the JSON Schemas of
// its Company implementation kit and the example documents of spec.md, both in
// fixtures/poppy-official.json with their source, commit and retrieval date.

import { readFileSync } from 'node:fs';
import { validate, type Schemas } from '../poppy/fixtures/json-schema.ts';

const OFFICIAL: { examples: Record<string, any>; schemas: Schemas } = JSON.parse(readFileSync(new URL('./fixtures/poppy-official.json', import.meta.url), 'utf8'));
const SPEC_POPPY_JSON = OFFICIAL.examples['3 Discovery #1 poppy.json'];
const SPEC_PRM = OFFICIAL.examples['3.2 OAuth server #1 protected resource metadata'];
const SPEC_AS_METADATA = OFFICIAL.examples['3.2 OAuth server #2 authorization server metadata'];
/** Every value `part` gives is the value at the same place in `whole`. */
const within = (part: unknown, whole: unknown): boolean =>
  typeof part === 'object' && part !== null
    ? typeof whole === 'object' && whole !== null && Object.entries(part).every(([k, v]) => within(v, (whole as Record<string, unknown>)[k]))
    : part === whole;

test('official kit schemas (poppy-official.json): every protected resource and issuer metadata document in the story’s web passes them, and so does the small shop’s poppy.json', () => {
  const checked: string[] = [];
  for (const [url, answer] of Object.entries(BASE_WEB)) {
    if (answer === 'timeout' || answer.status !== 200) continue;
    const schema = url.includes('/.well-known/oauth-protected-resource') ? 'protected-resource-metadata.schema.json'
      : url.includes('/.well-known/oauth-authorization-server') ? 'authorization-server-metadata.schema.json' : null;
    if (!schema) continue;
    assert.deepEqual(validate(OFFICIAL.schemas, schema, answer.body), [], url);
    checked.push(url);
  }
  assert.equal(checked.length, 4);
  const corner = BASE_WEB[wellKnownUrl('corner.example')];
  assert.ok(corner !== 'timeout' && corner?.status === 200);
  assert.deepEqual(validate(OFFICIAL.schemas, 'poppy.schema.json', corner.body), []);
});

test('spec.md 3 and 3.2 examples (poppy-official.json): the model’s documents give the examples’ values, and discover accepts the example documents themselves', () => {
  const { supported_versions: _from34, ...realDoc } = REAL_DOC;
  assert.ok(within(realDoc, SPEC_POPPY_JSON), 'REAL_DOC is part of the spec’s example poppy.json (supported_versions is 3.4’s example)');
  assert.ok(within(AS_METADATA, SPEC_AS_METADATA), 'AS_METADATA is part of the spec’s example issuer metadata');
  assert.deepEqual(validate(OFFICIAL.schemas, 'poppy.schema.json', SPEC_POPPY_JSON), []);
  const web: Web = { [wellKnownUrl('example.com')]: { status: 200, body: SPEC_POPPY_JSON }, [prmUrl('example.com')]: { status: 200, body: SPEC_PRM }, [asMetadataUrl(SPEC_AS_METADATA.issuer)]: { status: 200, body: SPEC_AS_METADATA } };
  const found = discover('example.com', web);
  assert.ok(!isStop(found), JSON.stringify(found));
  assert.deepEqual({ company: found.company, signIn: found.signIn, channels: [...found.channels].sort() }, { company: COMPANY.issuer, signIn: true, channels: ['api', 'chat', 'web'] });
});

test('official poppy.schema.json (poppy-official.json): every poppy.json document in the story’s web passes it in full, forgeries included', () => {
  // A forgery can be a well-formed document: what refuses it is a check of section 3, not its shape.
  const documents = Object.entries(BASE_WEB).filter(([, answer]) => answer !== 'timeout' && answer.status === 200 && typeof answer.body === 'object' && answer.body !== null && 'organization' in (answer.body as object));
  assert.equal(documents.length, 7, documents.map(([url]) => url).join(', '));
  for (const [url, answer] of documents) assert.deepEqual(validate(OFFICIAL.schemas, 'poppy.schema.json', (answer as { body: unknown }).body), [], url);
  assert.deepEqual(validate(OFFICIAL.schemas, 'poppy.schema.json', REAL_DOC), [], 'REAL_DOC');
});
