import { Scene } from '../../../src/index.ts';
import { answerOf, isRefusal, settingsOf, stage, Machine, view } from '../../../explain/index.ts';
import type { ExplainerMeta, Setting } from '../../../explain/index.ts';
import { POPPY_EVENTS, STORY, next, start } from './model.ts';
import type { PoppyEvent, Scope, World } from './model.ts';
import { drawWorld, sayWorld } from './picture.ts';

const APPROVALS: Record<string, readonly Scope[]> = { 'read-write': ['orders:read', 'orders:write'], 'read-only': ['orders:read'] };

// One errand, the jacket exchange of the specification's examples, as a machine: each request,
// sign-in and sign-out is an event of the model, the picture is a view of its state, and the last
// step is live. The story is the model's STORY, replayed one event a step.
export default class Poppy extends Scene<World, {}> {
  static meta = {
    sources: [
      'https://personalagentprotocol.org/docs/0.4/spec',
      'https://www.rfc-editor.org/rfc/rfc6749',
      'https://www.rfc-editor.org/rfc/rfc9449',
    ],
    claims: [{ says: 'never grants account access', test: 'model.test.ts: a Session header never grants account access' }],
  } satisfies ExplainerMeta;
  static settings = [
    {
      id: 'approve',
      label: 'You approve',
      default: 'read-write',
      options: [
        { value: 'read-write', label: 'Read and write' },
        { value: 'read-only', label: 'Read only' },
      ],
    },
  ] satisfies readonly Setting[];
  override state = start(APPROVALS['read-write']!);

  override async construct() {
    const approves = APPROVALS[settingsOf(this).approve!]!, scopes = approves.join(' and ');
    // The world after each event of the story, from the model, so the words say what it computed.
    const after = STORY.reduce<World[]>((worlds, event) => {
      const world = next(worlds.at(-1)!, event);
      if (isRefusal(world)) throw new Error(`the story's ${event} is refused: ${world.reason}`);
      return [...worlds, world];
    }, [start(approves)]);
    const answered = (world: World) => {
      if (world.last?.kind !== 'request') throw new Error('the story expected a request here');
      return world.last.answer;
    };
    const challenge = answered(after[2]!), both = answered(after[4]!), thief = answered(after[5]!);

    this.state = start(approves);
    // No heading on the stage: the picture takes the stage's full height, so its words read on a phone,
    // where the page prints each step's title and line under the picture anyway.
    const s = stage(this, { style: 'github-light', heading: false });
    const world = view(this, (w) => drawWorld(w, s), { place: false });
    const machine = new Machine<World, PoppyEvent>(this, {
      start: start(approves),
      events: POPPY_EVENTS,
      labels: { cart: 'Add to cart', order: 'See the order', exchange: 'Exchange the jacket', 'sign-in': 'Sign in', thief: 'Thief replays the token', 'sign-out': 'Sign out' },
      next,
      views: [world],
      runTime: 0.8,
    });

    await this.step('errand', {
      title: 'Your agent has a jacket to exchange',
      line: 'Predict: what must the shop know before it changes your order?',
      caption:
        'You ask your personal agent to swap the jacket from order 1042 for a warmer one at example.com, a shop that has never met this agent. The agent has read the shop’s poppy.json, the file where a Company lists its APIs and its sign-in page for agents. Nothing has been sent yet, so the Company knows nothing. Borrowing your password would make the agent look like you. What should it prove instead?',
    });
    await s.enter(world, { describe: () => sayWorld(this.state) });

    await this.step('cart', {
      title: 'A cart needs no account',
      line: 'One signed header says which agent is asking, and for which User.',
      caption:
        'The agent puts a medium in the cart, and signs a Session header for that one request. The Company checks the signature against keys the agent publishes, and then knows three things: which agent this is, a User ID, and a Session to keep the cart in. The User ID is a pseudonym the agent made up for this Company; at shoes.example the same person has another. The Company does not know who you are.',
    });
    await this.play(machine.replay([STORY[0]!]));

    await this.step('challenge', {
      title: 'The Session is not a key to your account',
      line: `Exchange refused: ${challenge.status}, sign in for ${challenge.needs}.`,
      caption: `The exchange would change order 1042, so the Company answers ${challenge.status} and names the scope it wants, ${challenge.needs}. A Session header never grants account access, whatever it holds. ${answerOf(this)}. The agent supplies the first by itself, on each request. The second has to come from you.`,
    });
    await this.play(machine.replay([STORY[1]!]));

    await this.step('approve', {
      title: 'You approve on the Company’s own page',
      line: 'Plain OAuth: the agent gets tokens, not your password.',
      caption: `Sign-in is standard OAuth. The agent opens auth.example.com in your browser; you sign in there and approve ${scopes}. The agent receives a refresh token, which it trades for short-lived access tokens. The Company’s column has not changed: sign-in does not mention the Session. The Company knows which agent holds this grant, and can limit or revoke it without touching your password.`,
    });
    await this.play(machine.replay([STORY[2]!]));

    const made = both.status === 200;
    await this.step('both', {
      title: made ? 'Both proofs travel together' : 'Read-only approval cannot exchange',
      line: made ? `${both.status}: the exchange is made.` : `${both.status}: the token lacks ${both.needs}.`,
      caption: `The same request now carries both proofs, and the Company joins them: this Session may act on your account, within ${scopes}. ${
        made
          ? 'The exchange is made. The header also holds a hash of the token, so the Company can tell that the agent holding the token is the agent that signed.'
          : `That does not cover an exchange, so the answer is ${both.status}, naming ${both.needs}. The Company grants no scope beyond what you approved, so the agent has to ask you again. Switch “You approve” to see the exchange go through.`
      }`,
    });
    await this.play(machine.replay([STORY[3]!]));

    await this.step('thief', {
      title: 'A stolen token is not enough',
      line: `${thief.status} ${thief.error}: the thief cannot sign as your agent.`,
      caption: `Suppose a thief copies the access token and sends it under a Session header signed with its own key. The Company sees a token issued to agent.example arriving under another signature, and refuses with ${thief.error}. Nothing in its column changes. A whole request copied in transit could be replayed to the same URL for a short time, which is why the agent signs a fresh header for each request.`,
    });
    await this.play(machine.replay([STORY[4]!]));

    await this.step('sign-out', {
      title: 'Sign out, and the Session carries on',
      line: 'Now drive it yourself: a refused press says why.',
      caption:
        'The agent revokes its refresh token, and account access ends. The Session does not: the cart is still there, under the same User ID. Press the events to try it: ask for the order signed out, sign in again, let the thief try now. One limit: Poppy binds agents that choose to follow it. An agent that types your password into the website looks like you, and the Company cannot tell the difference.',
    });
    await this.play(machine.replay([STORY[5]!]));
  }
}
