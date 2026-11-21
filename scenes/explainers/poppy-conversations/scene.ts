import { AnimationGroup, Scene, Succession, Text } from '../../../src/index.ts';
import type { Animation } from '../../../src/index.ts';
import { answerOf, isRefusal, stage, Machine, view } from '../../../explain/index.ts';
import type { Choreography, ExplainerMeta, Transition } from '../../../explain/index.ts';
import { beats, flight } from '../lib/poppy-kit.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { STORY, TABLE_EVENTS, activeOf, bound, next, openDirectOf, start } from './model.ts';
import type { TableEvent, World } from './model.ts';
import { BACK_OFFICE_X, PALETTE, drawWorld, sayWorld, seatsOf, speakerAt } from './picture.ts';
import type { Shown } from './picture.ts';

/** The resting bubble includes a tail towards its writer. Translating that complete footprint
 * towards the seat must stop before the tail or panel reaches the writer's actual mark. */
function clearLaunch(turn: Mobject, writer: Mobject, seat: Vec): Vec {
  const at = turn.center(), bubble = turn.box()!, mark = writer.box()!, dx = seat[0] - at[0], dy = seat[1] - at[1];
  const gap = 0.1, separation: number[] = [];
  if (dx < 0 && bubble[0] > mark[2] + gap) separation.push((bubble[0] - mark[2] - gap) / -dx);
  if (dx > 0 && bubble[2] < mark[0] - gap) separation.push((mark[0] - gap - bubble[2]) / dx);
  if (dy < 0 && bubble[1] > mark[3] + gap) separation.push((bubble[1] - mark[3] - gap) / -dy);
  if (dy > 0 && bubble[3] < mark[1] - gap) separation.push((mark[1] - gap - bubble[3]) / dy);
  // One separated axis suffices. Along this straight segment its gap only increases on landing.
  const fraction = Math.min(0.3, Math.max(0, ...separation));
  return [at[0] + fraction * dx, at[1] + fraction * dy];
}

/** Repeating the already displayed message changes no pictured turn. */
function sameTurn(before: World, after: World): boolean {
  return !!before.said && !!after.said && before.said.at === after.said.at && before.said.speaker === after.said.speaker && before.said.line === after.said.line;
}

// A conversation between your agent and a Company, as a table with four seats, driven as a machine:
// each message, read, request for a person, a person joining, the Company's invitation, the Direct
// Conversation and its close is an event of the model, the picture is a view of its state, and the
// last step is live. The story is the model's STORY, replayed step by step.
//
// The motion says where things come from: a turn of speech grows out of the mark of whoever wrote
// it and comes to rest on the table; a person who joins walks in from the Company's back office, off
// the right edge; the invitation crosses the table from the Company's end to your agent, not to you;
// and when the Direct Conversation opens, you move from the big table to the small one, and back
// when it closes. Words that change are replaced, never morphed.
export default class Conversations extends Scene {
  static meta = {
    sources: ['https://personalagentprotocol.org/docs/1.0/spec'],
    claims: [
      { says: 'Every message says whether a person or an AI wrote it', test: 'model.test.ts: 8.8 and 8.7: every turn at the table is marked by who wrote it' },
      { says: 'only your own agent can bring you in', test: 'model.test.ts: 8.10: the Company can only ask for the User' },
      { says: 'only your own words count as yours', test: 'model.test.ts: 8.8: author.type is human only for the User’s own words' },
      { says: 'Had nobody been free', test: 'model.test.ts: 8.9: asking for a person makes handoff pending' },
      { says: 'It can only add a user_requested event', test: 'model.test.ts: 8.10: the Company can only ask for the User' },
      { says: 'Only your agent can open it', test: 'model.test.ts: 8.10: the Company can only ask for the User' },
    ],
  } satisfies ExplainerMeta;
  override state: World = start();
  override shown: Shown = {};

