# Script: when should a short-lived certificate renew?

Questions the reader brings: Certificates are getting shorter; will my renewal job cope? Is "renew 30 days before expiry" still right? What is ARI?

Public TLS certificates are shrinking. The CA/Browser Forum's cap was 398 days until March 2026, then 200, 100 from March 2027 and 47 from March 2029. Let's Encrypt moves faster: its default profile goes from 90 days to 64 in February 2027 and 45 in February 2028, its tlsserver profile already issues 45-day certificates, and its shortlived profile issues 160-hour ones. Renewal jobs written for year-long certificates now meet short ones.

Certbot 3.3 renews 30 days before expiry. On a 90-day certificate that is day 60, and the twice-daily run just after replaces it. The reader is asked what the same rule does to a 160-hour certificate (or whichever lifetime they chose).

Certbot 4.1 changed the rule, and that change is the answer: renew at a share of the certificate's life, not a fixed time before expiry. With the setting unset it renews two thirds of the way through, or half way under ten days, unless the CA sends an ARI answer, a renewal window of its own (RFC 9773). On 90-day certificates the two rules agree. On a 160-hour certificate they cannot: thirty days is longer than its whole life, so under the old rule every run tries to renew.

Two weeks of runs show it. Under the 30-day rule every run renews until, at hour 84, Let's Encrypt starts refusing most of them: it allows 5 certificates for the same names in 7 days and gives one back every 33.6 hours, so in a year 465 runs are refused. Under the default rule the certificate falls due at hour 80, the run at hour 84 replaces it, and 80 hours remain to retry if something fails. On 45-day certificates the old rule renews twice as often as the new one; on 90-day ones they agree.

Certbot's renewals are not exempt from that limit: Boulder skips the check only for an order that names the certificate it replaces and arrives inside its ARI window, and Certbot 5.8 names none. Last, the ARI window itself: a window 1% of the life either side of half way (or two thirds), in which each run draws a random time. A 30-day setting still fires before the window opens, so the CA's answer changes nothing until the setting is removed.

**The aha:** the strip of a 160-hour certificate under the 30-day rule fills with blue ticks at every run, then turns red at hour 84.

**Sentence to remember:** renew at a share of the certificate's life, not a fixed time before expiry.

**Check questions**, in `meta.checks`, asked after the last step:

1. Certbot is set to renew 30 days before expiry, and the certificates last 160 hours. What happens?
2. For 45-day certificates, how often does the 30-day rule renew compared with Certbot 4.1's default?
3. Why do Certbot 5.8's renewals still count against Let's Encrypt's limit?

**Cases:** lifetime (90, 64 and 45 days, and 160 hours, the default) and rule (the 30-day rule, the default, or Certbot 4.1's). The 90-day case shows the two rules agree; 45 days, that the old rule renews twice as often; 160 hours, that it meets the rate limit.

| Step | Script | Reader predicts |
| --- | --- | --- |
| limit | paragraph 1: the cap shrinks | |
| letsencrypt | paragraph 1: Let's Encrypt's schedule and profiles | |
| old-rule | paragraph 2: Certbot 3.3 on a 90-day certificate | what the rule does to the chosen lifetime |
| new-rule | paragraph 3: the answer, ARI named, and the prediction's payoff | |
| year | paragraph 4: the chosen rule over two weeks or a year | |
| other-rule | paragraph 4: the other rule beside it | |
| slack | paragraph 4: the rate limit, or the time left to retry | |
| replaces | paragraph 5: why renewals count against the limit | |
| ari | paragraph 5: the ARI window, and what a set interval does to it | |
