# Script: can an agent use a key it never sees?

Questions the reader brings: If I let a coding agent run my app, does it have to see my API key? How would it pick the right key from my vault without reading them?

A coding agent is asked to run `app`, which reads its key from `API_KEY`. Whatever the agent reads lands in its context and its transcript, so it should choose the key and start the app without ever holding the value. What could it pass along instead?

A reference. `op://Personal/Cloud API/credential` names a vault, an item and a field, and is no secret itself. The agent handles only an op:// reference, and op puts the value into the app's environment. 2password is a small wrapper around 1Password's `op` CLI that gives the agent references to search for and to run with.

The agent still has to choose which key. `2password find` asks op for the vault's item titles and searches those names, so nothing secret is read to make the choice. Ask for "cloud api" and the typo "databse" among the three sample items from 2password's own tests. Cloud API contains every word of "cloud api", so it matches. No title contains "databse", so find scores each title word against it, 1 − edit distance ÷ the longer word's length, and Database, one edit away, scores 0.875 and comes back as a suggestion.

find makes two op calls: item list for the titles, and one item get for the two items it needs. 2password's README says that costs one desktop approval; with a service-account token, none. Its output is one reference per query, with every field value dropped while op's reply is decoded.

Then `2password run --env "API_KEY=op://…" -- app`: op resolves the reference and starts the app with the value in its environment. With a service account op also holds `OP_SERVICE_ACCOUNT_TOKEN`, so 2password has op start `env -u OP_SERVICE_ACCOUNT_TOKEN app` and the token stops at op. The agent handled only the reference; the app can still print what it was given.

**The aha:** the value exists only on the far side of op; on the agent's side there is a name for it, which is enough to choose and to run.

**Sentence to remember:** the agent searches titles and passes op:// references; op swaps in the value as it starts the app, so the agent never reads the key.

**Check questions**, in `meta.checks`, asked after the last step:

1. The agent searches for "databse". What does find return, and why that item?
2. How many secret values appear in find's output for the two queries?
3. How many op calls does find make, and what is each for?

The model is a port of 2password's `find` and `run` at commit e011177, tested against the assertions in its own `test/find.test.ts`. The cases are the two ways op authenticates.

| Step | Script | Reader predicts |
| --- | --- | --- |
| ask | paragraph 1, the agent that must not read the key | what it could pass instead |
| reader-boundary | paragraph 2, the reference and the answer | |
| boundary | paragraph 3, choosing by title | what "cloud api" and "databse" return |
| match | paragraph 3, the match and the scored suggestion | |
| fetch | paragraph 4, two op calls and their approvals | |
| reference | paragraph 4, the output holds references only | |
| run | paragraph 5, op starts the app; env -u with a service account | |
