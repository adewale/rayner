import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal } from '../../../explain/index.ts';
import { AGENT, POPPY_JSON, THIEF } from '../poppy/model.ts';
import {
  ACCOUNT, CONVERSATION_ID, ENDPOINT, ERRORS, EVENT_TYPES, LINES, NEW_CONVERSATION, OWNER, STORY, TABLE_EVENTS, USER_ID,
  activeOf, addsStateEvent, askForPerson, authorFor, authorOf, authorizationEvent, bound, cancelPerson, chooseProtocol, closeConv,
  closeParent, consistent, continueAs, handle, interpret, isId, mergeContext, next, nobodyAvailable, openDirect, openDirectOf,
  pathOf, personJoins, problemsOf, readEvents, record, resumeFrom, roleOf, ruleOf, shownText, start, submit,
  type Accepted, type Caller, type Conv, type ConvEvent, type Stored, type TableEvent, type World,
} from './model.ts';

// Each test names the section of the Personal Agent Protocol draft 0.4 it holds the model to
// (https://personalagentprotocol.org/docs/0.4/spec, section 8). The specification was read, not
// run: there is no reference implementation here, so these pin the model to the draft's rules and
// examples.

/** The world after these events, each of which must be taken. */
const play = (events: readonly TableEvent[], from: World = start()) =>
  events.reduce<World>((w, e) => {
    const after = next(w, e);
    assert.ok(!isRefusal(after), `${e} was refused: ${isRefusal(after) ? after.reason : ''}`);
    return after as World;
  }, from);
const reasonOf = (w: World, e: TableEvent) => { const n = next(w, e); return isRefusal(n) ? n.reason ?? '' : null; };
/** Every state the events reach from the start, breadth first, stopping where the story's bound does. */
function reachable(): World[] {
  const seen = new Map<string, World>([[JSON.stringify(start()), start()]]);
  for (const queue = [start()]; queue.length; ) {
    const w = queue.shift()!;
    for (const e of TABLE_EVENTS) {
      if (bound(w, e)) continue;
      const n = next(w, e);
      if (!isRefusal(n) && !seen.has(JSON.stringify(n))) { seen.set(JSON.stringify(n), n); queue.push(n); }
    }
  }
  return [...seen.values()];
}
const caller = (o: Partial<Caller> = {}): Caller => ({ client: AGENT.clientId, userId: USER_ID, account: null, session: 'Yx2b7Q', ...o });

test('8.1: the agent uses the first conversation protocol it supports and skips types it does not know', () => {
  assert.equal(chooseProtocol(POPPY_JSON.agent.protocols)?.endpoint, 'https://api.example.com/poppy/conversations');
  assert.equal(ENDPOINT, 'https://api.example.com/poppy/conversations');
  assert.deepEqual(chooseProtocol([{ type: 'chatml', endpoint: 'https://x' }, { type: 'poppy', endpoint: 'https://y' }]), { type: 'poppy', endpoint: 'https://y' });
  assert.equal(chooseProtocol([{ type: 'chatml', endpoint: 'https://x' }]), null);
});

test('8.2: IDs are 1 to 256 characters of letters, digits, - and _', () => {
  for (const id of [CONVERSATION_ID, 'msg_Yq3v8LrT0aWc5NkE', 'evt_c2', 'a', 'x'.repeat(256), 'A-b_9']) assert.ok(isId(id), id);
  for (const id of ['', 'x'.repeat(257), 'evt.c2', 'msg c', 'a/b', 'é']) assert.ok(!isId(id), id);
});

test('8.2: a conversation continues only for its own agent and User ID, and once it used account A, only for A', () => {
  const before = OWNER, after = { ...OWNER, account: ACCOUNT };
  const outcome = (owner: typeof OWNER, c: Caller) => { const r = continueAs(owner, c); return r.status === 'continues' ? `continues, uses ${r.owner.account ?? 'no account'}` : `${r.status} ${r.error}`; };
  // The rows and columns of 8.2's table.
  assert.deepEqual(
    [caller(), caller({ account: 'A' }), caller({ account: 'B' }), caller({ userId: 'usr_m4Tz9P' }), caller({ client: THIEF.clientId })].map((c) => [outcome(before, c), outcome(after, c)]),
    [
      ['continues, uses no account', '401 insufficient_scope'],
      ['continues, uses A', 'continues, uses A'],
      ['continues, uses B', '404 conversation_not_found'],
      ['404 conversation_not_found', '404 conversation_not_found'],
      ['404 conversation_not_found', '404 conversation_not_found'],
    ],
  );
  const challenge = continueAs(after, caller());
  assert.ok(challenge.status === 401 && challenge.challenge, 'signed out after the account is used: a challenge, as an account action gets (8.11)');
});

