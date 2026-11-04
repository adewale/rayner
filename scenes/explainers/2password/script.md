# Can an agent use a key it never sees?

A coding agent needs to start an app that reads API_KEY. Pasting the key into the conversation would give the agent a value it does not need to reason about. Could it name the credential without receiving that value?

An op:// reference does that. op://Personal/Cloud API/credential identifies a vault, an item and a field. The reference tells 1Password’s op CLI where to look; it does not contain the key or grant permission to read the vault. The authenticated CLI resolves it when it starts the app.

The agent still needs to find the right item, and 2password’s find command compares its query with item titles, not with what the items hold. Cloud API contains both words of “cloud api”, so it matches. The typo “databse” is in no title, so find compares spellings instead: one inserted letter turns it into “database”, a score of 1 − 1/8 = 0.875, above the 0.6 threshold, and Database comes back as a suggestion rather than a match. A query that neither matches a title nor scores 0.6 against one finds nothing, whatever the items hold.

Finding by title separates choosing an item from using its secret. The wrapper obtains the selected item information, drops field values while decoding the reply, and returns references. In the shown search, two op calls provide the titles and the selected items. The agent gets names it can pass onward rather than the credentials themselves.

The run command passes API_KEY’s reference to op, which starts the app with the resolved value in its environment. In the service-account case, the wrapper also removes OP_SERVICE_ACCOUNT_TOKEN from the app’s environment. The app needs its API key; it does not need the token used to obtain that key.

This boundary reduces what must enter the agent’s conversation. It does not make the app unable to disclose a secret: an app can print its environment or send a value elsewhere. The distinction is between handing a credential to the process that uses it and exposing it to the agent as part of choosing and launching that process.
