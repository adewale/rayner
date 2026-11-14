# Can an agent use a key it never sees?

- **Reader:** a developer who lets a coding agent run commands and wants it to start an app that needs an API key, without pasting the key into the conversation; knows what an environment variable is, not how 1Password's `op` CLI resolves references.
- **Answer:** The agent handles only an op:// reference, and op puts the value into the app’s environment
- **Changed condition:** none: the explainer has no setting. Its comparison is within one run: a query that matches a title against a typo that only comes close in spelling, and op's environment, which holds the reference, against the app's, which holds the value.
- **Reader's own work:** predict what the agent could pass along instead of the key, and what "cloud api" and the typo "databse" return; the three check questions ask about a query whose words are in no title, an app that prints its environment, and a transcript pasted into a team chat.
- **Checked against:** the upstream code: the model ports `find` and `run` from kitlangton/2password at commit e011177 with an in-memory vault of its own test items, and `model.test.ts` checks the port gives the answers upstream's test/find.test.ts asserts, that no field value appears in any answer find prints, that changing every secret changes no answer, and that `run` strips the service-account token only when op holds one; `answers.ts` computes the check answers from the model. Nothing runs against a live vault or the real `op`; the one-desktop-approval count is the upstream README's, not observed.
- **Grounding:** read: kitlangton/2password’s code at commit e011177, ported, and the answers its tests assert
- **Leaves out:** service accounts (the page shows desktop approvals only); a sandbox or output redaction, since the app can still print or send what it receives; that reference names reveal vault and item names; and whether the wrapper process transiently handles secret-bearing bytes (the claim is about what reaches the agent's output).

## Check yourself

1. The agent searches for “cloud key”, hoping to find the API key. What does find return, and why?
   Nothing. No title contains “key”, so nothing matches, and no title is spelled close enough to be suggested (the closest scores 0.500 against a cut-off of 0.6). find compares the query with titles only; it cannot know that Cloud API holds a key, and it makes 1 op call, the item list, without fetching any item.
2. The app prints API_KEY to stdout, and the agent reads stdout. Does passing a reference prevent that disclosure?
   No. The app receives the resolved key and can print it. References keep field values out of find’s output and the launch request; they do not sandbox the app or redact its output.
3. The agent’s transcript, containing op://Personal/Cloud API/credential, is pasted into a team chat. What does the team learn, and can they read the key?
   They learn names: a vault called Personal, an item titled Cloud API and a field called credential. Reading the value still needs an op session with access to that vault; the reference carries no permission. The names themselves can still be sensitive, since they say which vaults and items exist.

## Why this explainer

The question is what reaches the agent, and the answer is a name instead of a value: an op:// reference names a vault, an item and a field, carries no permission, and is resolved by the authenticated op CLI only when it starts the app. The reader should leave able to separate choosing a credential, which needs only titles, from using it, which happens in the process that needs it, and should not mistake that boundary for a sandbox: the app can still disclose what it receives.

The search step shows why finding needs no secrets: find compares queries with titles, so "cloud api" matches Cloud API and the typo "databse" comes back as a suggestion for Database, while the item get that does fetch field values stops at the wrapper. The suggestion rule stays off the page because fuzzy ranking is not the question. For a query that matches no title, each query word scores its best title word as 1 − edits ÷ longer length, and a title averaging 0.6 or more is suggested ("databse" scores 1 − 1/8 = 0.875); the first check answer quotes the score of "cloud key" for readers who want the number.

An earlier version offered service accounts as a setting; it changed one sentence and no conclusion, since the agent receives references either way, so it was dropped. With a service account, `run` also starts the app through `env -u OP_SERVICE_ACCOUNT_TOKEN` so the token stops at op; the model keeps that (`run('service', …)`) and its test.

The check answers were computed from the model (`find`, `closeness` in `model.ts`); recompute them if the port or its sample items change.