test('8.2: the Session is not part of ownership, so a conversation outlasts the Session that started it', () => {
  assert.equal(continueAs(OWNER, caller({ session: 'a-new-session' })).status, 'continues');
  assert.equal(continueAs({ ...OWNER, account: ACCOUNT }, caller({ session: 'a-new-session', account: ACCOUNT })).status, 'continues');
});

test('8.3: a retried POST with the same ID, path and body gets the first answer and is not acted on again', () => {
  let acted = 0;
  const act = () => `{"conversation_id":"${CONVERSATION_ID}"}#${++acted}`;
  const first = { id: 'msg_Yq3v8LrT0aWc5NkE', url: ENDPOINT, body: { message: { author: { type: 'agent' }, text: LINES.cold } } };
  const one = submit([], first, act);
  assert.equal(one.status, 'acted');
  const accepted = (one as { accepted: readonly Accepted[] }).accepted;
  // The retry of a first message gets back the conversation it started, and only one was started.
  const again = submit(accepted, first, act);
  assert.deepEqual([again.status, (again as { response: string }).response, acted], ['repeated', `{"conversation_id":"${CONVERSATION_ID}"}#1`, 1]);
  // cursor and wait are query parameters, not part of the path, so a retry may change them.
  assert.equal(submit(accepted, { ...first, url: `${ENDPOINT}?wait=10&cursor=evt_c2` }, act).status, 'repeated');
  assert.equal(pathOf(`${ENDPOINT}/${CONVERSATION_ID}/messages?cursor=evt_c2&wait=10`), `${ENDPOINT}/${CONVERSATION_ID}/messages`);
  // The same ID with another body or path is a conflict, even in another conversation: IDs are unique for the User.
  assert.deepEqual(submit(accepted, { ...first, body: { message: { author: { type: 'agent' }, text: 'other' } } }, act), { status: 409, error: 'request_id_conflict' });
  assert.deepEqual(submit(accepted, { ...first, url: `${ENDPOINT}/cnv_other/messages` }, act), { status: 409, error: 'request_id_conflict' });
  assert.deepEqual(submit(accepted, { url: ENDPOINT, body: {} }, act), { status: 400, error: 'invalid_request' });
  assert.deepEqual(submit(accepted, { id: 'msg.1', url: ENDPOINT, body: {} }, act), { status: 400, error: 'invalid_request' });
  assert.equal(acted, 1);
});

test('8.4: a message needs author.type and some content; a person’s message carries no as_of hint', () => {
  assert.deepEqual(problemsOf({ author: { type: 'agent' }, text: LINES.cold }, 'personal agent'), []);
  assert.deepEqual(problemsOf({ author: { type: 'agent' }, context: { user_available: false } }, 'personal agent'), [], 'a message with only context is a message');
  assert.deepEqual(problemsOf({ author: { type: 'agent' } }, 'personal agent'), ['a message needs text, data, context or extensions']);
  assert.deepEqual(problemsOf({ author: { type: 'human' }, text: 'Medium, please.', as_of_cursor: 'evt_c2' }, 'personal agent'), ['a person’s message carries no as_of field']);
  assert.deepEqual(problemsOf({ author: { type: 'human', id: 'aut_alex', name: 'Alex' }, text: 'Which size?', as_of_request: 'msg_1' }, 'company'), ['a person’s message carries no as_of field']);
  assert.deepEqual(problemsOf({ author: { type: 'agent' }, text: 'x', as_of_request: 'msg_1' }, 'personal agent'), ['as_of_request is for the Company Agent’s messages']);
  assert.deepEqual(problemsOf({ author: { type: 'agent', name: 'Robo' }, text: 'x' }, 'personal agent'), ['only Company messages name their author']);
  assert.deepEqual(problemsOf({ author: { type: 'agent' }, text: 'x', context: { locale: 'en-US' } }, 'company'), ['only the Personal Agent sends context']);
  assert.deepEqual(problemsOf({ author: { type: 'agent' }, text: 'x', as_of_request: 'msg_Hc72PwZn4eKs1QxB' }, 'company'), []);
  assert.deepEqual(problemsOf({ author: {} as { type: 'agent' }, text: 'x' }, 'company'), ['author.type must be agent or human']);
});

