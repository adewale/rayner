# When should a short-lived certificate renew?

- **Reader:** runs or configures certificate renewal (Certbot or a job like it), knows a certificate has an issue date and an expiry, and has a renewal setting written for ninety-day certificates; has not worked out what that setting does as lifetimes shrink.
- **Answer:** renew at a share of the certificate’s life, not a fixed time before expiry
- **Changed condition:** the certificate lifetime (90, 64 or 45 days, or 160 hours) and the renewal rule (the 30-day margin or Certbot 4.1’s default). At 90 days both rules renew at day 60; at 45 days the 30-day rule renews twice as often; at 160 hours the 30-day rule makes every certificate due from issue, so every twice-daily run renews until Let’s Encrypt’s limit refuses it at hour 84, while the default waits until half way.
- **Reader's own work:** predict when a 30-day margin renews a certificate of the chosen lifetime before the margin step answers; switch the lifetime and the rule and compare the renewal counts and refusals; answer the check questions, which ask about a lifetime, a setting and an ARI order that no scenario shows.
- **Checked against:** Certbot’s own test vectors (v5.8.0 `renewal_test.py`: the default renewal time for 8- and 18-day certificates and `renew_before_expiry` on 7-day certificates), Boulder’s GCRA `TestDecide` vector and `RenewalInfoSimple` worked by hand, the ARI windows Let’s Encrypt served for ten sites on 2026-10-25, and the Baseline Requirements and Let’s Encrypt lifetime tables as published, all in `test/explain-cert-renewal.test.ts`. The twice-daily run schedule and the year-long renewal and refusal counts are the model’s own simulation, not measured from a running Certbot.
- **Leaves out:** a captured CA ARI response (the ARI window is modelled from Boulder’s rule, with repeated random draws), backdating jitter beyond Boulder’s fixed 58.5 minutes, other Let’s Encrypt limits, ACME clients other than Certbot 3.3, 4.1 and 5.8, failures of the CA or the challenge, and any forecast for a real installation; the policy dates are the published schedules, not a live lookup.

## Check yourself

1. A CA issues 20-day certificates, and Certbot keeps renew_before_expiry at 30 days. How many certificates does it get in a year, and how many would the 4.1 default get?
   With the 30-day setting, 264 renewed and 465 runs refused, the first at hour 84, exactly as for 160-hour certificates: any certificate shorter than 30 days is due from issue, so every run asks until the limit refuses. The default renews two thirds of the way through, since 20 days is not under ten: at day 13.3, 27 times a year.
2. For 45-day certificates, someone sets renew_before_expiry to 10 days. When does Certbot 4.1 renew, and how long is left to retry?
   At day 35, the first twice-daily run within 10 days of expiry, leaving 20 runs to retry. The setting replaces the default rather than adding to it: without it Certbot would renew at day 30 with 30 runs to spare.
3. A client renews at a random time inside Let’s Encrypt’s ARI window. Is that order exempt from the 5-in-7-days limit?
   Not by its timing alone. Boulder exempts an order only when it names the certificate it replaces and arrives inside that certificate’s window. Certbot 5.8’s orders name no predecessor, so they are counted even when they follow the window.

## Why this explainer

A renewal job written for ninety-day certificates often says “renew thirty days before expiry”, and the setting outlives the lifetime it was written for. Certificate lifetimes are shrinking (the CA/Browser Forum cap reaches 47 days in 2029, and Let’s Encrypt already issues 160-hour certificates), so the reader should see what a fixed margin does to a certificate shorter than the margin: it is due from the moment it exists, and an occasional renewal becomes repeated issuance.

The aha is the margin picture: a ninety-day certificate and the scenario’s certificate drawn to one time scale and lined up at expiry, so the thirty-day due point sits the same distance from the right-hand end of both bars and falls before the short one was issued. The fractional rule then scales with the lifetime, and for ninety days the two rules agree, which is why the change looked harmless.

The rate limit is shown as a consequence of the unnecessary requests, not as the problem to solve; polling more often would not repair the rule. The 45-day lifetime is there because both rules renew before expiry, yet the fixed margin uses certificates twice as fast. The ARI and exemption steps close the boundary: a CA’s renewal window cannot help when an explicit interval fires first, and following the window is not the same as naming the replaced certificate, which Certbot 5.8 does not do.

The model compares Certbot 3.3’s fixed interval, the 4.1 default (4.1, not 4.0: 4.0 still merged the 30-day default into every lineage) and behaviour read from 5.8, where an explicit stored 30-day interval takes precedence over the newer default. The check answers’ numbers were computed from the model (`scenes/explainers/cert-renewal/model.ts`) when they were written here; if the model changes, recompute them.
