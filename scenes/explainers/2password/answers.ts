// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { ITEMS, SUGGESTION_THRESHOLD, closeness, find, terms } from './model.ts';

/** The first question's query, which matches no title, and what find returns for it. */
export const query = 'cloud key',
  result = find([query]);
const best = Math.max(...ITEMS.map((i) => closeness(terms(query), i.title))).toFixed(3),
  calls = result.opCalls.length;
const m = find(['cloud api']).matches[0]!,
  [vault, title, field] = m.ref.slice('op://'.length).split('/');

export const questions = {
  1: () => ({
    question: `The agent searches for “${query}”, hoping to find the API key. What does find return, and why?`,
    answer: `Nothing. No title contains “key”, so nothing matches, and no title is spelled close enough to be suggested (the closest scores ${best} against a cut-off of ${SUGGESTION_THRESHOLD}). find compares the query with titles only; it cannot know that ${title} holds a key, and it makes ${calls} op call, the item list, without fetching any item.`,
  }),
  3: () => ({
    question: `The agent’s transcript, containing ${m.ref}, is pasted into a team chat. What does the team learn, and can they read the key?`,
    answer: `They learn names: a vault called ${vault}, an item titled ${title} and a field called ${field}. Reading the value still needs an op session with access to that vault; the reference carries no permission. The names themselves can still be sensitive, since they say which vaults and items exist.`,
  }),
};