test('8.4: the Company sets id and role when it records a message, ignoring any the agent sent; context keeps fields left out', () => {
  assert.deepEqual(record({ id: 'mine', role: 'company', author: { type: 'agent' }, text: 'x' }, 'personal agent', 'msg_Hc72PwZn4eKs1QxB'), { id: 'msg_Hc72PwZn4eKs1QxB', role: 'user', author: { type: 'agent' }, text: 'x' });
  assert.equal(record({ author: { type: 'human' }, text: 'x' }, 'company', 'msg_t8Vn').role, 'company');
  const before = { locale: 'en-US', time_zone: 'America/Los_Angeles', user_available: true };
  assert.deepEqual(mergeContext(before, { author: { type: 'agent' }, context: { user_available: false } }), { ...before, user_available: false });
});

test('8.5: a read returns the events after the cursor, and its cursor is the last one returned or the one it was given', () => {
  const events: ConvEvent[] = ['evt_c1', 'evt_c2', 'evt_c3', 'evt_c4'].map((id) => ({ id, type: 'message' }));
  assert.deepEqual(readEvents(events, null, 10), { events, cursor: 'evt_c4', has_more: false });
  assert.deepEqual(readEvents(events, 'evt_c1', 2), { events: events.slice(1, 3), cursor: 'evt_c3', has_more: true });
  assert.deepEqual(readEvents(events, 'evt_c3', 2), { events: events.slice(3), cursor: 'evt_c4', has_more: false });
  assert.deepEqual(readEvents(events, 'evt_c4', 2), { events: [], cursor: 'evt_c4', has_more: false });
  assert.deepEqual(readEvents(events, 'evt_zz', 2), { status: 400, error: 'invalid_cursor' });
  // The Company no longer has the first two events: a cursor before them has expired; reading from the start works.
  assert.deepEqual(readEvents(events, 'evt_c1', 2, 2), { status: 410, error: 'cursor_expired' });
  assert.deepEqual(readEvents(events, 'evt_c2', 2, 2), { events: events.slice(2), cursor: 'evt_c4', has_more: false });
  assert.deepEqual(readEvents(events, null, 10, 2), { events: events.slice(2), cursor: 'evt_c4', has_more: false });
});

test('8.5: the agent skips event types it does not know and events it has handled already', () => {
  const first = handle(new Set(), [{ id: 'evt_c1', type: 'message' }, { id: 'evt_c2', type: 'typing_v9' }, { id: 'evt_c3', type: 'user_requested' }]);
  assert.deepEqual(first.act.map((e) => e.id), ['evt_c1', 'evt_c3']);
  const again = handle(first.handled, [{ id: 'evt_c3', type: 'user_requested' }, { id: 'evt_c4', type: 'state' }]);
  assert.deepEqual(again.act.map((e) => e.id), ['evt_c4']);
  assert.deepEqual([...EVENT_TYPES], ['message', 'state', 'authorization', 'user_requested', 'direct_opened', 'direct_closed']);
});

test('8.6: a stream resumes from Last-Event-ID, which wins over cursor; pieces of an unfinished message are dropped after a reconnect', () => {
  assert.equal(resumeFrom({ cursor: 'evt_c1', lastEventId: 'evt_c2' }), 'evt_c2');
  assert.equal(resumeFrom({ cursor: 'evt_c1' }), 'evt_c1');
  assert.equal(resumeFrom({}), null);
  const pieces = [{ message_id: 'msg_r2Kq', text: 'I can do that. ' }, { message_id: 'msg_r2Kq', text: 'The insulated' }];
  assert.deepEqual(shownText(pieces, [], false), { msg_r2Kq: 'I can do that. The insulated' });
  assert.deepEqual(shownText(pieces, [{ id: 'msg_r2Kq', author: { type: 'agent' }, text: 'I can do that. The insulated version would be warmer.' }], false), { msg_r2Kq: 'I can do that. The insulated version would be warmer.' });
  assert.deepEqual(shownText(pieces, [], true), {});
});

test('8.7: a new conversation starts with handoff none, responder agent, closed false; unknown values read as pending and human', () => {
  assert.deepEqual(NEW_CONVERSATION, { working: false, handoff: 'none', responder: 'agent', closed: false });
  assert.deepEqual(play(['ask']).main, { ...NEW_CONVERSATION, working: true }, 'working from the moment the Company accepts a request');
  assert.deepEqual(interpret({ handoff: 'queued', responder: 'robot-and-person' }), { handoff: 'pending', responder: 'human' });
  assert.deepEqual(interpret({ handoff: 'none', responder: 'agent' }), { handoff: 'none', responder: 'agent' });
});

