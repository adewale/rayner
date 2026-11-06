# 2password notes

The model ports find and run from 2password at commit e011177 and uses its sample items. Title matching and suggestion scores are computed locally; the examples do not contact a live vault. The desktop-approval count is a behavior described by the upstream README, not an observed approval flow in this scene.

The suggestion rule stays off the page because the question is what reaches the agent, not how fuzzy search ranks. For a query that matches no title, each query word scores its best title word as 1 − edits ÷ longer length, and a title averaging 0.6 or more comes back as a suggestion: “databse” is one insertion from “database”, 1 − 1/8 = 0.875. The first check question’s answer quotes the score of “cloud key” for readers who want the number.

The wrapper receives an item-get response and discards field values before returning its decoded result. The claim is about what reaches the agent’s output, not an assertion that the wrapper process never transiently handles secret-bearing bytes.

The page shows desktop approvals only. With a service account, `run` also starts the app through `env -u OP_SERVICE_ACCOUNT_TOKEN`, so the account token stops at op (the model’s `run('service', …)`, tested in `test/explain-models.test.ts`). An earlier version offered it as a setting; it changed one sentence and no conclusion, since the agent receives references either way. This is not a sandbox or an output-redaction mechanism, and reference names themselves can reveal vault and item metadata.
