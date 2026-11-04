# 2password notes

The model ports find and run from 2password at commit e011177 and uses its sample items. Title matching and suggestion scores are computed locally; the examples do not contact a live vault. The desktop-approval count is a behavior described by the upstream README, not an observed approval flow in this scene.

The wrapper receives an item-get response and discards field values before returning its decoded result. The claim is about what reaches the agent’s output, not an assertion that the wrapper process never transiently handles secret-bearing bytes.

Both authentication cases preserve references at the agent boundary. The service-account case additionally strips the account token from the child app. This is not a sandbox or an output-redaction mechanism, and reference names themselves can reveal vault and item metadata.