test('8.7: a change of handoff, responder or closed adds a state event; a change of working adds none', () => {
  const c: Conv = NEW_CONVERSATION;
  assert.equal(addsStateEvent(c, { ...c, working: true }), false);
  assert.equal(addsStateEvent(c, askForPerson(c)), true);
  assert.equal(addsStateEvent(askForPerson(c), personJoins(askForPerson(c))), true);
  assert.equal(addsStateEvent(c, closeConv(c)), true);
});

test('8.7: in every reachable state both conversations’ fields are consistent: closed is not working, pending keeps responder agent', () => {
  for (const w of reachable()) {
    if (w.main) assert.ok(consistent(w.main), JSON.stringify(w));
    const d = openDirectOf(w);
    if (d) assert.ok(consistent(d), JSON.stringify(w));
  }
});

test('8.8: author.type is human only for the User’s own words; a summary, paraphrase or translation is agent', () => {
  assert.deepEqual((['agent', 'user’s own words', 'summary', 'paraphrase', 'translation'] as const).map(authorFor), ['agent', 'human', 'agent', 'agent', 'agent']);
  assert.deepEqual((['agent', 'you', 'company agent', 'person'] as const).map((s) => [authorOf(s), roleOf(s)]), [['agent', 'user'], ['human', 'user'], ['agent', 'company'], ['human', 'company']]);
});

test('8.8 and 8.7: every turn at the table is marked by who wrote it, on both sides', () => {
  const said = reachable().flatMap((w) => (w.said ? [w.said] : []));
  for (const t of said) assert.equal(authorOf(t.speaker), t.speaker === 'you' || t.speaker === 'person' ? 'human' : 'agent');
  // The Company's side: the person speaks only while responder is human, the Company Agent only while it is agent.
  for (const w of reachable()) {
    if (!w.said || roleOf(w.said.speaker) !== 'company') continue;
    const c = w.said.at === 'main' ? w.main! : openDirectOf(w)!;
    assert.equal(w.said.speaker === 'person', c.responder === 'human', JSON.stringify(w));
  }
  // In a Direct Conversation, the User's side speaks only in the User's own words.
  for (const t of said) if (t.at === 'direct' && roleOf(t.speaker) === 'user') assert.equal(t.speaker, 'you');
});

test('8.9: asking for a person makes handoff pending, and asking again, or with a person there, changes nothing', () => {
  const pending = askForPerson(NEW_CONVERSATION), joined = personJoins(pending);
  assert.deepEqual(pending, { ...NEW_CONVERSATION, handoff: 'pending' });
  assert.deepEqual(askForPerson(pending), pending);
  assert.deepEqual(joined, { ...NEW_CONVERSATION, responder: 'human' });
  assert.deepEqual(askForPerson(joined), joined);
  assert.deepEqual(nobodyAvailable(pending), NEW_CONVERSATION, 'nobody available: none again, responder still agent');
  const w = play(['ask', 'read', 'person']);
  assert.equal(reasonOf(w, 'person'), 'handoff is already pending, so asking again changes nothing (8.9)');
  assert.equal(reasonOf(play(['joins'], w), 'person'), 'Alex, a person, is handling the conversation already, so asking changes nothing (8.9)');
  // While pending, the agent can keep talking and the Company Agent keeps answering.
  assert.deepEqual(play(['ask', 'read'], w).said?.speaker, 'company agent');
  assert.equal(play(['ask', 'read'], w).main?.handoff, 'pending');
});

test('8.9: a cancel may or may not take effect, as the Company’s help desk allows; with nothing pending it changes nothing', () => {
  const pending = askForPerson(NEW_CONVERSATION);
  assert.equal(cancelPerson(pending, 'withdraws').handoff, 'none');
  assert.equal(cancelPerson(pending, 'keeps looking').handoff, 'pending');
  // A person can join before the Company acts on the cancel, or after it kept looking.
  assert.equal(personJoins(cancelPerson(pending, 'keeps looking')).responder, 'human');
  for (const desk of ['withdraws', 'keeps looking'] as const) assert.deepEqual(cancelPerson(NEW_CONVERSATION, desk), NEW_CONVERSATION);
});

