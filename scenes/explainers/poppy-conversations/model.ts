import { refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
import { AGENT, COMPANY, POPPY_JSON, USER_IDS } from '../poppy/model.ts';

// Poppy (Personal Agent Protocol, draft 0.4), section 8: a conversation between the User's Personal
// Agent and a Company. Two layers, both pure.
//
// The wire layer holds single rules of the section: choosing the protocol (8.1), IDs and who owns a
// conversation (8.2), request IDs that make retries safe (8.3), what a message may carry (8.4),
// reading events from a cursor (8.5), resuming a stream (8.6), the state fields (8.7), who wrote a
// message (8.8), opening a Direct Conversation (8.10) and the authorization event (8.11).
//
// The table layer is the world the explainer's reader drives: one conversation between the agent
// and example.com, and the Direct Conversations opened from it, with four parties: your agent, you,
// the Company Agent and a person at the Company. It uses the wire layer's state rules, so the two
// cannot disagree. Its limits are stated beside the rules they qualify; in short, it leaves out
// sign-in (which the wire layer holds), cursors and event IDs (a read takes everything the Company
// has done), streaming, data, context and extensions, as_of hints, versions, and the Company's
// inactivity timeouts.

// ---------------------------------------------------------------------------------------------
// The wire layer
// ---------------------------------------------------------------------------------------------

/** The conversation endpoint example.com's poppy.json lists (3.1, 8.1). */
export const ENDPOINT = POPPY_JSON.agent.protocols[0].endpoint;
/** The Conversation ID of the specification's examples (8.3). */
export const CONVERSATION_ID = 'cnv_8f3Kd2';
/** The person at the Company in the specification's examples (8.7). */
export const PERSON = { id: 'aut_alex', name: 'Alex' } as const;
/** The User ID the agent uses at example.com, from chapter 1's model (5.1). */
export const USER_ID = USER_IDS[COMPANY.domain];
/** The account the User signs in to at example.com: what the conversation is tied to once it uses it (8.2, 8.11). */
export const ACCOUNT = 'A';

/** 8.1: the agent takes the first entry whose type it supports, and skips types it does not know. */
export type ProtocolEntry = { type: string; endpoint: string };
export function chooseProtocol(entries: readonly ProtocolEntry[], supported: readonly string[] = ['poppy']): ProtocolEntry | null {
  return entries.find((e) => supported.includes(e.type)) ?? null;
}

/** 8.2: Conversation, request, message and event IDs are 1 to 256 characters of URL-safe base64. */
export const isId = (id: string) => /^[A-Za-z0-9_-]{1,256}$/.test(id);

/** Who started a conversation (8.2): the agent's client_id, the User ID, and the account once it uses one. */
export type Owner = { client: string; userId: string; account: string | null };
/** Who is asking now: the same three, the account being the one its access token is for (null signed out), and its Session. */
export type Caller = { client: string; userId: string; account: string | null; session: string };
/** Who owns the explainer's conversation when it starts: chapter 1's agent and User ID, and no account yet. */
export const OWNER: Owner = { client: AGENT.clientId, userId: USER_ID, account: null };
export type Continuation =
  | { status: 'continues'; owner: Owner }
  | { status: 401; error: 'insufficient_scope'; challenge: true }
  | { status: 404; error: 'conversation_not_found' };

/**
 * 8.2's table, and 8.11. A request continues a conversation only when the agent and the User ID
 * match and, once the conversation has used an account, the request is signed in to that account.
 * A request signed out after that gets a challenge, as an account action does; any other mismatch
 * gets conversation_not_found, the same answer as for an ID that does not exist. The Session is not
 * part of ownership, so a conversation outlasts the Session that started it; agent IDs are not part
 * of it either (they are not modelled). The first signed-in request makes the conversation use that
 * account. Left out: version_mismatch, which a Company MAY return for a Session of other versions.
 */
export function continueAs(owner: Owner, caller: Caller): Continuation {
  const notFound = { status: 404, error: 'conversation_not_found' } as const;
  if (caller.client !== owner.client || caller.userId !== owner.userId) return notFound;
  if (owner.account === null) return { status: 'continues', owner: { ...owner, account: caller.account } };
  if (caller.account === null) return { status: 401, error: 'insufficient_scope', challenge: true };
  if (caller.account !== owner.account) return notFound;
  return { status: 'continues', owner };
}

/** A POST the Company accepted (8.3): its request ID, its path without the query, its body, and what it answered. */
export type Accepted = { id: string; path: string; body: string; response: string };
export type Submission =
  | { status: 'acted'; accepted: readonly Accepted[]; response: string }
  | { status: 'repeated'; accepted: readonly Accepted[]; response: string }
  | { status: 409; error: 'request_id_conflict' }
  | { status: 400; error: 'invalid_request' };

/** A URL's path: query parameters such as cursor and wait are not part of it (8.3). */
export const pathOf = (url: string) => url.split('?')[0]!;

/**
 * 8.3, request IDs. `accepted` is every POST the Company accepted for this User, across all their
 * conversations, since a request ID is unique for the User. The same ID, path and body is a retry:
 * the Company answers what it answered first and does not act again, which is how a retried first
 * message gets back the conversation it already started. The same ID with another path or body is
 * request_id_conflict. A missing or malformed ID is invalid_request (8.13). Left out: how long the
 * Company keeps the check (as long as the conversation).
 */
export function submit(accepted: readonly Accepted[], request: { id?: string; url: string; body: unknown }, act: () => string): Submission {
  if (request.id === undefined || !isId(request.id)) return { status: 400, error: 'invalid_request' };
  const path = pathOf(request.url), body = JSON.stringify(request.body);
  const seen = accepted.find((a) => a.id === request.id);
  if (seen) return seen.path === path && seen.body === body ? { status: 'repeated', accepted, response: seen.response } : { status: 409, error: 'request_id_conflict' };
  const response = act();
  return { status: 'acted', accepted: [...accepted, { id: request.id, path, body, response }], response };
}

/** 8.8: who wrote a message, as author.type says. */
export type AuthorType = 'agent' | 'human';
/** Where the words of a message on the User's side came from. */
export type Words = 'agent' | 'user’s own words' | 'summary' | 'paraphrase' | 'translation';
/** 8.8: human only for the User's own words; a summary, paraphrase or translation of them is the agent's. */
export const authorFor = (words: Words): AuthorType => (words === 'user’s own words' ? 'human' : 'agent');

/** A message as either side sends it (8.4). */
export type Message = {
  id?: string;
  role?: 'user' | 'company';
  as_of_request?: string;
  as_of_cursor?: string;
  author: { type: AuthorType; id?: string; name?: string; image?: string };
  text?: string;
  data?: Record<string, unknown>;
  context?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};
export type Side = 'personal agent' | 'company';

/**
 * 8.4, what a message may carry, by the side that sends it; gives each rule it breaks. It needs
 * author.type and at least one of text, data, context or extensions. A message a person wrote
 * (author.type human) carries neither as_of field, since which messages a person had read is not
 * known. as_of_request is the Company Agent's, as_of_cursor the Personal Agent's. Only Company
 * messages name their author (id, name, image), and only the Personal Agent sends context.
 * Left out: the formats of locale, time_zone and user_available, and extension versions (3.4).
 */
export function problemsOf(message: Message, from: Side): string[] {
  const problems: string[] = [];
  if (message.author?.type !== 'agent' && message.author?.type !== 'human') problems.push('author.type must be agent or human');
  if ([message.text, message.data, message.context, message.extensions].every((field) => field === undefined)) problems.push('a message needs text, data, context or extensions');
  if (message.author?.type === 'human' && (message.as_of_request !== undefined || message.as_of_cursor !== undefined)) problems.push('a person’s message carries no as_of field');
  if (from === 'personal agent' && message.as_of_request !== undefined) problems.push('as_of_request is for the Company Agent’s messages');
  if (from === 'company' && message.as_of_cursor !== undefined) problems.push('as_of_cursor is for the Personal Agent’s messages');
  if (from === 'personal agent' && (message.author?.id ?? message.author?.name ?? message.author?.image) !== undefined) problems.push('only Company messages name their author');
  if (from === 'company' && message.context !== undefined) problems.push('only the Personal Agent sends context');
  return problems;
}

/**
 * 8.4 and 8.5: how the Company records a message as an event. It sets id and role itself, ignoring
 * any the Personal Agent sent: the request's ID for the agent's messages, its own for its own.
 */
export function record(message: Message, from: Side, id: string): Message {
  return { ...message, id, role: from === 'company' ? 'company' : 'user' };
}

/** 8.4: a message's context updates the facts it names; fields it leaves out keep their values. */
export const mergeContext = (before: Record<string, unknown>, message: Message) => ({ ...before, ...(message.context ?? {}) });

/** The four state fields (8.7), each independent of the others. */
export type Handoff = 'none' | 'pending';
export type Responder = 'agent' | 'human';
export type Conv = { working: boolean; handoff: Handoff; responder: Responder; closed: boolean };
/** 8.7: a new conversation starts with handoff none, responder agent and closed false. */
export const NEW_CONVERSATION: Conv = { working: false, handoff: 'none', responder: 'agent', closed: false };

/**
 * 8.7: what the state fields allow together. A closed conversation is not working and has no
 * handoff pending; while handoff is pending, responder stays agent.
 */
export const consistent = (c: Conv) => (!c.closed || (!c.working && c.handoff === 'none')) && (c.handoff !== 'pending' || c.responder === 'agent');

/** 8.7: a state event is added when handoff, responder or closed changes; a change of working adds none. */
export const addsStateEvent = (before: Conv, after: Conv) => before.handoff !== after.handoff || before.responder !== after.responder || before.closed !== after.closed;

/** 8.7: values a later version may add: an unknown handoff is read as pending, an unknown responder as human. */
export function interpret(raw: { handoff: string; responder: string }): { handoff: Handoff; responder: Responder } {
  return { handoff: raw.handoff === 'none' ? 'none' : 'pending', responder: raw.responder === 'agent' ? 'agent' : 'human' };
}

/** An event in a conversation's list (8.5). The Company chooses its ID, which is also a cursor. */
export type ConvEvent = { id: string; type: string };
/** 8.5: the event types this version defines. A Personal Agent skips any other. */
export const EVENT_TYPES = ['message', 'state', 'authorization', 'user_requested', 'direct_opened', 'direct_closed'] as const;

export type Read =
  | { events: readonly ConvEvent[]; cursor: string | null; has_more: boolean }
  | { status: 400; error: 'invalid_cursor' }
  | { status: 410; error: 'cursor_expired' };

/**
 * 8.5, one read. `events` is the conversation's whole list and `kept` how many of its first events
 * the Company still has gone (it keeps events as long as it chooses). The read returns the events
 * after the cursor, at most `limit`, from the beginning without one; its cursor is the last event
 * returned, or the request's cursor when none were; has_more says to read again at once. A cursor
 * that is not an event of this conversation is invalid_cursor; one whose following events the
 * Company no longer has is cursor_expired. Left out: wait (a read here never holds), and the state
 * fields, which every read also carries (the table layer holds them).
 */
export function readEvents(events: readonly ConvEvent[], cursor: string | null, limit: number, gone = 0): Read {
  let from = gone;
  if (cursor !== null) {
    const at = events.findIndex((e) => e.id === cursor);
    if (at < 0) return { status: 400, error: 'invalid_cursor' };
    if (at + 1 < gone) return { status: 410, error: 'cursor_expired' };
    from = at + 1;
  }
  const page = events.slice(from, from + limit);
  return { events: page, cursor: page.at(-1)?.id ?? cursor, has_more: from + limit < events.length };
}

/**
 * 8.5: the Personal Agent handles events in order, skips types it does not recognise, and skips
 * event IDs it has already handled, since a read after a reconnect can return them again. Gives the
 * events to act on and every ID now handled. It never compares or sorts cursors.
 */
export function handle(handled: ReadonlySet<string>, events: readonly ConvEvent[]): { act: ConvEvent[]; handled: Set<string> } {
  const now = new Set(handled), act: ConvEvent[] = [];
  for (const event of events) {
    if (now.has(event.id)) continue;
    now.add(event.id);
    if ((EVENT_TYPES as readonly string[]).includes(event.type)) act.push(event);
  }
  return { act, handled: now };
}

/** 8.6: reconnecting a stream, Last-Event-ID takes the place of cursor and wins when both are sent. */
export const resumeFrom = (request: { cursor?: string; lastEventId?: string }) => request.lastEventId ?? request.cursor ?? null;

/**
 * 8.6: text-delta pieces of a message are shown as they come and replaced by the whole message
 * event; after a reconnect, pieces of a message not received whole are dropped.
 */
export function shownText(pieces: readonly { message_id: string; text: string }[], whole: readonly Message[], reconnected: boolean): Record<string, string> {
  const shown: Record<string, string> = {};
  if (!reconnected) for (const p of pieces) shown[p.message_id] = (shown[p.message_id] ?? '') + p.text;
  for (const m of whole) if (m.id && m.text !== undefined) shown[m.id] = m.text;
  return shown;
}

/**
 * 8.11: the event the Company adds when the Company Agent needs the User's account. Its error is
 * insufficient_scope whether or not the request carried a token, and it names the scopes needed.
 */
export const authorizationEvent = (id: string, scopes: readonly string[], _hadToken: boolean) => ({ id, type: 'authorization' as const, error: 'insufficient_scope' as const, scope: scopes.join(' ') });

/** A conversation the Company stores, for opening Direct Conversations (8.10). */
export type Stored = {
  owner: Owner;
  parent: string | null;
  closed: boolean;
  events: readonly ConvEvent[];
  /** The open Direct Conversation, if any. */
  openDirect: string | null;
  /** user_requested event ID → the Direct Conversation opened on it. */
  openedOn: Readonly<Record<string, string>>;
};
export type DirectAnswer =
  | { status: 201; conversation_id: string; repeated: boolean }
  | { status: 404; error: 'conversation_not_found' }
  | { status: 409; error: 'conversation_closed' }
  | { status: 409; error: 'direct_conversation_open'; conversation_id: string }
  | { status: 400; error: 'invalid_request' };

/**
 * 8.10, starting a Direct Conversation: a new conversation, linked by parent_conversation_id.
 * Ownership of the parent is checked first. Repeating the same parent and user_requested event ID
 * gives back the same Direct Conversation, even after it closed, and adds no message. Otherwise a
 * user_requested_event_id that names no user_requested event of that parent is invalid_request; a
 * request without a message is valid only when it accepts such an event; and the parent must be
 * open (conversation_closed), not a Direct Conversation itself (invalid_request), and without an
 * open Direct Conversation (direct_conversation_open, naming it). The order of these last three
 * checks is the order the specification lists them in; it does not say which comes first.
 */
export function openDirect(
  store: Readonly<Record<string, Stored>>,
  caller: Caller,
  request: { parent: string; userRequestedEventId?: string; message?: Message },
): DirectAnswer {
  const parent = store[request.parent];
  if (!parent || continueAs(parent.owner, caller).status !== 'continues') return { status: 404, error: 'conversation_not_found' };
  const event = request.userRequestedEventId;
  if (event !== undefined && parent.openedOn[event] !== undefined) return { status: 201, conversation_id: parent.openedOn[event]!, repeated: true };
  if (event !== undefined && !parent.events.some((e) => e.id === event && e.type === 'user_requested')) return { status: 400, error: 'invalid_request' };
  if (request.message === undefined && event === undefined) return { status: 400, error: 'invalid_request' };
  if (parent.closed) return { status: 409, error: 'conversation_closed' };
  if (parent.parent !== null) return { status: 400, error: 'invalid_request' };
  if (parent.openDirect !== null) return { status: 409, error: 'direct_conversation_open', conversation_id: parent.openDirect };
  return { status: 201, conversation_id: `${request.parent}_d${Object.keys(parent.openedOn).length + 1}`, repeated: false };
}

// The rules on one conversation's state that both layers use.

/**
 * 8.9, asking for a person: handoff becomes pending while the Company looks. If handoff is already
 * pending, or a person is already handling it, the request changes nothing.
 */
export const askForPerson = (c: Conv): Conv => (c.handoff === 'pending' || c.responder === 'human' ? c : { ...c, handoff: 'pending' });
/** 8.9: a person joins: handoff becomes none and responder human. */
export const personJoins = (c: Conv): Conv => ({ ...c, handoff: 'none', responder: 'human' });
/** 8.9: nobody is available: handoff goes back to none with responder still agent (the Company Agent says why, in a message). */
export const nobodyAvailable = (c: Conv): Conv => ({ ...c, handoff: 'none', responder: 'agent' });

/**
 * How this Company's help desk treats a cancelled request for a person (8.9): one that can
 * withdraw it stops looking, and one that cannot (a request already routed to someone) keeps
 * looking. Both are allowed, so the Personal Agent must not depend on a cancel taking effect.
 */
export type Desk = 'withdraws' | 'keeps looking';
/** 8.9: withdrawing a request for a person. A cancel when handoff is not pending changes nothing. */
export const cancelPerson = (c: Conv, desk: Desk): Conv => (c.handoff === 'pending' && desk === 'withdraws' ? { ...c, handoff: 'none' } : c);
/** 8.12: closing sets closed, stops looking for a person, and leaves nothing working; responder stays whoever handled it last. */
export const closeConv = (c: Conv): Conv => ({ ...c, closed: true, working: false, handoff: 'none' });

/**
 * 8.10 and 8.12: closing a parent also closes its open Direct Conversation. Gives both after the close.
 */
export const closeParent = (parent: Conv, direct: Conv | null): [Conv, Conv | null] => [closeConv(parent), direct && !direct.closed ? closeConv(direct) : direct];

/** The errors section 8.13 defines for the requests this model sends, with their statuses. */
export const ERRORS = {
  conversation_not_found: 404,
  conversation_closed: 409,
  direct_conversation_open: 409,
  request_id_conflict: 409,
  invalid_cursor: 400,
  cursor_expired: 410,
  invalid_request: 400,
  extension_required: 403,
  version_mismatch: 409,
} as const;
export type ErrorCode = keyof typeof ERRORS;

// ---------------------------------------------------------------------------------------------
// The table layer: the world the reader drives
// ---------------------------------------------------------------------------------------------

/** The four parties at the table: two on the User's side, two on the Company's. */
export type Speaker = 'agent' | 'you' | 'company agent' | 'person';
/** 8.8: you and a person at the Company are human; the two agents are AIs. */
export const authorOf = (speaker: Speaker): AuthorType => (speaker === 'you' || speaker === 'person' ? 'human' : 'agent');
/** 8.4: the side a message comes from, as the Company records it in role. */
export const roleOf = (speaker: Speaker): 'user' | 'company' => (speaker === 'agent' || speaker === 'you' ? 'user' : 'company');

/**
 * What is said, short enough to read on a phone. The agent's, yours and the Company Agent's first
 * lines abridge the specification's own examples (8.3, 8.5, 8.7, 8.8, 8.10); the rest are ours.
 */
export const LINES = {
  cold: 'Jacket 1042 is too cold.',
  insulated: 'Insulated, in medium?',
  medium: 'Medium, please.',
  question: 'Hi, about my exchange.',
  offer: 'Insulated: $70 more?',
  stock: 'Yes, in stock. Exchange?',
  size: 'Which size, please?',
  confirm: 'Medium it is. Done.',
  finding: 'Finding a specialist.',
  help: 'Sure. Which size?',
  nobody: 'Nobody is free just now.',
  decline: 'They can’t talk just now.',
} as const;
export type LineKey = keyof typeof LINES;

/** One turn of speech: who said it, what, and at which table (the conversation, or the Direct Conversation). */
export type Turn = { speaker: Speaker; line: LineKey; at: 'main' | 'direct' };

export type TableEvent = 'ask' | 'you' | 'read' | 'person' | 'joins' | 'nobody' | 'invite' | 'direct' | 'close';
/** Every event, in the order the player shows its buttons: the agent's requests, then the Company's moves. */
export const TABLE_EVENTS: readonly TableEvent[] = ['ask', 'you', 'read', 'person', 'joins', 'nobody', 'invite', 'direct', 'close'];

/**
 * The table. `main` is the conversation the agent started, with its four state fields (null before
 * its first message). `direct` is the Direct Conversation opened from it: null before one, its state
 * fields while it is open, and only 'closed' once it has closed (the table forgets who handled it).
 * `invited` is whether the Company has asked for the User with a user_requested event the agent has
 * not answered. `said` is the latest turn of speech, the one the picture shows.
 */
export type World = { main: Conv | null; direct: Conv | 'closed' | null; invited: boolean; said: Turn | null };

export const start = (): World => ({ main: null, direct: null, invited: false, said: null });

/** The Direct Conversation, when one is open. */
export const openDirectOf = (w: World): Conv | null => (w.direct && w.direct !== 'closed' ? w.direct : null);
/** Where the User's words, a read and a close go: the open Direct Conversation, else the conversation. */
export const activeOf = (w: World): 'main' | 'direct' | null => (openDirectOf(w) ? 'direct' : w.main ? 'main' : null);

/** The conversation at `at`, changed. */
const put = (w: World, at: 'main' | 'direct', c: Conv): World => (at === 'main' ? { ...w, main: c } : { ...w, direct: c });

/**
 * What the Company side says when the agent reads, by the table, who is handling it and what was
 * said last. A person who has been told the size confirms it, and asks for it otherwise; in a
 * Direct Conversation opened on the Company's invitation, while a person is still being found, the
 * Company Agent says so.
 */
function replyOf(w: World, at: 'main' | 'direct', c: Conv): Turn {
  const told = w.said?.at === at && (w.said.line === 'medium' || w.said.line === 'insulated');
  if (c.responder === 'human') return { speaker: 'person', line: told ? 'confirm' : 'size', at };
  if (told) return { speaker: 'company agent', line: 'stock', at };
  if (at === 'direct') return { speaker: 'company agent', line: c.handoff === 'pending' ? 'finding' : 'help', at };
  return { speaker: 'company agent', line: 'offer', at };
}

/**
 * The world after `event`, or the reason it cannot happen, written to follow the event's name.
 *
 * A request the Company would answer with conversation_closed or direct_conversation_open (8.13) is
 * refused here, with that error in the reason: it changes nothing on the Company's side, and the
 * model keeps no record of answers, so the reader learns it from the refusal. A request the
 * specification says "changes nothing" (a second handoff request, a second close) is refused the
 * same way, with that in the reason.
 *
 * Left out of this layer: cancelling a request for a person (8.9). Whether a cancel takes effect
 * is the Company's choice, so the wire layer holds it (`cancelPerson`, with both kinds of help
 * desk), and the explainer says it in words.
 *
 * Limits of this layer: the Company acts on a handoff request, a cancel or a close as it accepts it
 * (8.3 lets it act later, in order); a message makes the conversation `working` until the agent
 * reads the reply, and a read takes everything the Company has done (8.5's cursor, has_more and wait
 * are the wire layer's). The Company hands off only when asked (8.9 also lets it do so on its own),
 * asks for the User only in the conversation, and never closes a conversation itself (8.12 lets it,
 * after inactivity). The story opens one Direct Conversation (see `bound`). Sign-in, ownership and
 * retries are the wire layer's.
 */
export function next(w: World, event: TableEvent): World | Refusal {
  const main = w.main, direct = openDirectOf(w);
  const none = (what: string) => refuse(`there is no conversation yet to ${what}: it starts with the agent’s first message (8.3)`);
  /** 8.10 and 8.12: messages, handoff requests and cancels to the conversation while it is closed, or paused by a Direct Conversation. */
  const blocked = (): Refusal | null =>
    main?.closed ? refuse('the conversation is closed, so the Company answers 409 conversation_closed (8.12)')
    : direct ? refuse('a Direct Conversation is open, so the Company answers 409 direct_conversation_open and the conversation waits (8.10)')
    : null;

  /**
   * A limit of this model, not a rule of the specification: the Company asks for the User, and the
   * agent brings the User in, only once the conversation has settled, with nothing working and no
   * person being looked for. It keeps the Direct Conversation's story apart from the handoff's.
   */
  const settling = (c: Conv): Refusal | null =>
    c.working ? refuse('the Company is still working on the conversation; in this model, you are brought in once working is false')
    : c.handoff === 'pending' ? refuse('handoff is pending in the conversation; in this model, you are brought in once that is settled')
    : null;

  switch (event) {
    case 'ask': {
      // 8.3: the first message starts the conversation (201); later ones go to its messages URL (202).
      // A successful POST means accepted, not acted on, so the conversation is working.
      // 8.8: these are the agent's own words, so author.type is agent.
      if (!main) return { ...w, main: { ...NEW_CONVERSATION, working: true }, said: { speaker: 'agent', line: 'cold', at: 'main' } };
      const stop = blocked();
      if (stop) return stop;
      // 8.10: if the User declines or is not available, the agent says so in the conversation.
      if (w.invited) return { ...put(w, 'main', { ...main, working: true }), invited: false, said: { speaker: 'agent', line: 'decline', at: 'main' } };
      return { ...put(w, 'main', { ...main, working: true }), said: { speaker: 'agent', line: 'insulated', at: 'main' } };
    }
    case 'you': {
      // 8.8 and 8.10: your own words go as written, with author.type human: to the Direct
      // Conversation when one is open, else to the conversation itself.
      if (direct) return { ...w, direct: { ...direct, working: true }, said: { speaker: 'you', line: 'medium', at: 'direct' } };
      if (!main) return { ...w, main: { ...NEW_CONVERSATION, working: true }, said: { speaker: 'you', line: 'cold', at: 'main' } };
      if (main.closed) return blocked()!;
      if (w.invited) return refuse('the Company has asked for you, so your agent asks you first: it opens a Direct Conversation if you agree, or says no for you (8.10)');
      return { ...put(w, 'main', { ...main, working: true }), said: { speaker: 'you', line: 'medium', at: 'main' } };
    }
    case 'read': {
      // 8.3 and 8.5: the reply is read as events, and the agent reads until working is false.
      const at = activeOf(w);
      if (!at) return none('read');
      const c = at === 'main' ? main! : direct!;
      if (!c.working) return refuse('working is false, so the agent already has the Company’s whole reply (8.7)');
      return { ...put(w, at, { ...c, working: false }), said: replyOf(w, at, c) };
    }
    case 'person': {
      if (!main) return none('ask in');
      const stop = blocked();
      if (stop) return stop;
      if (w.invited) return refuse('the Company has asked for you; in this model your agent answers that first');
      // 8.9: asking again while one is being found, or while a person handles it, changes nothing.
      if (main.handoff === 'pending') return refuse('handoff is already pending, so asking again changes nothing (8.9)');
      if (main.responder === 'human') return refuse(`${PERSON.name}, a person, is handling the conversation already, so asking changes nothing (8.9)`);
      return put(w, 'main', askForPerson(main));
    }
    case 'joins':
    case 'nobody': {
      // The Company's move: it answers the conversation where handoff is pending.
      const at = direct?.handoff === 'pending' ? 'direct' : main?.handoff === 'pending' && !main.closed ? 'main' : null;
      if (!at) return refuse('handoff is none: nobody is looking for a person (in this model the Company hands off only when asked)');
      const c = at === 'main' ? main! : direct!;
      // 8.7: a person who joins starts writing, which is work in progress, so working is true until the agent reads.
      if (event === 'joins') return { ...put(w, at, { ...personJoins(c), working: true }), said: null };
      // 8.9: nobody available: back to none, responder still agent, and the Company Agent says why.
      return { ...put(w, at, nobodyAvailable(c)), said: { speaker: 'company agent', line: 'nobody', at } };
    }
    case 'invite': {
      // 8.10: the Company asks for the User with a user_requested event, which changes no state field.
      if (!main) return none('ask for you in');
      if (main.closed) return refuse('the conversation is closed; in this model the Company adds nothing more to it');
      if (direct) return refuse('you are talking with the Company yourself already, in the Direct Conversation');
      if (w.invited) return refuse('the Company has asked for you already, and your agent has not answered yet');
      const busy = settling(main);
      if (busy) return busy;
      return { ...w, invited: true };
    }
    case 'direct': {
      // 8.10: only the Personal Agent starts a Direct Conversation, so you decide when you are brought in.
      if (!main) return refuse('there is no conversation yet to link a Direct Conversation to (8.10)');
      if (main.closed) return refuse('the conversation is closed, so the Company answers 409 conversation_closed (8.10)');
      if (direct) return refuse('one is open already, and a conversation has one open Direct Conversation at a time: 409 direct_conversation_open (8.10)');
      const busy = settling(main);
      if (busy) return busy;
      // A new conversation (8.7's starting state), working at once. On the Company's invitation the
      // agent sends no message and the Company speaks first, waiting for a person (handoff pending,
      // as 8.10 allows); otherwise it starts with your own words.
      if (w.invited) return { ...w, invited: false, direct: { ...NEW_CONVERSATION, working: true, handoff: 'pending' }, said: null };
      return { ...w, direct: { ...NEW_CONVERSATION, working: true }, said: { speaker: 'you', line: 'question', at: 'direct' } };
    }
    case 'close': {
      if (!main) return none('close');
      const at = direct ? 'direct' : 'main', c: Conv = direct ?? main;
      const which = at === 'direct' ? 'the Direct Conversation' : 'the conversation';
      if (c.closed) return refuse(`${which} is closed already, so another close changes nothing (8.12)`);
      // 8.12: a close does not wait its turn and may drop what the Company has not acted on.
      if (c.working) return refuse(`the Company is still working on ${which}, and a close does not wait its turn, so the agent reads until working is false first (8.12)`);
      // 8.10: closing the Direct Conversation opens the conversation to messages again, and the
      // picture goes back to it, where nothing has been said since.
      // Closing the conversation ends the Company's invitation too, and clears the table.
      return at === 'direct' ? { ...w, direct: 'closed', said: null } : { ...put(w, at, closeConv(c)), invited: false, said: null };
    }
  }
}

/**
 * Where the explainer's story stops though the model would go on: it opens one Direct
 * Conversation. The specification allows another once the first has closed (8.10).
 */
export function bound(w: World, event: TableEvent): string | undefined {
  if (w.direct === 'closed' && (event === 'direct' || event === 'invite')) return 'this story opens one Direct Conversation; Poppy allows another once the first has closed';
  return undefined;
}

/** The rule of the draft that the picture of a state shows: its section, and what it says in the reader's words. */
export type Rule = { section: string; says: string };
export function ruleOf(w: World): Rule {
  const { main, said } = w, direct = openDirectOf(w);
  if (!main) return { section: '8.3', says: 'A conversation starts with its first message.' };
  if (main.closed) return { section: '8.12', says: 'Closed: no more messages, and its events stay readable.' };
  if (w.invited) return { section: '8.10', says: 'The Company asks for you, and only your agent can bring you in.' };
  if (direct) return { section: '8.10', says: 'A Direct Conversation is linked to the first, which waits; your agent may observe.' };
  if (main.handoff === 'pending') return { section: '8.9', says: 'While the Company looks for a person, handoff is pending and its agent keeps answering.' };
  if (w.direct === 'closed' && said === null) return { section: '8.10', says: 'The Direct Conversation has closed, so the conversation takes messages again.' };
  if (main.working) return { section: '8.3', says: 'Accepted is not answered: the agent reads until working is false.' };
  if (said && authorOf(said.speaker) === 'human' && roleOf(said.speaker) === 'company') return { section: '8.7', says: 'A person at the Company wrote this: its author.type is human.' };
  return { section: '8.8', says: 'Every message says whether a person or an AI wrote it.' };
}

/** The events of the story, in order: what the steps replay. */
export const STORY: readonly TableEvent[] = ['ask', 'read', 'person', 'joins', 'read', 'invite', 'direct', 'joins', 'read', 'you', 'read', 'close'];
