import { refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
import { CHANNELS, COMPANY, ISSUER_METADATA, POPPY_JSON, USER_IDS } from '../poppy/model.ts';
import type { Channel } from '../poppy/model.ts';

// Poppy (Personal Agent Protocol, draft 0.4), section 3: how a Personal Agent decides that a
// poppy.json speaks for a Company. Four checks, in the order the agent can make them:
//
//   fetch   the document was fetched from https://{host}/.well-known/poppy.json, redirects allowed,
//           and the last URL's path is exactly that, with no query (section 3);
//   read    the document's organization.domain is the host that served it (3.1);
//   issuer  the domain's protected resource metadata names the Company's issuer, or says plainly
//           that there is none (3.2);
//   listed  the issuer's own metadata lists the domain back (3.2).
//
// The last two are a handshake: the domain points at the issuer and the issuer points back. Each
// check exists because of one forgery, and the model keeps one of each (FORGERIES): an uploaded
// file reached by a redirect, a copy on another domain, and a domain that names another Company's
// issuer. `discover` can run with one check skipped, so the tests can show that each forgery
// passes every other check.
//
// The web is a table of answers, keyed by URL. The model reads, and never runs, the draft: it has
// no network, no TLS, no clock (a timeout is an answer in the table) and no caching. What else it
// leaves out is said beside the rule it qualifies.

/** The four checks, in order. */
export type Gate = 'fetch' | 'read' | 'issuer' | 'listed';
export const GATES: readonly Gate[] = ['fetch', 'read', 'issuer', 'listed'];
/** Each check's name in the reader's words, for refusals, answers and the picture. */
export const GATE_NAME: Record<Gate, string> = { fetch: 'path', read: 'domain', issuer: 'issuer', listed: 'listing' };

/** Where discovery stopped, and why: a clause that reads after "refused:". */
export type Stop = { stopped: Gate; reason: string };
export const isStop = (x: unknown): x is Stop => typeof x === 'object' && x !== null && 'stopped' in x && 'reason' in x;
const stop = (stopped: Gate, reason: string): Stop => ({ stopped, reason });

/** An answer from the web: a document or metadata, a redirect, an error status, or no answer in time. */
export type WebAnswer = { status: 200; body: unknown } | { status: 301 | 302 | 303 | 307 | 308; location: string } | { status: 404 | 500 | 503 } | 'timeout';
/** The web the agent sees, keyed by URL exactly as fetched. A URL not in it answers 404. */
export type Web = Readonly<Record<string, WebAnswer>>;
const get = (web: Web, url: string): WebAnswer => web[url] ?? { status: 404 };

/** The fields of a poppy.json this model reads (3.1). Everything is optional here so a test can leave a field out. */
export type PoppyDocument = {
  protocol_version?: string;
  supported_versions?: Record<string, string> | undefined;
  organization?: { name?: string; domain?: string; logo_uri?: string };
  auth?: { issuer?: string; disabled?: boolean; scopes?: Record<string, string> };
  agent?: { protocols: readonly { type: string; endpoint: string; access?: string }[] };
  apis?: readonly { type: string; url: string; description?: string }[];
  web?: { browser_session_endpoint?: string; disabled?: boolean; unscoped?: boolean };
  tasks?: { endpoint: string };
  extensions?: Record<string, readonly { version: string; endpoint?: string }[]>;
};

/** Section 3: where a Company publishes its document. */
export const wellKnownUrl = (domain: string) => `https://${domain}/.well-known/poppy.json`;
/** 3.2: where a domain publishes its protected resource metadata (RFC 9728). */
export const prmUrl = (domain: string) => `https://${domain}/.well-known/oauth-protected-resource`;
/** 3.2: where an issuer publishes its metadata (RFC 8414 §3.1): the well-known part goes between the host and any path. */
export function asMetadataUrl(issuer: string): string {
  const u = new URL(issuer), path = u.pathname === '/' ? '' : u.pathname;
  return `${u.origin}/.well-known/oauth-authorization-server${path}`;
}
const isHttps = (url: string) => /^https:\/\//.test(url);

/**
 * Section 3: redirects. The draft sets no limit on how many an agent follows; this model stops
 * after five, an assumption of the model.
 */
export const MAX_REDIRECTS = 5;

/** What the agent fetched: every URL it visited, the last one, the host that served it, and the document. */
export type Fetched = { hops: readonly string[]; url: string; host: string; doc: PoppyDocument };

/**
 * Section 3, fetching the document. The agent starts at https://{domain}/.well-known/poppy.json and
 * follows redirects, each to an HTTPS URL, to any host. It uses the document only when the last
 * URL's path is exactly /.well-known/poppy.json with no query: otherwise anyone who can serve a
 * file from some path on a domain, such as an upload, could redirect to it and have it speak for
 * that domain. `exactPath: false` skips that one rule, for the test that shows what it stops.
 *
 * The path is read as WHATWG URL parsing gives it, so dot segments are resolved first; the draft
 * says "exactly" and does not say whether before or after that. Left out: the rule against
 * connecting to loopback, private and link-local addresses.
 */
export function fetchDocument(web: Web, domain: string, o: { exactPath?: boolean } = {}): Fetched | Stop {
  const hops: string[] = [];
  let url = wellKnownUrl(domain);
  for (;;) {
    hops.push(url);
    const answer = get(web, url);
    if (answer === 'timeout') return stop('fetch', `${url} did not answer, so there is no poppy.json`);
    if (answer.status === 200) {
      const last = new URL(url);
      if (o.exactPath !== false && last.pathname !== '/.well-known/poppy.json') return stop('fetch', `the last URL, ${url}, is not at /.well-known/poppy.json`);
      if (o.exactPath !== false && last.search !== '') return stop('fetch', `the last URL, ${url}, has a query`);
      if (typeof answer.body !== 'object' || answer.body === null) return stop('fetch', `${url} is not a JSON document`);
      return { hops, url, host: last.host, doc: answer.body as PoppyDocument };
    }
    if ('location' in answer) {
      if (!isHttps(answer.location)) return stop('fetch', `the redirect to ${answer.location} is not HTTPS`);
      if (hops.length > MAX_REDIRECTS) return stop('fetch', `${domain} sent more than ${MAX_REDIRECTS} redirects`);
      url = answer.location;
      continue;
    }
    return stop('fetch', `${url} answered ${answer.status}, so there is no poppy.json`);
  }
}

/** What reading the document gave: the domain it speaks for, the version chosen, that version's document and the ways in it lists. */
export type Read = { host: string; domain: string; version: string; doc: PoppyDocument; channels: Channel[] };

/**
 * 3.1: the ways in a document lists. At least one of agent, apis or web must be present. A channel
 * counts only with an HTTPS URL (section 3: an agent must not use a URL with another scheme); a
 * website counts without a browser_session_endpoint (the agent browses it signed out) unless
 * web.disabled asks agents not to browse it. Pages of the website are outside the HTTPS rule.
 */
export function channelsOf(doc: PoppyDocument): Channel[] {
  const has: Record<Channel, boolean> = {
    api: (doc.apis ?? []).some((api) => isHttps(api.url)),
    web: !!doc.web && !doc.web.disabled && (doc.web.browser_session_endpoint === undefined || isHttps(doc.web.browser_session_endpoint)),
    chat: (doc.agent?.protocols ?? []).some((p) => isHttps(p.endpoint)),
  };
  return CHANNELS.filter((c) => has[c]);
}

/** The protocol versions this agent implements. */
export const AGENT_VERSIONS: readonly string[] = ['0.4'];

/**
 * 3.1 and 3.4: reading the document. organization.domain must be the host that served it, compared
 * ignoring case and nothing else (a trailing dot is a different domain): this stops a document
 * copied to another domain from speaking for the Company. `checkDomain: false` skips that rule.
 * Then the agent chooses a protocol version it implements (3.4) and reads that version's document.
 * Left out: the fields that do not decide which Company a document speaks for (scopes and their
 * hints, logo_uri, web.unscoped, tasks).
 */
export function readDocument(fetched: Fetched, web: Web, o: { checkDomain?: boolean; implemented?: readonly string[] } = {}): Read | Stop {
  const { doc, host } = fetched, domain = doc.organization?.domain;
  if (!domain) return stop('read', 'the document names no organization.domain');
  if (o.checkDomain !== false && domain.toLowerCase() !== host.toLowerCase()) return stop('read', `the document names ${domain}, and ${host} served it`);
  if (!doc.protocol_version) return stop('read', 'the document has no protocol_version');
  if (!doc.agent && !doc.apis && !doc.web) return stop('read', 'the document lists none of agent, apis or web');
  const chosen = chooseVersion(doc, host, web, o.implemented ?? AGENT_VERSIONS);
  if (isStop(chosen)) return chosen;
  return { host, domain, version: chosen.version, doc: chosen.doc, channels: channelsOf(chosen.doc) };
}

/** What the domain's metadata said: the Company's issuer, or null when it has none. */
export type Found = { issuer: string | null };
const noFallback = 'and the agent does not fall back to the domain after an error';

/**
 * 3.2: finding the issuer, from the protected resource metadata of https://{organization.domain}.
 *
 * - 404, or valid metadata whose authorization_servers is absent or empty, means no issuer. That is
 *   valid only when the document names no auth.issuer and offers no sign-in; the model reads
 *   "offers sign-in" as a Company Agent that asks for signed_in access (3.2).
 * - A timeout, another status or invalid metadata stops discovery: the agent never falls back to
 *   the domain identifier after an error.
 * - For a Company whose issuer the agent already knows (`known`), it falls back only when a
 *   successful discovery explicitly establishes that the issuer was removed. The model reads valid
 *   metadata with no authorization server as explicit, and a 404 as not: the draft does not say
 *   which, and this is the reading under which the rule adds something.
 * - The metadata's resource must be exactly https://{organization.domain}; the model lowercases
 *   the domain first, as the identifier does.
 * - One authorization server is the issuer, and auth.issuer, if present, must name it. With more
 *   than one, auth.issuer must choose one of them.
 */
export function findIssuer(read: Pick<Read, 'domain' | 'doc'>, web: Web, known: string | null = null): Found | Stop {
  const resource = `https://${read.domain.toLowerCase()}`, chosen = read.doc.auth?.issuer;
  const none = (): Found | Stop => {
    if (chosen) return stop('issuer', `there is no issuer, but the document names ${chosen} in auth.issuer`);
    if ((read.doc.agent?.protocols ?? []).some((p) => p.access === 'signed_in')) return stop('issuer', 'there is no issuer, but the document’s Company Agent asks for signed_in access');
    return { issuer: null };
  };
  const answer = get(web, prmUrl(read.domain.toLowerCase()));
  if (answer === 'timeout') return stop('issuer', `the protected resource metadata timed out, ${noFallback}`);
  if (answer.status === 404) return known ? stop('issuer', `the agent knows the issuer ${known}, and a 404 does not establish that it was removed`) : none();
  if (answer.status !== 200) return stop('issuer', `the protected resource metadata answered ${answer.status}, ${noFallback}`);
  const body = answer.body as { resource?: unknown; authorization_servers?: unknown };
  if (typeof body !== 'object' || body === null || typeof body.resource !== 'string' || (body.authorization_servers !== undefined && !Array.isArray(body.authorization_servers)))
    return stop('issuer', `the protected resource metadata is invalid, ${noFallback}`);
  if (body.resource !== resource) return stop('issuer', `the protected resource metadata names the resource ${body.resource}, not ${resource}`);
  const servers = (body.authorization_servers ?? []) as string[];
  if (servers.length === 0) return none();
  if (chosen && !servers.includes(chosen)) return stop('issuer', `auth.issuer names ${chosen}, which the metadata does not list`);
  if (servers.length > 1 && !chosen) return stop('issuer', `the metadata lists ${servers.length} authorization servers, and auth.issuer does not choose one`);
  return { issuer: chosen ?? servers[0]! };
}

/** 3.2: lowercase the host of a URL and nothing else (RFC 3986 §6.2.2.1), so it can be compared as a string (RFC 9728 §3.3). */
const lowercaseHost = (url: string) => url.replace(/^(https:\/\/)([^/?#]*)/, (_, scheme: string, host: string) => scheme + host.toLowerCase());

/**
 * 3.2: the issuer confirms the link from its side. The agent fetches the issuer's metadata; its
 * issuer must match the issuer found character for character, and its protected_resources must
 * include https://{organization.domain}, compared as strings after lowercasing the host. Otherwise
 * any domain could claim another Company's issuer and receive its tokens. A failure to fetch the
 * metadata is a failure to verify the issuer, which stops discovery.
 * Left out: the metadata's other required fields (token, revocation and grant types), which decide
 * how to sign in rather than which Company this is.
 */
export function confirmIssuer(issuer: string, domain: string, web: Web): true | Stop {
  const answer = get(web, asMetadataUrl(issuer));
  if (answer === 'timeout') return stop('listed', 'the issuer’s metadata timed out, so the issuer cannot be verified');
  if (answer.status !== 200) return stop('listed', `the issuer’s metadata answered ${answer.status}, so the issuer cannot be verified`);
  const body = answer.body as { issuer?: unknown; protected_resources?: unknown };
  if (typeof body !== 'object' || body === null) return stop('listed', 'the issuer’s metadata is invalid, so the issuer cannot be verified');
  if (body.issuer !== issuer) return stop('listed', `the metadata names the issuer ${String(body.issuer)}, not ${issuer}`);
  const want = `https://${domain.toLowerCase()}`, listed = Array.isArray(body.protected_resources) ? (body.protected_resources as unknown[]) : [];
  if (!listed.some((r) => typeof r === 'string' && lowercaseHost(r) === want)) return stop('listed', `${issuer} does not list ${want}`);
  return true;
}

/**
 * 3.2: the Company's identifier: its issuer when it has one, otherwise https://{organization.domain}
 * with the host in lowercase and no trailing slash. Session JWTs are addressed to it, and User IDs
 * belong to it (5.1, 5.2).
 */
export const companyOf = (domain: string, issuer: string | null) => issuer ?? `https://${domain.toLowerCase()}`;

/** What discovery gave: the host that served the document, the Company it speaks for and what it offers. */
export type Discovered = { host: string; domain: string; issuer: string | null; company: string; signIn: boolean; channels: Channel[]; version: string };

/**
 * Section 3, all four checks in order, from the domain the agent was given. `skip` leaves one check
 * out, so a test can show what that check alone stops. `known` is the issuer the agent already
 * knows for this Company, if any. Sign-in is offered only by a Company with an issuer that does
 * not set auth.disabled (3.2).
 */
export function discover(domain: string, web: Web, o: { skip?: Gate; known?: string | null; implemented?: readonly string[] } = {}): Discovered | Stop {
  const fetched = fetchDocument(web, domain, { exactPath: o.skip !== 'fetch' });
  if (isStop(fetched)) return fetched;
  const read = readDocument(fetched, web, { checkDomain: o.skip !== 'read', ...(o.implemented ? { implemented: o.implemented } : {}) });
  if (isStop(read)) return read;
  const found = findIssuer(read, web, o.known ?? null);
  if (isStop(found)) return found;
  if (found.issuer && o.skip !== 'listed') {
    const confirmed = confirmIssuer(found.issuer, read.domain, web);
    if (isStop(confirmed)) return confirmed;
  }
  return {
    host: fetched.host, domain: read.domain, issuer: found.issuer, company: companyOf(read.domain, found.issuer),
    signIn: found.issuer !== null && !read.doc.auth?.disabled, channels: read.channels, version: read.version,
  };
}

/**
 * 3.2: several domains with the same issuer are one Company, with the same User IDs, Sessions and
 * refresh tokens. Without an issuer, each domain is its own Company. An issuer represents exactly
 * one Company, so a provider gives each Company it hosts its own issuer.
 */
export const sameCompany = (a: Pick<Discovered, 'company'>, b: Pick<Discovered, 'company'>) => a.company === b.company;

/**
 * The User ID the agent uses at each Company (5.1): one per Company identifier, opaque and chosen
 * by the agent, so every domain of one Company gets the same one. example.com's is chapter 1's.
 */
const USER_ID_BY_COMPANY: Record<string, string> = { [COMPANY.issuer]: USER_IDS[COMPANY.domain], 'https://corner.example': 'usr_c9Lw2e' };
export const userIdAt = (company: string): string => USER_ID_BY_COMPANY[company] ?? 'usr_new';

// 3.4 Versions.

const parse = (v: string) => v.split('.').map(Number) as [number, number];
/** 3.4: two versions are compatible with the same major and, before 1.0, the same minor. */
export function compatible(a: string, b: string): boolean {
  const [am, an] = parse(a), [bm, bn] = parse(b);
  return am === bm && (am >= 1 || an === bn);
}
const newer = (a: string, b: string) => { const [am, an] = parse(a), [bm, bn] = parse(b); return am - bm || an - bn; };

/**
 * 3.4: choosing a version. Candidates are the document's protocol_version and each version in
 * supported_versions whose URL is HTTPS on the host that served poppy.json; the agent takes the
 * newest compatible with one it implements. A version document is fetched without following a
 * redirect, must carry the version it is listed under and no supported_versions, and must have the
 * same organization.domain and auth.issuer, so a new version cannot change the Company. When no
 * candidate is compatible, the agent uses none.
 * Left out: the issuer each version selects through its own protected resource metadata; the model
 * compares auth.issuer only.
 */
export function chooseVersion(doc: PoppyDocument, host: string, web: Web, implemented: readonly string[]): { version: string; url: string | null; doc: PoppyDocument } | Stop {
  const offered = [doc.protocol_version!, ...Object.keys(doc.supported_versions ?? {})];
  const usable = offered
    .filter((v) => implemented.some((mine) => compatible(v, mine)))
    .filter((v) => v === doc.protocol_version || (() => { const url = doc.supported_versions![v]!; return isHttps(url) && new URL(url).host === host; })())
    .sort((a, b) => newer(b, a));
  const version = usable[0];
  if (!version) return stop('read', `no version the document offers, ${offered.join(' or ')}, is compatible with ${implemented.join(' or ')}`);
  if (version === doc.protocol_version) return { version, url: null, doc };
  const url = doc.supported_versions![version]!, answer = get(web, url);
  if (answer === 'timeout' || answer.status !== 200) return stop('read', `the ${version} document at ${url} could not be used`);
  const other = answer.body as PoppyDocument;
  if (other.protocol_version !== version || other.supported_versions !== undefined) return stop('read', `the document listed as ${version} says it is ${other.protocol_version}`);
  if (other.organization?.domain?.toLowerCase() !== doc.organization?.domain?.toLowerCase() || other.auth?.issuer !== doc.auth?.issuer)
    return stop('read', `the ${version} document names another Company`);
  return { version, url, doc: other };
}

/**
 * 3.4: an endpoint that verifies the Session header also checks Poppy-Version, and answers a
 * missing one, or one compatible with no version it serves, with 400 version_unsupported. It never
 * handles the request under another version. Null means the version is accepted.
 */
export function checkPoppyVersion(header: string | undefined, served: readonly string[]): { status: 400; error: 'version_unsupported' } | null {
  if (header && served.some((v) => compatible(header, v))) return null;
  return { status: 400, error: 'version_unsupported' };
}

/**
 * 3.4: after version_unsupported the agent fetches poppy.json again without its cache and chooses
 * again. A different version: a new Session, and the request sent once more. Otherwise, or after
 * that one retry, it stops.
 */
export function afterVersionUnsupported(sent: string, chosenAgain: string | null, retried: boolean): string {
  return chosenAgain && chosenAgain !== sent && !retried ? 'start a new Session and send the request again, once' : 'stop sending the request';
}

// 3.3 Extensions, in outline.

/** 3.3: names without a domain are reserved for extensions defined with the protocol; anyone else starts the name with a domain they control. */
export const isReservedExtension = (name: string) => !name.includes('/');

/**
 * 3.3: the version of an extension the agent declares: one the Company lists and the agent
 * supports. Unknown extensions and versions are ignored. The draft does not say which to choose
 * when both sides share several; the model takes the highest.
 */
export function extensionVersion(doc: PoppyDocument, name: string, supported: readonly string[]): string | null {
  const shared = (doc.extensions?.[name] ?? []).map((e) => e.version).filter((v) => supported.includes(v));
  return shared.sort((a, b) => Number(b) - Number(a))[0] ?? null;
}

/**
 * 3.3: a Company may refuse a request it handles only with an extension the request does not
 * declare in a version the Company lists: 403 extension_required, naming it.
 * Left out: a request that uses the extension itself without declaring it.
 */
export function extensionRequired(doc: PoppyDocument, declared: Record<string, string>, name: string): { status: 403; error: 'extension_required'; extension: string } | null {
  const v = declared[name];
  return v && (doc.extensions?.[name] ?? []).some((e) => e.version === v) ? null : { status: 403, error: 'extension_required', extension: name };
}

// The web of the story: the real shop, its second domain, three forgeries and a small shop.

/** The issuer's metadata from the draft's example (3.2), built on chapter 1's. */
export const AS_METADATA = {
  ...ISSUER_METADATA,
  token_endpoint: 'https://auth.example.com/oauth/token',
  revocation_endpoint: 'https://auth.example.com/oauth/revoke',
  grant_types_supported: ['refresh_token', 'authorization_code'],
  protected_resources: [...ISSUER_METADATA.protected_resources, 'https://mcp.example.com/mcp'],
} as const;

/** example.com's poppy.json: chapter 1's, with the draft example's sign-in scopes, tasks and an older version. */
export const REAL_DOC: PoppyDocument = {
  ...POPPY_JSON,
  supported_versions: { '0.3': 'https://example.com/poppy/0.3.json' },
  auth: { scopes: { 'orders:read': 'See your orders, returns, and bookings', 'orders:write': 'Exchange or return items, and change bookings' } },
  tasks: { endpoint: 'https://api.example.com/poppy/tasks' },
};
const { supported_versions: _versions, ...REAL_DOC_03_BASE } = REAL_DOC;

const prm = (domain: string, servers: string[]): WebAnswer => ({ status: 200, body: { resource: `https://${domain}`, authorization_servers: servers } });
const page = (body: PoppyDocument): WebAnswer => ({ status: 200, body });
const org = (domain: string) => ({ name: 'Example Company', domain });

/** Every answer the story's web gives. */
export const BASE_WEB: Web = {
  // The real shop: www redirects to the bare domain, which names auth.example.com, which lists it back.
  [wellKnownUrl('www.example.com')]: { status: 301, location: wellKnownUrl('example.com') },
  [wellKnownUrl('example.com')]: page(REAL_DOC),
  'https://example.com/poppy/0.3.json': page({ ...REAL_DOC_03_BASE, protocol_version: '0.3' }),
  [prmUrl('example.com')]: prm('example.com', [COMPANY.issuer]),
  [asMetadataUrl(COMPANY.issuer)]: { status: 200, body: AS_METADATA },
  // The same Company's second domain, with its own document and the same issuer.
  [wellKnownUrl('example.co.uk')]: page({ ...REAL_DOC_03_BASE, organization: { name: 'Example Company UK', domain: 'example.co.uk' }, apis: [{ type: 'openapi', url: 'https://api.example.co.uk/openapi.json' }] }),
  [prmUrl('example.co.uk')]: prm('example.co.uk', [COMPANY.issuer]),
  // A lookalike domain serving a copy of example.com's document, its API pointed at itself.
  [wellKnownUrl('examp1e.com')]: page({ ...REAL_DOC, apis: [{ type: 'openapi', url: 'https://api.examp1e.com/openapi.json' }] }),
  // A domain that names itself truthfully, and claims example.com's issuer.
  [wellKnownUrl('evil.example')]: page({ ...REAL_DOC_03_BASE, organization: org('evil.example'), apis: [{ type: 'openapi', url: 'https://api.evil.example/openapi.json' }] }),
  [prmUrl('evil.example')]: prm('evil.example', [COMPANY.issuer]),
  // A domain that redirects to a file someone uploaded to example.com, naming example.com.
  [wellKnownUrl('deals.example')]: { status: 302, location: 'https://example.com/uploads/poppy.json' },
  'https://example.com/uploads/poppy.json': page({ ...REAL_DOC_03_BASE, apis: [{ type: 'openapi', url: 'https://api.deals.example/openapi.json' }] }),
  // A small shop with no issuer: a website, signed-out Sessions only.
  [wellKnownUrl('corner.example')]: page({ protocol_version: '0.4', organization: { name: 'Corner Shop', domain: 'corner.example' }, web: {} }),
};

/** Who serves the document the agent fetches: the events a reader chooses between. */
export type Server = 'shop' | 'uk' | 'copy' | 'claim' | 'upload' | 'small' | 'outage';
export const SERVER_ORDER: readonly Server[] = ['shop', 'copy', 'claim', 'upload', 'small', 'outage', 'uk'];
/** For each: the domain the agent starts from, the web it sees and the issuer it already knows. */
export const SERVERS: Record<Server, { start: string; web: Web; known: string | null }> = {
  shop: { start: 'www.example.com', web: BASE_WEB, known: null },
  uk: { start: 'example.co.uk', web: BASE_WEB, known: null },
  copy: { start: 'examp1e.com', web: BASE_WEB, known: null },
  claim: { start: 'evil.example', web: BASE_WEB, known: null },
  upload: { start: 'deals.example', web: BASE_WEB, known: null },
  small: { start: 'corner.example', web: BASE_WEB, known: null },
  // example.com on a day its metadata does not answer, to an agent that has met it before.
  outage: { start: 'example.com', web: { ...BASE_WEB, [prmUrl('example.com')]: 'timeout' }, known: COMPANY.issuer },
};
/** The three forgeries and the one check that stops each (section 3, 10.3). */
export const FORGERIES = { upload: 'fetch', copy: 'read', claim: 'listed' } as const satisfies Partial<Record<Server, Gate>>;

// The machine: the reader chooses who serves the document, then the agent runs its checks in order.

/** Pressing a check: the event name the reader sees, for each check. */
export type CheckEvent = 'fetch' | 'read' | 'find issuer' | 'confirm';
const GATE_OF: Record<CheckEvent, Gate> = { fetch: 'fetch', read: 'read', 'find issuer': 'issuer', confirm: 'listed' };
export type DiscoveryEvent = Server | CheckEvent;
/** Every event, in the order the player shows its buttons. */
export const EVENTS: readonly DiscoveryEvent[] = [...SERVER_ORDER, 'fetch', 'read', 'find issuer', 'confirm'];

/** The world: who serves the document, and how many checks the agent has run on it. */
export type World = { server: Server; ran: number };
export const start = (): World => ({ server: 'shop', ran: 0 });

/** One check's result: whether it passed, and what it found in a few words (a URL, a domain, an issuer). */
export type GateResult = { gate: Gate; ok: boolean; found: string };
/** The agent's decision, once it has one. */
export type Verdict = { accepted: true; company: string; signIn: boolean; userId: string } | { accepted: false; gate: Gate; reason: string };

/** The checks run so far and their results, computed from the model's own steps, and the verdict once there is one. */
export function progress(w: World): { results: GateResult[]; verdict: Verdict | null; fetched: Fetched | null } {
  const { start: from, web, known } = SERVERS[w.server], results: GateResult[] = [];
  const refused = (s: Stop) => ({ results: [...results, { gate: s.stopped, ok: false, found: '' }], verdict: { accepted: false as const, gate: s.stopped, reason: s.reason } });
  if (w.ran < 1) return { results, verdict: null, fetched: null };
  const fetched = fetchDocument(web, from);
  if (isStop(fetched)) return { ...refused(fetched), fetched: null };
  results.push({ gate: 'fetch', ok: true, found: fetched.url });
  if (w.ran < 2) return { results, verdict: null, fetched };
  const read = readDocument(fetched, web);
  if (isStop(read)) return { ...refused(read), fetched };
  results.push({ gate: 'read', ok: true, found: read.domain });
  if (w.ran < 3) return { results, verdict: null, fetched };
  const found = findIssuer(read, web, known);
  if (isStop(found)) return { ...refused(found), fetched };
  results.push({ gate: 'issuer', ok: true, found: found.issuer ?? 'none' });
  const accept = (): Verdict => {
    const company = companyOf(read.domain, found.issuer);
    return { accepted: true, company, signIn: found.issuer !== null && !read.doc.auth?.disabled, userId: userIdAt(company) };
  };
  if (!found.issuer) return { results, verdict: accept(), fetched };
  if (w.ran < 4) return { results, verdict: null, fetched };
  const confirmed = confirmIssuer(found.issuer, read.domain, web);
  if (isStop(confirmed)) return { ...refused(confirmed), fetched };
  results.push({ gate: 'listed', ok: true, found: `https://${read.domain}` });
  return { results, verdict: accept(), fetched };
}

/** Why each check cannot run before the one ahead of it. */
const NOT_YET: Record<Gate, string> = {
  fetch: '',
  read: 'the agent has fetched no document yet, so there is nothing to read',
  issuer: 'the agent has not read organization.domain yet, so it does not know whose metadata to ask',
  listed: 'the agent has found no issuer yet, so there is no one to ask',
};
const ALREADY: Record<Gate, string> = {
  fetch: 'the agent has already fetched the document',
  read: 'the agent has already read the document',
  issuer: 'the agent has already found the issuer',
  listed: 'the agent has already asked the issuer',
};

/**
 * The world after `event`, or why the event cannot happen, written to follow the event's name.
 * A check that fails still happens: the world records that it ran, and `progress` says it refused.
 */
export function next(w: World, event: DiscoveryEvent): World | Refusal {
  if (!(event in GATE_OF)) {
    const server = event as Server;
    if (server === w.server && w.ran === 0) return refuse(`the agent is already about to fetch ${SERVERS[server].start}’s poppy.json`);
    return { server, ran: 0 };
  }
  const gate = GATE_OF[event as CheckEvent], index = GATES.indexOf(gate), { verdict } = progress(w);
  if (index < w.ran) return refuse(ALREADY[gate]);
  if (verdict && !verdict.accepted) return refuse(`the agent refused this document at the ${GATE_NAME[verdict.gate]} check, so it checks nothing more`);
  // A gate not yet run after an acceptance can only be the issuer's listing of a Company with no issuer.
  if (verdict?.accepted) return refuse(`${SERVERS[w.server].start} has no issuer, so there is nothing to confirm`);
  if (index > w.ran) return refuse(NOT_YET[gate]);
  return { ...w, ran: w.ran + 1 };
}

/** The events of the story, in order: what the steps replay. */
export const STORY: readonly DiscoveryEvent[] = [
  'fetch', 'read', 'find issuer', 'confirm',
  'copy', 'fetch', 'read',
  'claim', 'fetch', 'read', 'find issuer', 'confirm',
  'upload', 'fetch',
  'small', 'fetch', 'read', 'find issuer',
  'outage', 'fetch', 'read', 'find issuer',
  'uk', 'fetch', 'read', 'find issuer', 'confirm',
];