test('8.10: the Company can only ask for the User: user_requested changes no state field, and only the agent opens a Direct Conversation', () => {
  const settled = play(['ask', 'read']), invited = play(['invite'], settled);
  assert.deepEqual({ ...invited, invited: false }, settled);
  assert.equal(invited.direct, null);
  for (const e of ['joins', 'invite'] as const) assert.equal(openDirectOf(isRefusal(next(invited, e)) ? invited : (next(invited, e) as World)), null, e);
  const opened = play(['direct'], invited);
  // Accepted without a message: the Company speaks first, working, looking for a person.
  assert.deepEqual(opened.direct, { ...NEW_CONVERSATION, working: true, handoff: 'pending' });
  assert.equal(opened.said, null);
  assert.equal(opened.invited, false);
  // Opened because the User wants to talk: it starts with the User's own words.
  assert.deepEqual(play(['direct'], settled).said, { speaker: 'you', line: 'question', at: 'direct' });
  // Declining: the agent says so in the conversation, in its own words.
  assert.deepEqual(play(['ask'], invited).said, { speaker: 'agent', line: 'decline', at: 'main' });
  assert.equal(reasonOf(invited, 'you'), 'the Company has asked for you, so your agent asks you first: it opens a Direct Conversation if you agree, or says no for you (8.10)');
});

test('8.10: while a Direct Conversation is open the first conversation is paused, and it takes messages again once it closes', () => {
  const inDirect = play(['ask', 'read', 'invite', 'direct']);
  const paused = 'a Direct Conversation is open, so the Company answers 409 direct_conversation_open and the conversation waits (8.10)';
  assert.equal(reasonOf(inDirect, 'ask'), paused);
  assert.equal(reasonOf(inDirect, 'person'), paused);
  assert.equal(reasonOf(inDirect, 'direct'), 'one is open already, and a conversation has one open Direct Conversation at a time: 409 direct_conversation_open (8.10)');
  assert.equal(activeOf(inDirect), 'direct');
  // Your words go to the Direct Conversation, marked human.
  assert.deepEqual(play(['joins', 'read', 'you'], inDirect).said, { speaker: 'you', line: 'medium', at: 'direct' });
  const back = play(['joins', 'read', 'close'], inDirect);
  assert.equal(back.direct, 'closed');
  assert.equal(activeOf(back), 'main');
  assert.equal(reasonOf(back, 'ask'), null);
  assert.equal(bound(back, 'direct'), 'this story opens one Direct Conversation; Poppy allows another once the first has closed');
  assert.equal(bound(inDirect, 'direct'), undefined);
});

test('8.10: opening a Direct Conversation checks the parent’s owner, its event, that it is open, not direct, and has none open', () => {
  const parent: Stored = { owner: OWNER, parent: null, closed: false, events: [{ id: 'evt_c5', type: 'message' }, { id: 'evt_c6', type: 'user_requested' }], openDirect: null, openedOn: {} };
  const store = (p: Partial<Stored> = {}) => ({ [CONVERSATION_ID]: { ...parent, ...p }, cnv_D1: { ...parent, parent: CONVERSATION_ID } });
  const hello = { author: { type: 'human' as const }, text: LINES.question };
  assert.deepEqual(openDirect(store(), caller(), { parent: CONVERSATION_ID, userRequestedEventId: 'evt_c6' }), { status: 201, conversation_id: `${CONVERSATION_ID}_d1`, repeated: false });
  assert.equal(openDirect(store(), caller(), { parent: CONVERSATION_ID, message: hello }).status, 201);
  assert.deepEqual(openDirect(store(), caller(), { parent: 'cnv_unknown', message: hello }), { status: 404, error: 'conversation_not_found' });
  assert.deepEqual(openDirect(store(), caller({ userId: 'usr_m4Tz9P' }), { parent: CONVERSATION_ID, message: hello }), { status: 404, error: 'conversation_not_found' });
  assert.deepEqual(openDirect(store(), caller(), { parent: CONVERSATION_ID, userRequestedEventId: 'evt_c5' }), { status: 400, error: 'invalid_request' }, 'evt_c5 is not a user_requested event');
  assert.deepEqual(openDirect(store(), caller(), { parent: CONVERSATION_ID }), { status: 400, error: 'invalid_request' }, 'no message and no event');
  assert.deepEqual(openDirect(store({ closed: true }), caller(), { parent: CONVERSATION_ID, message: hello }), { status: 409, error: 'conversation_closed' });
  assert.deepEqual(openDirect(store(), caller(), { parent: 'cnv_D1', message: hello }), { status: 400, error: 'invalid_request' }, 'a Direct Conversation cannot be a parent');
  assert.deepEqual(openDirect(store({ openDirect: 'cnv_D1' }), caller(), { parent: CONVERSATION_ID, message: hello }), { status: 409, error: 'direct_conversation_open', conversation_id: 'cnv_D1' });
  // Accepting the same event again returns the same Direct Conversation, even after it closed.
  assert.deepEqual(openDirect(store({ openedOn: { evt_c6: 'cnv_D1' } }), caller(), { parent: CONVERSATION_ID, userRequestedEventId: 'evt_c6' }), { status: 201, conversation_id: 'cnv_D1', repeated: true });
});

