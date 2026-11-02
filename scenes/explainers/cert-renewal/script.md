# When should a short-lived certificate renew?

A renewal job written for a ninety-day certificate can behave badly when the same service starts issuing much shorter ones. Certificate lifetimes are shrinking, but a setting such as “renew thirty days before expiry” still names the old amount of time. What happens when the certificate lasts only 160 hours?

Thirty days exceeds its entire lifetime. The certificate is already inside the renewal period when it is issued. A twice-daily job therefore tries again at its next run, and a successful replacement is immediately due under the same rule. Shorter certificates turn an occasional renewal into repeated issuance.

A rule based on a share of the lifetime scales with the certificate. Certbot 4.1’s default renews two thirds of the way through a normal lifetime and halfway through one shorter than ten days. For a ninety-day certificate the thirty-day rule and the fractional rule agree. For a 160-hour certificate the default leaves roughly half its life available for retries instead of treating it as due from the start.

The repeated requests also encounter an issuance limit. The modeled Let’s Encrypt limit allows five certificates for the same names in seven days, with capacity recovering over time. In the short-lived example the thirty-day rule first meets a refusal at hour 84. The limit is a consequence of the unnecessary requests; making the polling job more frequent would not repair the renewal rule.

Forty-five-day certificates provide another contrast. A thirty-day margin makes them due after about fifteen days, while the fractional default waits about thirty. Both are before expiry, but the fixed margin consumes certificates twice as quickly.

A CA can also send an ARI renewal window, telling the client when replacement would be useful. That advice cannot help if an explicit interval makes the client renew earlier anyway. The client’s configuration and implementation still matter: the Certbot version represented here does not name the replaced certificate in the order needed for the modeled ARI rate-limit exemption. A window, a due-time rule and an exemption are three different parts of the renewal process.
