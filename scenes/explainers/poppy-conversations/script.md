# When two agents talk, who is a person and who is an AI?

- **Reader:** a developer who has read how a Personal Agent signs its requests (chapter 1) and now wonders what happens when it talks with a shop's own chatbot: who is on the line, when a human takes over, and whether the User ever gets a say.
- **Answer:** Every message says whether a person or an AI wrote it, on both sides, and only your own agent can bring you in
- **Changed condition:** who is speaking. The same reply reads differently when the Company Agent wrote it and when Alex, a person at the Company, did; the same words "Medium, please." are marked human when you typed them and agent when your agent passed them on.
- **Reader's own work:** predict what your agent should do with a 202 that carries no reply; predict whether the Company can pull you into the conversation itself; at the live step, drive both sides (send, read, ask for a person, a person joins or nobody is free, the Company asks for you, open and close a Direct Conversation) and read why each refused press is refused.
- **Checked against:** the Personal Agent Protocol draft 0.4, section 8, read and not run: `model.test.ts` holds the model to the rules and examples of 8.1 to 8.13, each test naming its section, and `answers.ts` computes the answers below from the model. There is no reference implementation here to run the model against.
- **Leaves out:** cursors, event IDs, has_more and wait in the table the reader drives (a read takes everything; the wire layer of the model holds the cursor rules), streaming, data, context and extensions, the as_of hints, versions, the Company handing off or closing on its own, and a second Direct Conversation. Cancelling a request for a person and sign-in during a conversation are told in words and tested in the model, not driven.

## Check yourself

1. Your agent tells Alex in its own words that you want a medium. Then you type "Medium, please." yourself. What author.type does each message carry, and what role?
   The agent’s summary is agent and your own words are human. Both have role user: role says which side, author.type says person or AI.
2. While the Direct Conversation is open, your agent sends a message of its own to the first conversation. What comes back, and when will that conversation take it?
   409 direct_conversation_open: the first conversation waits while the Direct Conversation is open, and takes messages again once it closes.
3. The Company wants to talk with you, not your agent. What can it do, and who opens the Direct Conversation?
   It adds a user_requested event, which changes no state field. Only your agent opens a Direct Conversation, after asking you, so you decide when you are brought in.
4. The conversation has used your account A. What does the Company answer if your agent sends a message signed out, if another User ID uses the same Conversation ID, and if your agent signed in to account B tries?
   Signed out: 401 with a challenge to sign in again. Another User ID: 404 conversation_not_found. Account B: 404 conversation_not_found, the same answer as for an ID that does not exist.
5. Your agent has sent a message and working is still true. Why should it read before it closes the conversation?
   A close does not wait its turn, so the Company may drop the message it has not acted on yet. Reading until working is false makes sure it was handled first.

## Why this explainer

Chapter 1 drew the conversation as one request on the Chat lane, answered once. That hides the part of section 8 a newcomer most needs: four parties can be in a conversation, two of them people and two of them AIs, and a reader of the transcript has to be able to tell which wrote each line. So this chapter takes the same jacket exchange into the chat and keeps the four parties in view the whole time, seated at a table: your agent and you on one side, the Company Agent and a person at the Company on the other.

The picture's one idea is that every turn of speech carries a mark of who wrote it, person or AI, and that the mark belongs to the turn, not to the seat. That is what lets "Medium, please." be human when you typed it and agent when your agent paraphrased you, and lets a Company Agent's reply and Alex's reply sit side by side in one read without confusion. The four state fields are drawn as four plain readouts at the Company's edge of the table, because the specification insists they are independent: the Company Agent can keep answering (working) while the Company looks for a person (handoff pending), and responder stays agent until someone actually sits down.

The turn I want to stick is the second table. When the Company asks for the User, it cannot seat them: it can only put an invitation on the table, which changes no state field. Your agent decides, with you, whether to open the Direct Conversation, a smaller table linked to the first, where you speak for yourself and your agent watches. While it is open, the first table is paused, and the reader can press their agent's message there to see 409 direct_conversation_open. That is the answer to the title's question in its strongest form: the protocol not only labels every word, it gives you a door into the conversation that only your own agent can open.

I made the reader drive both sides, because the interesting cases are the Company's choices: a person joins, or nobody is free and the Company Agent says so. To keep the machine small enough to check every state, I left two of section 8's choices out of the buttons and kept them in words and tests: a cancelled handoff may or may not take effect (the model tests both kinds of help desk), and sign-in during a conversation (the model tests 8.2's ownership table, which a step shows as requests that all look like "not found"). The model's agent also waits for the first conversation to settle before you are brought in; the specification does not require that, and the refusal says it is this model's choice.

The reply in a POST's answer is the protocol's other surprise for a developer used to chat APIs: a 202 means accepted, not answered. So reading is a press of its own, working stays true until the agent has read, and the close button refuses while working is true, because a close does not wait its turn and could drop what was sent.