test('8.11: the authorization event says insufficient_scope whether or not a token was sent, and names the scopes', () => {
  for (const hadToken of [false, true])
    assert.deepEqual(authorizationEvent('evt_d3', ['orders:read', 'orders:write'], hadToken), { id: 'evt_d3', type: 'authorization', error: 'insufficient_scope', scope: 'orders:read orders:write' });
  // The agent signs in and continues the same conversation, which now uses the account.
  const used = continueAs(OWNER, caller({ account: ACCOUNT }));
  assert.ok(used.status === 'continues' && used.owner.account === ACCOUNT);
});

test('8.12: closing sets closed, stops looking for a person, and keeps who handled it last', () => {
  assert.deepEqual(closeConv({ working: false, handoff: 'pending', responder: 'agent', closed: false }), { working: false, handoff: 'none', responder: 'agent', closed: true });
  assert.deepEqual(closeConv(personJoins(NEW_CONVERSATION)).responder, 'human');
  const [parent, direct] = closeParent(NEW_CONVERSATION, { ...NEW_CONVERSATION, working: true });
  assert.deepEqual([parent.closed, direct?.closed], [true, true], 'closing the parent closes its open Direct Conversation (8.10)');
});

test('8.12: a close does not wait its turn, so the agent reads until working is false first; a closed conversation takes no more', () => {
  assert.equal(reasonOf(play(['ask']), 'close'), 'the Company is still working on the conversation, and a close does not wait its turn, so the agent reads until working is false first (8.12)');
  const closed = play(['ask', 'read', 'close']);
  assert.deepEqual(closed.main, { working: false, handoff: 'none', responder: 'agent', closed: true });
  const gone = 'the conversation is closed, so the Company answers 409 conversation_closed (8.12)';
  assert.deepEqual(['ask', 'you', 'person'].map((e) => reasonOf(closed, e as TableEvent)), [gone, gone, gone]);
  assert.equal(reasonOf(closed, 'close'), 'the conversation is closed already, so another close changes nothing (8.12)');
  assert.equal(reasonOf(closed, 'direct'), 'the conversation is closed, so the Company answers 409 conversation_closed (8.10)');
  assert.equal(reasonOf(play(['joins', 'read', 'you'], play(['ask', 'read', 'invite', 'direct'])), 'close'), 'the Company is still working on the Direct Conversation, and a close does not wait its turn, so the agent reads until working is false first (8.12)');
});

test('8.13: the errors this model gives carry the statuses of the table', () => {
  assert.deepEqual(
    [ERRORS.conversation_not_found, ERRORS.conversation_closed, ERRORS.direct_conversation_open, ERRORS.request_id_conflict, ERRORS.invalid_cursor, ERRORS.cursor_expired, ERRORS.invalid_request],
    [404, 409, 409, 409, 400, 410, 400],
  );
});

test('every refusal says why, and from the start only a first message can be sent', () => {
  const none = (what: string) => `there is no conversation yet to ${what}: it starts with the agent’s first message (8.3)`;
  assert.deepEqual(TABLE_EVENTS.map((e) => reasonOf(start(), e)), [
    null,
    null,
    none('read'),
    none('ask in'),
    'handoff is none: nobody is looking for a person (in this model the Company hands off only when asked)',
    none('ask for you in'),
    'there is no conversation yet to link a Direct Conversation to (8.10)',
    none('close'),
  ]);
  const asked = play(['ask']);
  assert.equal(reasonOf(asked, 'read'), null);
  assert.equal(reasonOf(play(['read'], asked), 'read'), 'working is false, so the agent already has the Company’s whole reply (8.7)');
  assert.equal(reasonOf(asked, 'invite'), 'the Company is still working on the conversation; in this model, you are brought in once working is false');
  assert.equal(reasonOf(play(['read', 'person'], asked), 'direct'), 'handoff is pending in the conversation; in this model, you are brought in once that is settled');
});

