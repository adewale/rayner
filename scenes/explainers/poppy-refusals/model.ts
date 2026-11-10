import { refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
import { AGENT, COMPANY, OPERATIONS, POPPY_JSON, SCOPES, SID, USER_IDS, answer, sign } from '../poppy/model.ts';
import type { AccessToken, HttpRequest, Operation, Scope, SessionJwt } from '../poppy/model.ts';

// Poppy (Personal Agent Protocol, draft 0.4), chapter 6: what the agent does when the Company says
// no. Chapter 1's answer() decides whether a request's Session header verifies and what its access
// token allows (5.3, section 7); this model wraps it with the refusals chapter 1 leaves out (a rate
// limit, the protocol version, an ended Session, a required extension, a token for one service) and
// adds the other half: the agent's one right response to each refusal, from the error table of
// section 7.
//
// What it leaves out, each beside the rule it qualifies below: time (token lifetimes, how long a
// Company remembers an ended Session, the clock behind Retry-After), real signatures and real
// delegations (an expired delegation is a flag), DPoP, the account a Session used before (5.4's
// session_ended for an account change), conversations (which carry over to a new Session, 8.11), the
// website (which may be fetched again without the header after invalid_session, 5.2), and what the
// User approves at a sign-in (here they approve every scope asked for).

/** The API types this version defines (section 7). The example Company lists one of each, as the draft's example poppy.json does (section 3). */
export const MCP_URL = 'https://mcp.example.com/mcp';
export const APIS = [...POPPY_JSON.apis, { type: 'mcp', url: MCP_URL }] as const;
/** The resource of a token that works at all of a Company's services (4.5): https://{organization.domain}. */
export const DEFAULT_RESOURCE = `https://${COMPANY.domain}`;
/** The MCP server's protected resource metadata URL, as RFC 9728 §3.1 derives it from the server's url, and what it says. */
export const MCP_METADATA = 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp';
export const METADATA: Readonly<Record<string, { resource: string }>> = { [MCP_METADATA]: { resource: MCP_URL } };
/** The seconds a rate-limited Company asks the agent to wait, in Retry-After (5.6). */
export const RETRY_AFTER = 30;
/** The Session ID the agent chooses at random for a new Session (5.2); the first is chapter 1's SID. */
export const NEW_SID = 'Kp8mR3';

/** The services a request goes to: the OpenAPI service takes the default token; the MCP server takes only tokens issued for it (section 7). */
export type Service = { type: 'openapi' | 'mcp'; resource: string };
const SERVICES: Record<Service['type'], Service> = { openapi: { type: 'openapi', resource: DEFAULT_RESOURCE }, mcp: { type: 'mcp', resource: MCP_URL } };

export type OpKey = 'order' | 'exchange' | 'sizes';
export type Op = Operation & { service: Service['type'] };
/**
 * Chapter 1's API operations, and one call to the MCP server: a sizing tool that reads past orders
 * (an assumption: the draft's example server does "product search and sizing", and names no tool).
 */
export const OPS: Record<OpKey, Op> = {
  order: { ...OPERATIONS.order, service: 'openapi' },
  exchange: { ...OPERATIONS.exchange, service: 'openapi' },
  sizes: { channel: 'api', method: 'POST', url: MCP_URL, path: '/mcp', needs: 'orders:read', ok: 200, service: 'mcp' },
};

/** An access token: chapter 1's, with the resource it was issued for (4.5; none means the default) and whether it has expired. */
export type Token = AccessToken & { resource?: string; expired?: boolean };
/** A Session JWT: chapter 1's, with whether its delegation has expired (5.2: a real Company checks exp in the delegation). */
export type Session = SessionJwt & { dlgExpired?: boolean };
/** An extension the agent declares in Poppy-Extensions, with the version it uses (3.4). */
export type Declared = { name: string; v: string };
/** A request with the headers this chapter reads: Poppy-Version and Poppy-Extensions beside the Session header (3.4). */
export type PoppyRequest = Omit<HttpRequest, 'token' | 'session'> & { token?: Token; session?: Session; version?: string; extensions?: readonly Declared[] };

export type Code = 'invalid_token' | 'insufficient_scope' | 'invalid_session' | 'session_ended' | 'version_unsupported' | 'extension_required';
/** What the Company answers: a status, an error code, and what the refusal names (a scope, an extension, a wait, a metadata URL). */
export type Reply = { status: number; error?: Code; needs?: Scope; reason?: string; extension?: string; retryAfter?: number; resourceMetadata?: string };

/** What the Company is doing that a request can run into. */
export type Company = {
  /** The protocol versions it serves (3.4). Chapter 1's poppy.json is 0.4 and lists no supported_versions. */
  serves: readonly string[];
  /** The sids of Sessions it ended and remembers (5.5), or 'all' for a Company that ends every Session it sees. */
  ended: readonly string[] | 'all';
  /** Seconds to wait when this agent is over its rate limit (5.6), or null. Left out: the clock; a wait ends the limit here. */
  retryAfter: number | null;
  /** Operations it handles only with an extension, and the versions of it the Company lists (3.3). */
  requires: Partial<Record<OpKey, { name: string; versions: readonly string[] }>>;
};
export const EXAMPLE_COMPANY: Company = { serves: [POPPY_JSON.protocol_version], ended: [], retryAfter: null, requires: {} };

const versionParts = (v: string) => v.split('.').map(Number) as [number, number];
/** 3.4: two versions are compatible when they share the major version and, before 1.0, the minor version. */
export function compatible(a: string, b: string): boolean {
  const [am, an] = versionParts(a), [bm, bn] = versionParts(b);
  return am === bm && (am >= 1 || an === bn);
}
/**
 * 3.4: the agent chooses the newest version, among protocol_version and supported_versions, that is
 * compatible with one it implements; with none, it uses none of them (null).
 */
export function choose(doc: { protocol_version: string; supported_versions?: Readonly<Record<string, string>> }, implemented: readonly string[]): string | null {
  const usable = [doc.protocol_version, ...Object.keys(doc.supported_versions ?? {})].filter((v) => implemented.some((i) => compatible(i, v)));
  const newer = (a: string, b: string) => { const [am, an] = versionParts(a), [bm, bn] = versionParts(b); return am !== bm ? am > bm : an > bn; };
  return usable.reduce<string | null>((best, v) => (best === null || newer(v, best) ? v : best), null);
}

/** Section 7 and 3.3: access token errors go in WWW-Authenticate; the others in a JSON body; a 429 says how long in Retry-After (5.6). */
export function carriedIn(reply: Reply): 'WWW-Authenticate' | 'JSON body' | 'Retry-After header' | 'none' {
  if (reply.status === 429) return 'Retry-After header';
  if (reply.status === 401 || reply.error === 'insufficient_scope') return 'WWW-Authenticate';
  return reply.error ? 'JSON body' : 'none';
}

/**
 * 5.3: why Session errors are 400. An OAuth library treats a 401 as a problem with the access token
 * and discards the token; this is that library's rule, so a Session error sent as 401 would cost a
 * good token.
 */
export const libraryKeepsToken = (reply: Reply) => reply.status !== 401;

/**
 * Chapter 1's answer() looks an operation up by its URL among chapter 1's operations, which have no
 * MCP call. Its Session and token checks do not depend on which URL it is, so an MCP request is
 * re-addressed to chapter 1's order (which needs the same scope, orders:read), its header with it
 * when the header was signed for the MCP request, and left unmatched otherwise.
 */
function forChapterOne(request: PoppyRequest, op: Op): HttpRequest {
  const token = request.token ? { ...request.token, revoked: !!(request.token.revoked || request.token.expired) } : undefined;
  const r = { ...request, ...(token ? { token } : {}) };
  if (op.service === 'openapi') return r;
  const stand = OPERATIONS.order, s = request.session;
  const signedForThis = !!s && s.htm === request.method && s.htu === request.url;
  return { ...r, method: stand.method, url: stand.url, ...(s ? { session: signedForThis ? { ...s, htm: stand.method, htu: stand.url } : s } : {}) };
}

/**
 * What the Company answers, in this model's order. The draft orders the Session checks before
 * relying on the Session (5.3) and gives each refusal its code, but does not order the refusals
 * against one another; this order is the model's choice, and each request below runs into one.
 *
 * 1. Over the rate limit: 429 with Retry-After, on any endpoint (5.6).
 * 2. The Session header: chapter 1's checks, and an expired delegation (5.2): 400 invalid_session.
 * 3. Poppy-Version missing or not compatible with a served version: 400 version_unsupported (3.4).
 * 4. A Session the Company ended and remembers: 400 session_ended (5.5).
 * 5. An extension the request needs and does not declare in a listed version: 403 extension_required (3.3).
 * 6. A token not issued for this service: 401 invalid_token, with resource_metadata at the MCP server (4.5, section 7).
 * 7. The account: chapter 1's 401 with no code, 401 invalid_token, 403 insufficient_scope (section 7).
 *    An MCP server's challenges carry resource_metadata (section 7).
 */
export function respond(request: PoppyRequest, company: Company = EXAMPLE_COMPANY): Reply {
  if (company.retryAfter !== null) return { status: 429, retryAfter: company.retryAfter };
  const op = Object.values(OPS).find((o) => o.method === request.method && o.url === request.url);
  if (!op) return { status: 404 };
  const service = SERVICES[op.service], s = request.session;
  if (s?.dlgExpired) return { status: 400, error: 'invalid_session', reason: 'the header’s delegation has expired' };
  const account = answer(forChapterOne(request, op));
  if (account.error === 'invalid_session') return account;
  if (!request.version || !company.serves.some((v) => compatible(v, request.version!))) return { status: 400, error: 'version_unsupported' };
  if (s && (company.ended === 'all' || company.ended.includes(s.sid))) return { status: 400, error: 'session_ended' };
  const needed = company.requires[(Object.keys(OPS) as OpKey[]).find((k) => OPS[k] === op)!];
  if (needed && !request.extensions?.some((d) => d.name === needed.name && needed.versions.includes(d.v)))
    return { status: 403, error: 'extension_required', extension: needed.name };
  const metadata = service.type === 'mcp' ? { resourceMetadata: MCP_METADATA } : {};
  // Left out (an ambiguity): what resource_metadata an API that takes the default token names when it refuses another service's token.
  if (request.token && (request.token.resource ?? DEFAULT_RESOURCE) !== service.resource) return { status: 401, error: 'invalid_token', ...metadata };
  return account.status === 401 || account.status === 403 ? { ...account, ...metadata } : account;
}

/** What the agent holds when a refusal comes back, which decides its remedy. */
export type Holding = {
  /** The access token it sent, if any. */
  token: Token | undefined;
  /** The scopes its refresh token covers, or null for no refresh token. */
  refresh: readonly Scope[] | null;
  /** Whether the User signed out or disconnected the agent (5.5). */
  signedOut: boolean;
  /** Whether this request was already sent again once, after session_ended, version_unsupported or extension_required. */
  resent: boolean;
  /** The protocol version its Session uses, and the versions it implements (3.4). */
  version: string;
  implements: readonly string[];
  /** The extension versions it implements, and the versions the Company's poppy.json lists (3.3). */
  extensions: readonly Declared[];
  offered: Readonly<Record<string, readonly string[]>>;
};

/** The agent's next move. Each is the one the error table names (section 7). */
export type Move =
  | { kind: 'done' }
  | { kind: 'refresh'; scope?: Scope; resource?: string }
  | { kind: 'sign-in'; scopes: readonly Scope[] }
  | { kind: 'signed-out' }
  | { kind: 'fix' }
  | { kind: 'new-session' }
  | { kind: 'reread' }
  | { kind: 'declare'; extension: Declared }
  | { kind: 'wait'; seconds: number }
  | { kind: 'stop'; why: string };

/**
 * The remedy for a reply, from section 7's error table and the sections it cites.
 *
 * - 401 with no code: handled as insufficient_scope (section 7).
 * - 403 insufficient_scope: a refresh token that covers the scope (4.4), or sign in again (5.4),
 *   requesting every scope still needed, the old ones too (4.7); unless the User signed out or
 *   disconnected the agent (5.5), when it continues signed out and does not ask again.
 * - 401 invalid_token: refresh (4.4); with resource_metadata naming another resource, a token with
 *   resource set to it (4.5, RFC 8707); with no refresh token, or after sign-out, refresh fails and
 *   the agent continues signed out (5.5).
 * - 400 invalid_session: a new Session does not fix it; stop until the cause is fixed (section 7).
 * - 400 session_ended: a new Session and one more send; if that gets session_ended too, stop (5.5).
 * - 400 version_unsupported: fetch poppy.json again, uncached, and choose again; another version
 *   means a new Session and one more send, otherwise stop (3.4). The choice is made after the fetch:
 *   see pursue().
 * - 403 extension_required: the draft names no remedy. The model's reading: the extensions a Session
 *   declares are fixed for it (3.4), so the agent declares the extension in a new Session if it
 *   implements a version the Company lists, and sends once more; otherwise it stops.
 * - 429: wait at least Retry-After before sending again (5.6).
 */
export function remedy(reply: Reply, h: Holding): Move {
  if (reply.status < 400) return { kind: 'done' };
  if (reply.status === 429) return { kind: 'wait', seconds: reply.retryAfter ?? 0 };
  const resource = reply.resourceMetadata ? METADATA[reply.resourceMetadata]?.resource : undefined;
  const forResource = resource && resource !== DEFAULT_RESOURCE ? { resource } : {};
  if ((reply.status === 401 && !reply.error) || reply.error === 'insufficient_scope') {
    if (h.signedOut) return { kind: 'signed-out' };
    const needs = reply.needs!;
    if (h.refresh?.includes(needs)) return { kind: 'refresh', scope: needs, ...forResource };
    return { kind: 'sign-in', scopes: SCOPES.filter((s) => s === needs || h.refresh?.includes(s)) };
  }
  switch (reply.error) {
    case 'invalid_token':
      return h.signedOut || !h.refresh ? { kind: 'signed-out' } : { kind: 'refresh', ...forResource };
    case 'invalid_session':
      return { kind: 'fix' };
    case 'session_ended':
      return h.resent ? { kind: 'stop', why: 'the new Session got session_ended too' } : { kind: 'new-session' };
    case 'version_unsupported':
      return h.resent ? { kind: 'stop', why: 'the request was already sent again under a newly chosen version' } : { kind: 'reread' };
    case 'extension_required': {
      const name = reply.extension!, listed = h.offered[name] ?? [];
      const usable = h.extensions.find((d) => d.name === name && listed.includes(d.v));
      if (!usable) return { kind: 'stop', why: `the agent does not implement a version of ${name} the Company lists` };
      return h.resent ? { kind: 'stop', why: `the request was already sent again declaring ${name}` } : { kind: 'declare', extension: usable };
    }
    default:
      return { kind: 'stop', why: `the draft names no remedy for ${reply.status}` };
  }
}

// The agent as this chapter needs it, and its loop: send, read the refusal, apply the one remedy, send again.

const DEFAULT_TOKEN: Token = { value: 'at_Qp4w', client: AGENT.clientId, scopes: ['orders:read', 'orders:write'] };
const MCP_TOKEN: Token = { value: 'at_Mc2p', client: AGENT.clientId, scopes: ['orders:read', 'orders:write'], resource: MCP_URL };

type Agent = {
  token: Token | null; mcpToken: Token | null; refresh: readonly Scope[] | null; signedOut: boolean;
  sid: string; version: string; dlgExpired: boolean; extensions: readonly Declared[]; resent: boolean;
};
/** How a run starts: the agent's and the Company's departures from a healthy signed-in errand. */
export type Setup = {
  company?: Company; token?: Token | false; tokenExpired?: boolean; scopes?: readonly Scope[]; dlgExpired?: boolean;
  version?: string; sid?: string; mcpKey?: boolean;
  /** false for an agent that ignores the "once" rule, to show what it prevents. */
  once?: boolean;
  /** The most sends a run makes. */
  limit?: number;
};
/** The agent implements 0.3 and 0.4, so an old copy of poppy.json can leave it on 0.3. */
const IMPLEMENTS = ['0.3', '0.4'] as const;

function agentFrom(o: Setup): Agent {
  const scopes = o.scopes ?? DEFAULT_TOKEN.scopes;
  const token = o.token === false ? null : o.token ?? { ...DEFAULT_TOKEN, scopes, ...(o.tokenExpired ? { expired: true } : {}) };
  return { token, mcpToken: o.mcpKey ? MCP_TOKEN : null, refresh: scopes, signedOut: false, sid: o.sid ?? SID, version: o.version ?? '0.4', dlgExpired: !!o.dlgExpired, extensions: [], resent: false };
}

/** The request the agent sends: the Session header always (5.2), Poppy-Version beside it (3.4), and the token for the service it goes to (4.5). */
function requestOf(key: OpKey, a: Agent): PoppyRequest {
  const op = OPS[key], token = op.needs ? (op.service === 'mcp' ? a.mcpToken ?? a.token : a.token) : null;
  const base = { method: op.method, url: op.url, ...(token ? { token } : {}) };
  const session: Session = { ...sign(AGENT, base, USER_IDS[COMPANY.domain], a.sid), ...(a.dlgExpired ? { dlgExpired: true } : {}) };
  return { ...base, session, version: a.version, extensions: a.extensions };
}

/** A healthy request to an operation, and the Company it goes to. */
export function healthy(key: OpKey = 'exchange', o: Setup = {}) {
  return { request: requestOf(key, agentFrom(o)), company: o.company ?? EXAMPLE_COMPANY };
}

/** The troubles the reader can cause, each sending the request into one refusal. */
export type Trouble = 'expire' | 'read-only' | 'delegation' | 'end' | 'old-copy' | 'too-fast' | 'mcp';
export const TROUBLES: readonly Trouble[] = ['expire', 'read-only', 'delegation', 'end', 'old-copy', 'too-fast', 'mcp'];
/** The operation a trouble sends: the jacket exchange, or the MCP sizing call. */
export const opFor = (t: Trouble): OpKey => (t === 'mcp' ? 'sizes' : 'exchange');

/** How each trouble departs from a healthy errand. */
export function agentAfter(t: Trouble, o: Setup = {}): Setup {
  const departs: Record<Trouble, Setup> = {
    expire: { tokenExpired: true },
    'read-only': { scopes: ['orders:read'] },
    delegation: { dlgExpired: true },
    end: { company: { ...EXAMPLE_COMPANY, ended: [o.sid ?? SID] } },
    'old-copy': { version: '0.3' },
    'too-fast': { company: { ...EXAMPLE_COMPANY, retryAfter: RETRY_AFTER } },
    mcp: {},
  };
  return { ...o, ...departs[t] };
}
/** The request a trouble sends, and the Company it meets. */
export function troubled(t: Trouble, o: Setup = {}) {
  return healthy(opFor(t), agentAfter(t, o));
}

/** One send of a run: the Session it was sent in, the reply, and the agent's move. */
export type Sent = { sid: string; reply: Reply; move: Move };

/**
 * The agent pursuing one request: send, read the reply, apply the remedy, send again, until it is
 * done or stops. The User approves every scope a sign-in asks for. After a fresh poppy.json, the
 * agent chooses again: a version other than the one it used means a new Session and one more send;
 * the same one means it stops (3.4), and the run records that stop as the move.
 */
export function pursue(key: OpKey, o: Setup = {}): Sent[] {
  let a = agentFrom(o), company = o.company ?? EXAMPLE_COMPANY;
  const run: Sent[] = [], once = o.once ?? true;
  const newSession = (sid: string) => (sid === SID ? NEW_SID : `${sid}+`);
  for (let i = 0; i < (o.limit ?? 4); i++) {
    const reply = respond(requestOf(key, a), company);
    const held: Holding = { token: requestOf(key, a).token, refresh: a.refresh, signedOut: a.signedOut, resent: once && a.resent, version: a.version, implements: IMPLEMENTS, extensions: a.extensions, offered: {} };
    let move = remedy(reply, held);
    if (move.kind === 'reread') {
      const doc = { protocol_version: company.serves[0]!, supported_versions: Object.fromEntries(company.serves.slice(1).map((v) => [v, `https://${COMPANY.domain}/poppy/${v}.json`])) };
      const chosen = choose(doc, IMPLEMENTS);
      if (!chosen || chosen === a.version) move = { kind: 'stop', why: 'poppy.json, fetched again, offers no other version the agent implements' };
      else a = { ...a, version: chosen };
    }
    run.push({ sid: a.sid, reply, move });
    switch (move.kind) {
      case 'refresh': {
        const fresh: Token = { value: `${move.resource ? 'at_Mc' : 'at_Rf'}${i}`, client: AGENT.clientId, scopes: a.refresh!, ...(move.resource ? { resource: move.resource } : {}) };
        a = move.resource ? { ...a, mcpToken: fresh } : { ...a, token: fresh };
        break;
      }
      case 'sign-in':
        a = { ...a, refresh: move.scopes, token: { value: `at_Sg${i}`, client: AGENT.clientId, scopes: move.scopes } };
        break;
      case 'fix':
        a = { ...a, dlgExpired: false };
        break;
      case 'new-session':
      case 'reread':
        a = { ...a, sid: newSession(a.sid), resent: true };
        break;
      case 'declare':
        a = { ...a, extensions: [...a.extensions, move.extension], sid: newSession(a.sid), resent: true };
        break;
      case 'wait':
        company = { ...company, retryAfter: null };
        break;
      default:
        return run;
    }
  }
  return run;
}

// The machine the scene drives. A trouble sends the request and the Company answers; a fix is the
// reader's prediction of the agent's remedy, taken when it is the one the error table names and
// refused, with the reason, when it is not: a Poppy agent does not apply the wrong one.

export type Fix = 'refresh' | 'sign-in' | 'fix' | 'new-session' | 'reread' | 'wait';
export const FIXES: readonly Fix[] = ['refresh', 'sign-in', 'fix', 'new-session', 'reread', 'wait'];
export type RefusalEvent = Trouble | Fix;
/** Every event, in the order the player shows its buttons: the troubles, then the remedies. */
export const REFUSAL_EVENTS: readonly RefusalEvent[] = [...TROUBLES, ...FIXES];

/** What was last sent: the trouble, the Company's reply, the remedy taken (null while it waits), and the reply to the send after it. */
export type Last = { trouble: Trouble; reply: Reply; fix: Fix | null; again: Reply | null };
/**
 * The errand as the reader sees it. `cart` is whether the agent is still in its first Session, whose
 * cart holds the medium from chapter 1; a new Session leaves it behind (5.5). Later Sessions are not
 * told apart: the model keeps no sid after the first. `mcpKey` is whether the agent holds a token
 * issued for the MCP server.
 */
export type World = { cart: boolean; mcpKey: boolean; last: Last | null };
export const start = (): World => ({ cart: true, mcpKey: false, last: null });

/** Whether a refusal is waiting for the agent's remedy. */
export const pending = (w: World) => !!w.last && w.last.fix === null && w.last.reply.status >= 400;
/** A reply in a few words: its status and code. */
export const sayReply = (r: Reply) => `${r.status}${r.error ? ` ${r.error}` : ''}`;

const FIX_OF: Partial<Record<Move['kind'], Fix>> = { refresh: 'refresh', 'sign-in': 'sign-in', fix: 'fix', 'new-session': 'new-session', reread: 'reread', wait: 'wait' };
const FIX_WORDS: Record<Fix, string> = { refresh: 'a refresh', 'sign-in': 'a new sign-in', fix: 'a fix to the header', 'new-session': 'a new Session', reread: 'a fresh copy of poppy.json', wait: 'a wait' };

/** Why `chosen` is the wrong remedy for this refusal, whose right one is `right`: a clause that follows the remedy's name. */
function wrongReason(chosen: Fix, right: Fix, last: Last): string {
  const { reply, trouble } = last, code = reply.error ?? String(reply.status), what = trouble === 'mcp' ? 'sizing call' : 'exchange';
  if (reply.status === 429) return `429 says the agent is sending too often; it waits at least ${reply.retryAfter} s and sends the same request`;
  if (chosen === 'new-session' && reply.error === 'invalid_session') return 'a new Session does not fix invalid_session: the same header fails in any Session, so the agent stops and fixes the cause';
  if ((chosen === 'refresh' || chosen === 'sign-in') && reply.status === 400) return `${code} is a 400: the access token is fine, so the agent keeps it`;
  if (chosen === 'refresh' && right === 'sign-in') return `the refresh token covers only ${agentAfter(trouble).scopes?.join(' ')}, and a refresh cannot add ${reply.needs}, so the agent asks you`;
  if (chosen === 'sign-in' && right === 'refresh') return `the refresh token still covers what the ${what} needs, so the agent refreshes without asking you`;
  if (chosen === 'wait') return `${code} asks for ${FIX_WORDS[right]}, and waiting will not change the answer`;
  return `${code} asks for ${FIX_WORDS[right]}, not ${FIX_WORDS[chosen]}`;
}

/**
 * The errand after an event, or the reason the event cannot happen, written to follow its name.
 * A trouble is sent from a healthy errand; its effects last until its remedy is taken. The remedy
 * and the send after it are pursue()'s first two sends of the same trouble.
 */
export function next(w: World, event: RefusalEvent): World | Refusal {
  if ((TROUBLES as readonly string[]).includes(event)) {
    const trouble = event as Trouble;
    if (pending(w)) return refuse(`the agent has a refusal to answer first: ${sayReply(w.last!.reply)}`);
    const t = troubled(trouble, { mcpKey: w.mcpKey, sid: w.cart ? SID : NEW_SID });
    return { ...w, last: { trouble, reply: respond(t.request, t.company), fix: null, again: null } };
  }
  const fix = event as Fix;
  if (!pending(w)) return refuse('nothing has been refused, so there is nothing to remedy');
  const last = w.last!, run = pursue(opFor(last.trouble), agentAfter(last.trouble, { mcpKey: w.mcpKey, sid: w.cart ? SID : NEW_SID }));
  const right = FIX_OF[run[0]!.move.kind];
  if (!right) return refuse(`the agent stops: ${'why' in run[0]!.move ? run[0]!.move.why : 'the draft names no remedy'}`);
  if (fix !== right) return refuse(wrongReason(fix, right, last));
  return {
    cart: w.cart && fix !== 'new-session' && fix !== 'reread',
    mcpKey: w.mcpKey || last.trouble === 'mcp',
    last: { ...last, fix, again: run[1]!.reply },
  };
}

/** The events of the story, in order: what the steps replay. */
export const STORY: readonly RefusalEvent[] = [
  'expire', 'refresh', 'read-only', 'sign-in', 'delegation', 'fix', 'end', 'new-session', 'old-copy', 'reread', 'mcp', 'refresh', 'too-fast', 'wait',
];