  override async construct() {
    // The world after each event of the story, from the model.
    STORY.reduce<World>((w, event) => {
      const after = next(w, event);
      if (isRefusal(after)) throw new Error(`the story's ${event} is refused: ${after.reason}`);
      return after;
    }, start());

    const s = stage(this, { palette: { ...PALETTE }, heading: false });
    const world = view(this, (w, sh, drawing) => drawWorld(w, drawing, sh), { drawing: s.drawing, place: false });

    /**
     * What a turn brings with it: the turn, and changed values under "On the table" that say who
     * wrote it, which wait for it to land. Unchanged values, the heading, rules and labels stay,
     * rather than blink out and back for a second at every message.
     */
    const SAID = ['turn'];
    // These are context, not new information brought by a message. Name each subject so a
    // missing rule or row label cannot be excused by the heading still being visible.
    const WRITTEN_CONTEXT = ['written:title:0', 'written:rule', 'written:author.type:label', 'written:author.type:rule', 'written:role:label', 'written:role:rule'];
    /** A turn of speech grows out of its writer's mark and comes to rest on the table. */
    const spoken = (t: Transition<World, TableEvent>) => {
      const c = t.choreograph(world), seat = speakerAt(t.after);
      // The model can accept a repeated send without changing the pictured message. Its
      // existing turn and ledger values remain: there is no new visible information to carry.
      if (sameTurn(t.before, t.after)) return beats(c, () => [], { fresh: [] });
      if (!seat || !c.has('turn', 'to')) return beats(c, () => [], { fresh: SAID });
      // Start inside the table, towards the writer. The protected subject is the seat's mark;
      // the historical seat-name claim was not reproduced on these speaking routes.
      const said = t.after.said!;
      const writerKey = said.speaker === 'company agent' ? (said.at === 'direct' ? 'direct:agent:mark' : 'company:mark')
        : said.speaker === 'person' ? (said.at === 'direct' ? 'specialist:mark' : 'person:mark') : `${said.speaker}:mark`;
      const from: Vec = clearLaunch(c.to('turn'), c.to(writerKey), seat);
      // The agent's answer takes up the Company's invitation: the envelope goes before the turn comes down over it.
      const answered = c.has('invite', 'from') && !c.has('invite', 'to') ? [c.leave('invite', { runTime: 0.2 }), c.leave('invite:type', { runTime: 0.2 })] : [];
      const fly = flight(c, 'turn', [from], { appear: 0.2, move: 0.5, leave: 0.2 });
      return beats(c, () => [...(answered.length ? [new AnimationGroup(answered)] : []), ...fly()], { fresh: SAID });
    };
    /** A part comes in from a point and stops where it rests. */
    const arrives = (c: Choreography, key: string, ...via: Vec[]) => (c.has(key, 'to') ? flight(c, key, via, { appear: 0.2, move: 0.9, leave: 0.2 }) : () => []);

    /**
     * Who travels when the Direct Conversation opens or closes, because the travel means something:
     * you and your agent go to the small table and come back; the first table steps back and its
     * seats with it. Everything else that only changes place for the composition is cross-faded.
     */
    const TRAVELS = new Set(['agent:mark', 'you:mark', 'main:table', 'seat:agent', 'seat:you', 'seat:company', 'seat:person', 'company:mark', 'person:mark']);
    // These captions identify their seat at either resting layout. They are replaced at those
    // two places while the actual participant travels. Ledger context instead stays readable
    // throughout its adjustment; its role does not depend on a shared distance threshold.
    const RELOCATED_CAPTIONS = new Set(['agent:name', 'agent:kind', 'you:name', 'you:kind']);
    /**
     * A change of layout in three beats: what goes, goes (with words that change and parts that
     * only move for the layout); then the travellers move to their new places; only then do the new
     * things come in, so nothing arrives where something is still moving.
     */
    const reflow = (c: Choreography): Succession => {
      const out: Animation[] = [], back: Animation[] = [];
      const moved = (k: string) => {
        const a = c.from(k), b = c.to(k);
        if (a instanceof Text && b instanceof Text && a.text !== b.text) return true;
        const [ax, ay] = a.center(), [bx, by] = b.center();
        return !TRAVELS.has(k) && RELOCATED_CAPTIONS.has(k) && Math.hypot(ax - bx, ay - by) > 1e-6;
      };
      for (const k of c.keys('from')) if (!c.has(k, 'to') || moved(k) || k === 'turn') out.push(c.leave(k, { runTime: 0.25 }));
      for (const k of c.keys('to')) if (!c.has(k, 'from') || moved(k) || k === 'turn') back.push(c.enter(k, {}, { runTime: 0.4 }));
      return new Succession([...(out.length ? [new AnimationGroup(out)] : []), c.rest({ runTime: 0.7 }), ...(back.length ? [new AnimationGroup(back)] : [])]);
    };
    const machine = new Machine<World, TableEvent>(this, {
      start: start(),
      events: TABLE_EVENTS,
      labels: {
        ask: 'Agent writes', you: 'You write', read: 'Read replies', person: 'Ask for a person',
        joins: 'A person joins', invite: 'Company asks for you', direct: 'Open Direct Conversation', close: 'Close',
      },
      next,
      bound,
      views: [world],
      motion: ({event, before, after}) => {
        if (['ask', 'you', 'read'].includes(event) && after.said?.at === activeOf(after) && !sameTurn(before, after))
          return [{view: world, during: 'turn:flight', present: WRITTEN_CONTEXT}];
        if (event === 'joins') return [{view: world, during: openDirectOf(before)?.handoff === 'pending' ? 'specialist:mark:flight' : 'person:mark:flight', present: WRITTEN_CONTEXT}];
        return [];
      },
      runTime: ({event}) => event === 'joins' ? 2 : event === 'invite' ? 1.75 : 1.8,
      transition: {
        ask: spoken,
        you: spoken,
        read: spoken,
        // The person comes from the Company's back office, off the right edge, to the seat where they will sit.
        joins: (t) => {
          const c = t.choreograph(world), key = c.has('specialist:mark', 'to') && !c.has('specialist:mark', 'from') ? 'specialist:mark' : 'person:mark';
          const seats = seatsOf(t.after), seatAt = key === 'person:mark' ? seats.person : seats.directCompany;
          // Under the ledger, along the stage's foot, then up to the seat.
          return beats(c, arrives(c, key, [BACK_OFFICE_X, -3.95], [seatAt[0] + 1.5, -3.95]), { fresh: ['turn'] });
        },
        // The invitation crosses the table from the Company's end, under the turn on the table, and stops in front of your agent.
        invite: (t) => {
          const c = t.choreograph(world);
          const from = seatsOf(t.after).company;
          return beats(c, arrives(c, 'invite', from, [from[0] - 1.2, c.to('invite').center()[1]!]), { fresh: [] });
        },
        person: (t) => beats(t.choreograph(world), () => [], { fresh: [] }),
        // The first table steps back and the small one is set below it; you and your agent move to it.
        direct: (t) => reflow(t.choreograph(world)),
        // The small table is cleared away; you and your agent come back to the first, which wakes.
        close: (t) => reflow(t.choreograph(world)),
      },
    });

    await this.step('open', {
      title: 'Your agent opens a conversation',
      line: 'Predict: where will the shop’s reply come from?',
      caption:
        'Your agent wants to exchange the jacket from order 1042, so it talks with example.com’s own agent: JSON over HTTPS, signed with its Session header as chapter 1 showed. Its first message starts the conversation. The answer is 201 with a Conversation ID, cnv_8f3Kd2, and no reply: the Company has accepted the message, not answered it, so working is true. Where will the reply come from?',
    });
    await s.enter(world, { describe: () => sayWorld(this.state, this.shown) });
    await this.play(machine.sendSequence(STORY.slice(0, 1)));

    await this.step('read', {
      title: 'Replies are read, not returned',
      line: 'Read until working is false.',
      caption: `The agent reads the conversation’s events from where it last stopped, or holds the read open, or streams it. The reply is an event, and it says who wrote it: here an AI. ${answerOf(this)}. A request lost on the way is safe to send again with the same request ID: the Company acts on it once. Try the controls here to request a person, invite the User and open a Direct Conversation.`,
    });
    await this.play(machine.sendSequence(STORY.slice(1, 2)));
    machine.offer();

    await this.step('person', {
      title: 'A person takes the empty seat',
      line: 'Pending, then a person joins: responder is human.',
      caption:
        'The agent asks for a person. Handoff turns pending while the Company looks, and its agent keeps answering meanwhile, so responder stays agent. When Alex joins, handoff is none again, responder is human, and Alex’s reply carries the person mark. Had nobody been free, handoff would go back to none and the Company Agent would say why. A cancel may not take effect, so the agent watches these fields.',
    });
    await this.play(machine.sendSequence(STORY.slice(2, 5)));

    await this.step('invite', {
      title: 'The Company asks for you',
      line: 'Predict: can the Company bring you in itself?',
      caption:
        'Alex wants to confirm the exchange with you, not with your agent. The Company cannot reach you. It can only add a user_requested event to the conversation, with a short reason, and none of the four fields changes. The invitation lands in front of your agent, which asks you whether you want to talk. What happens if you say no?',
    });
    await this.play(machine.sendSequence(STORY.slice(5, 6)));

    await this.step('direct', {
      title: 'A second, smaller table',
      line: 'Only your agent can open it.',
      caption:
        'You agree, so your agent opens a Direct Conversation: a new conversation, linked to the first, where you speak for yourself and your agent may watch. The Company keeps the earlier history, and you need not read it. Had you said no, your agent would have told the Company for you. While the small table is open, the first one waits: a message there gets 409 direct_conversation_open.',
    });
    await this.play(machine.sendSequence(STORY.slice(6, 9)));

    await this.step('words', {
      title: 'Your own words are marked human',
      line: 'The same words from your agent would be marked AI.',
      caption:
        'You type “Medium, please.” and your agent sends it as written, marked human. Had your agent passed on your wish in its own words, as a summary, the message would be marked agent: only your own words count as yours. The specialist’s reply carries the person mark too, so all four voices stay distinct. Draft 1.0 adds that either side reads a mark it does not know as AI, so nothing passes for a person’s words unless it says human.',
    });
    await this.play(machine.sendSequence(STORY.slice(9, 11)));

    await this.step('owner', {
      title: 'Who may continue this conversation',
      line: 'A mismatch looks like no conversation at all.',
      caption:
        'Suppose the Company Agent had needed your account. It adds an authorization event; your agent signs you in and carries on in the same conversation with an access token. From then on the conversation belongs to agent.example, User ID usr_Q7c1vK and account A, whatever Session asks. Signed out, the agent gets a challenge to sign in again. Another User ID, or account B, gets 404, as if it did not exist.',
    });
    this.shown = { owner: true };
    await this.play(world.sync({ runTime: 0.8, match: { by: 'key', text: 'whole' } }));

    await this.step('close', {
      title: 'The small table closes, the big one listens',
      line: 'Now drive both sides yourself: refusals say why.',
      caption:
        'You are done, so your agent closes the Direct Conversation, and the first conversation takes messages again. A close does not wait its turn: the Company may drop anything it has not acted on yet, so the agent reads until working is false before it closes. Closing does not cancel the exchange itself. Now press the events, for both sides, and read why a refused press is refused. To repeat the handoff and invitation, return to “Replies are read, not returned”.',
    });
    this.shown = {};
    await this.play(world.sync({ runTime: 0.6, match: { by: 'key', text: 'whole' } }));
    await this.play(machine.sendSequence(STORY.slice(11, 12)));
    machine.offer();
  }
}