test('the story replays without a refusal, and every state the events reach leaves an event to press', () => {
  const states = reachable();
  assert.ok(states.length <= 90, `${states.length} states`);
  for (const w of states) assert.ok(TABLE_EVENTS.some((e) => !bound(w, e) && !isRefusal(next(w, e))) || w.main?.closed, JSON.stringify(w));
  const end = play(STORY);
  assert.deepEqual(end, { main: { working: false, handoff: 'none', responder: 'human', closed: false }, direct: 'closed', invited: false, said: null });
  assert.ok(TABLE_EVENTS.some((e) => !bound(end, e) && !isRefusal(next(end, e))), 'the live step ends with something to press');
});

test('each picture cites the section of the draft that decides it', () => {
  const sections = STORY.map((_, i) => ruleOf(play(STORY.slice(0, i + 1))).section);
  assert.deepEqual(sections, ['8.3', '8.8', '8.9', '8.3', '8.7', '8.10', '8.10', '8.10', '8.10', '8.10', '8.10', '8.10']);
  assert.equal(ruleOf(start()).section, '8.3');
  assert.equal(ruleOf(play(['ask', 'read', 'close'])).section, '8.12');
});

test('what is said fits a phone: at most 20 characters, and 16 at the Direct Conversation’s smaller table', () => {
  for (const w of reachable()) {
    if (!w.said) continue;
    const text = LINES[w.said.line];
    assert.ok(text.length <= (w.said.at === 'direct' ? 16 : 20), `${w.said.at}: ${text}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Against the protocol's own published artifacts, not a reading of its text: the JSON Schemas of
// its Company implementation kit (message, event, events response, error) and the section 8
// examples of spec.md, in fixtures/poppy-official.json with their source, commit and retrieval date.

import { readFileSync } from 'node:fs';
import { validate, type Schemas } from '../poppy/fixtures/json-schema.ts';
import type { Message, Side } from './model.ts';

const OFFICIAL: { examples: Record<string, any>; schemas: Schemas } = JSON.parse(readFileSync(new URL('./fixtures/poppy-official.json', import.meta.url), 'utf8'));
const ex = (key: string) => OFFICIAL.examples[key];
const SPEC_EVENT_LISTS = [ex('8.5 Reading events #2'), ex('8.7 State #1')];
/** Every message in spec.md's section 8 examples, with the side that sends it. */
const SPEC_MESSAGES: readonly [string, Message, Side][] = [
  ...(['8.3 Sending messages #1 (Personal Agent)', '8.3 Sending messages #3 (Personal Agent)', '8.3 Sending messages #4 (Personal Agent)', '8.8 Human or AI #1 (Personal Agent)', '8.10 Direct Conversations #1 (Personal Agent)'] as const)
    .map((k): [string, Message, Side] => [k, ex(k).message, 'personal agent']),
  ['8.4 Message fields #1', ex('8.4 Message fields #1 (Personal Agent message)'), 'personal agent'],
  ['8.4 Message fields #2', ex('8.4 Message fields #2 (Personal Agent message)'), 'personal agent'],
  ['8.4 Message fields #3', ex('8.4 Message fields #3 (Company message)'), 'company'],
  ...SPEC_EVENT_LISTS.flatMap((list) => list.events.filter((e: { type: string }) => e.type === 'message').map((e: { id: string; message: Message }): [string, Message, Side] => [`event ${e.id}`, e.message, 'company'])),
];

test('official kit schemas (poppy-official.json): spec.md’s section 8 examples pass them, so the checker reads them as the project does', () => {
  for (const [key, message] of SPEC_MESSAGES) assert.deepEqual(validate(OFFICIAL.schemas, 'message.schema.json', message), [], key);
  for (const list of SPEC_EVENT_LISTS) assert.deepEqual(validate(OFFICIAL.schemas, 'events-response.schema.json', list), []);
  for (const key of ['8.10 Direct Conversations #2 event', '8.11 Sign-in during a conversation #1 event']) assert.deepEqual(validate(OFFICIAL.schemas, 'event.schema.json', ex(key)), [], key);
  assert.deepEqual(validate(OFFICIAL.schemas, 'error.schema.json', ex('8.2 Requests #1 error')), []);
});

test('spec.md 8.3 to 8.11 examples (poppy-official.json): problemsOf accepts every example message from its side, and isId every example ID', () => {
  assert.equal(SPEC_MESSAGES.length, 10);
  for (const [key, message, side] of SPEC_MESSAGES) assert.deepEqual(problemsOf(message, side), [], key);
  const ids = [
    ...['8.3 Sending messages #1 (Personal Agent)', '8.3 Sending messages #3 (Personal Agent)', '8.3 Sending messages #4 (Personal Agent)', '8.8 Human or AI #1 (Personal Agent)', '8.10 Direct Conversations #1 (Personal Agent)', '8.10 Direct Conversations #2 event', '8.11 Sign-in during a conversation #1 event'].map((k) => ex(k).id),
    ...SPEC_EVENT_LISTS.flatMap((list) => [list.conversation_id, list.cursor, ...list.events.map((e: { id: string }) => e.id)]),
  ];
  for (const id of ids) assert.ok(isId(id), id);
});

test('official message.schema.json (poppy-official.json): every message the schema rejects, problemsOf rejects from either side; the model is stricter only where 8.4 says who may send a field', () => {
  const authors = [{ type: 'agent' }, { type: 'human' }, { type: 'agent', name: 'Alex' }, { type: 'robot' }, undefined];
  const contents = [{}, { text: 'Medium, please.' }, { data: { size: 'M' } }, { context: { user_available: true } }, { extensions: { 'example.com/gift-wrap': {} } }];
  const asOfs = [{}, { as_of_request: 'msg_1' }, { as_of_cursor: 'evt_1' }, { as_of_request: 'msg_1', as_of_cursor: 'evt_1' }];
  let compared = 0, stricter = 0;
  for (const side of ['personal agent', 'company'] as const) for (const author of authors) for (const content of contents) for (const asOf of asOfs) {
    const message = { ...(author ? { author } : {}), ...content, ...asOf } as Message;
    // As the Company records it (8.4), so the schema's role rules apply.
    const schemaErrors = validate(OFFICIAL.schemas, 'message.schema.json', record(message, side, 'msg_x'));
    const problems = problemsOf(message, side);
    compared++;
    if (schemaErrors.length > 0) assert.notDeepEqual(problems, [], `${side} ${JSON.stringify(message)}: ${schemaErrors.join('; ')}`);
    else if (problems.length > 0) {
      stricter++;
      assert.deepEqual(problems.filter((p) => p !== 'only Company messages name their author' && p !== 'only the Personal Agent sends context'), [], JSON.stringify(message));
    }
  }
  assert.equal(compared, 200);
  assert.ok(stricter > 0);
});

test('official event.schema.json (poppy-official.json): the state of every conversation the handoff steps reach, and the authorization event, pass; the examples’ event types are the model’s', () => {
  const states = new Map<string, Conv>();
  const steps = [askForPerson, personJoins, nobodyAvailable, closeConv, (c: Conv) => cancelPerson(c, 'withdraws')];
  const walk = (c: Conv, depth: number) => { states.set(JSON.stringify(c), c); if (depth) for (const step of steps) walk(step(c), depth - 1); };
  walk(NEW_CONVERSATION, 4);
  for (const c of states.values()) {
    const event = { id: 'evt_s1', type: 'state', created_at: '2026-10-08T19:05:10Z', handoff: c.handoff, responder: c.responder, closed: c.closed };
    assert.deepEqual(validate(OFFICIAL.schemas, 'event.schema.json', event), [], JSON.stringify(c));
  }
  assert.deepEqual(validate(OFFICIAL.schemas, 'event.schema.json', { ...authorizationEvent('evt_d3', ['orders:read', 'orders:write'], false), created_at: '2026-10-08T19:04:00Z' }), []);
  const { created_at: _at, ...specAuthorization } = ex('8.11 Sign-in during a conversation #1 event');
  assert.deepEqual(authorizationEvent('evt_d3', ['orders:read', 'orders:write'], true), specAuthorization);
  const exampleTypes = [...SPEC_EVENT_LISTS.flatMap((list) => list.events.map((e: { type: string }) => e.type)), ex('8.10 Direct Conversations #2 event').type, ex('8.11 Sign-in during a conversation #1 event').type];
  for (const type of exampleTypes) assert.ok((EVENT_TYPES as readonly string[]).includes(type), type);
});
