"""Claims for cert-renewal (rounds 2 and 3): the plain page, the Rayner page and the method-only page."""

D = 'scenes/explainers/cert-renewal/'
T = D + 'model.test.ts'
M = D + 'model.ts'
VEC = T + ':11-22 (Certbot v5.8.0 renewal_test.py:272-280: 8- and 18-day certificates renew at day 4 and day 12; under 10 days half, else two thirds; renewal.py:425-429)'
VEC7 = T + ':24-51 (Certbot v5.8.0 renew_before_expiry vectors on a 7-day certificate)'
FIX = T + ':53-62 (Certbot 3.3 constants.py:155 "30 days", storage.py:1010) and ' + M + ':31-43 (4.1+ uses renew_before_expiry only when set, renewal.py:475-482)'
BACK = T + ':64-71 (notBefore backdated 58.5 minutes; validity one second short)'
SCEN = T + ':73-89 (model: [run that renews, renewals in 365 days, refused]: 90d 1440h/6/0 both; 64d 43d/8/0 and 34d/10/0; 45d 30d/12/0 and 15d/24/0; 160h 84/104/0 and 12/264/465)'
MARGIN = T + ':91-111 (30 days back from expiry: 2160-720, 1536-720, 1080-720 hours, and 160-720 = 560 hours before notBefore)'
GCRA = T + ':113-123 (Boulder ratelimits/gcra_test.go TestDecide vector)'
LIMIT = T + ':125-144 (5 per 168 h, one token every 33.6 h; a refused order spends nothing; an ARI-exempt order skips the check, wfe.go:2297, 2488)'
SEQ = T + ':146-152 (160 h under the 30-day rule: issued at hours 0,12,24,36,48,60,72,108,144,168,204,240; refused 84,96,120,...)'
BWIN = T + ':154-165 (Boulder RenewalInfoSimple worked by hand: 45 days 2,554,324-2,632,013 s; 160 h 284,029-295,478 s after notBefore)'
LIVE = T + ':167-194 (ARI windows Let\'s Encrypt served on 2026-10-25 for ten 90-day certificates: each opens 59.11 days and closes 60.91 days after notBefore)'
ARIRUNS = T + ':196-209 (Certbot client.py:365-368 uniform draw; a run at t renews with chance (t - start)/(end - start); 45d runs 720 and 732 h, 11 or 12 a year; 30-day setting at day 15 first; 160 h renews at 84)'
TABLES = T + ':211-238 (Baseline Requirements 2.3.1 6.3.2: 398 until 2026-03-15, 200, 100 from 2027-03-15, 47 from 2029-03-15; Let\'s Encrypt: tlsserver 45 from 2026-05-13, classic 64 from 2027-02-10, 45 from 2028-02-16)'
PROFILES = M + ':17-23 (Let\'s Encrypt docs/profiles.md: classic 90 days, shortlived 160 hours)'
CRON = M + ':67 (using.rst:965, "0 0,12 * * *")'
ORDER = M + ':103-160 (Boulder: an order skips the new-order limits only when replaces names a certificate of the account, not replaced before, arriving inside its ARI window, wfe2/wfe.go:2258-2297, 2488; a refused order spends nothing; issuing spends a token) and ' + M + ':218-229 (Certbot 5.8.0 new order carries identifiers and profile only, acme/client.py:115-135)'
PROP = T + ':240-269 (properties: due from issue exactly when the lifetime is at most 30 days; the 30-day rule renews at least as often as the default exactly up to 90 days)'
NONE = 'No recorded value, model rule or pinned source in the oracle covers this.'

ORACLE = ('Certbot v5.8.0\'s renewal test vectors and the Certbot 3.3, 4.1 and 5.8 lines cited in ' + M + '; Boulder\'s GCRA TestDecide vector and RenewalInfoSimple; the ARI windows Let\'s Encrypt served for ten sites on 2026-10-25; '
          'the Baseline Requirements and Let\'s Encrypt lifetime tables; all in ' + T + '. The year-long renewal counts are the model\'s own simulation of twice-daily runs (' + M + ' simulate).')

PAGES = {
    'plain': {'file': 'bench/premise/cert-renewal/plain.html', 'round': 2, 'how': 'Written by a fresh session with no repository from the question and Reader line (bench/premise/README.md, round 2).'},
    'rayner': {'file': 'scenes/explainers/cert-renewal (rayner describe at 5e9d07d4)', 'round': 2, 'how': 'The catalogued explainer; text read from `rayner describe`.'},
    'method': {'file': 'bench/premise/cert-renewal/method.html', 'round': 3, 'how': 'Method-only page (bench/premise/cert-renewal/method/), built for round 3 with the model and oracle and no engine.'},
}

CLAIMS = [
    ('plain', 1, 'right', 'Public certificates are heading for 47 days', TABLES, ''),
    ('plain', 1, 'right', 'Some are as short as six days', PROFILES, ''),
    ('plain', 1, 'right', 'Recent Certbot releases renew at a share of the lifetime when renew_before_expiry is unset: with a third left, or at half under about ten days', VEC, ''),
    ('plain', 1, 'right', 'ARI is ACME Renewal Information, RFC 9773', D + 'scene.ts:187 (the scene\'s sources cite https://www.rfc-editor.org/rfc/rfc9773.html#section-4.2 for the ARI window)', ''),
    ('plain', 1, 'right', 'renew_before_expiry = 30 days fixes the margin in days', FIX, ''),
    ('plain', 1, 'unverifiable', 'Lifetimes stayed at 90 days for years', NONE + ' (history)', ''),
    ('plain', 1, 'right', 'A fixed 30 days renews 90-, 64- and 47-day certificates at day 60, 34 and 17; a certificate of 30 days or less is due from issue', MARGIN + '; ' + PROP, 'model'),
    ('plain', 1, 'right', 'On 47-day certificates the fixed rule issues about twice as many as needed', M + ' simulate: 21 against 11 a year for 47 days', 'model'),
    ('plain', 1, 'right', 'A certificate born inside the window is renewed at every run', VEC7 + '; ' + SEQ, ''),
    ('plain', 1, 'right', 'With a twice-daily timer that is about 730 issuances a year', M + ' simulate: 729 runs ask in a year; ' + SCEN, 'model; the page then says the CA limits them'),
    ('plain', 1, 'right', 'Let\'s Encrypt limits certificates for the same set of names per week', LIMIT, ''),
    ('plain', 1, 'wrong', '"Then renewals start failing, and once they keep failing the certificate expires" (and the simulator\'s verdict: "renewals will fail, and the certificate will then expire")', LIMIT + '; ' + SEQ + '; ' + SCEN + ' (160 h under the 30-day rule: 264 issued, 465 refused a year; every lifetime from 6 to 30 days gives the same)', 'renewals keep getting through every 24 to 36 hours'),
    ('plain', 1, 'right', 'The setting looks fine until the lifetime drops to the margin, then renews at every run', PROP, 'model'),
    ('plain', 1, 'right', 'A calendar job every 60 days on 47-day certificates leaves 13 days expired', 'Arithmetic: 60 - 47 = 13', 'arithmetic'),
    ('plain', 1, 'right', 'Simulator default (47 days, 30-day margin, twice a day): day 17 (36%), 30 days of margin, 60 tries, about 21 a year', M + ' summarize on 47 days, fixed30', 'model'),
    ('plain', 1, 'right', 'Certbot\'s default timer runs twice a day', CRON, ''),
    ('plain', 1, 'unverifiable', 'Caddy renews with a third left', NONE, ''),
    ('plain', 1, 'unverifiable', 'cert-manager renews at two thirds by default; renewBeforePercentage', NONE, ''),
    ('plain', 1, 'right', 'CAs offering six-day certificates recommend renewing around half way', BWIN, ''),
    ('plain', 1, 'right', 'Table: the fixed rule\'s renewal day for 398, 200, 100, 90, 64, 47, 45 and 6 days', MARGIN + ' (lifetime - 30 days; from issue at 30 days or less)', 'model'),
    ('plain', 1, 'right', '398, 200, 100 and 47 days are the CA/Browser Forum caps, in steps from 2026 to 2029', TABLES, ''),
    ('plain', 1, 'right', '90, 64 and 45 days are typical ACME defaults in the transition', TABLES + '; ' + PROFILES, ''),
    ('plain', 1, 'right', 'Six-day certificates are already offered', PROFILES, ''),
    ('plain', 1, 'right', 'With ARI the CA answers with a window and the client picks a random time in it', ARIRUNS, ''),
    ('plain', 1, 'right', 'The window normally sits around two thirds', BWIN + '; ' + LIVE, ''),
    ('plain', 1, 'unverifiable', 'The CA can move the window earlier before a revocation', NONE, ''),
    ('plain', 1, 'unverifiable', 'ARI spreads renewals and lets the CA ask for early replacement', NONE, ''),
    ('plain', 1, 'right', 'Some CAs exempt ARI-guided renewals from rate limits', ORDER + '; ' + LIMIT, 'loosely: Boulder also requires the order to name the certificate it replaces'),
    ('plain', 1, 'unverifiable', 'Certbot\'s file paths and commands (renewal/<name>.conf, cli.ini, --dry-run, the systemd timer)', NONE, ''),
    ('plain', 1, 'right', 'Deleting renew_before_expiry lets the proportional default and ARI apply on a current Certbot', FIX + '; ' + VEC, ''),
    ('plain', 1, 'unverifiable', 'acme.sh, lego and scripts often use 30 days', NONE, ''),

    ('rayner', 1, 'right', 'BR caps of 398, 200, 100 and 47 days, with their dates', TABLES, 'published table'),
    ('rayner', 2, 'right', 'Let\'s Encrypt: tlsserver 45 days since May 2026; classic 90, 64 from February 2027, 45 from February 2028; shortlived 160 hours', TABLES + '; ' + PROFILES, 'published dates'),
    ('rayner', 1, 'right', 'Certbot 3.3 renews within renew_before_expiry, 30 days unless set', FIX, 'cited source'),
    ('rayner', 1, 'right', 'Let\'s Encrypt dates a certificate 58.5 minutes before issuing it', BACK, ''),
    ('rayner', 1, 'right', 'A 90-day certificate falls due just before the run at day 60', T + ':53-62; ' + SCEN, 'model'),
    ('rayner', 4, 'right', '30 days before expiry is day 60 (67%), day 34 (53%), day 15 (33%), and 23.3 days (560 hours) before issue for 160 hours', MARGIN, 'model'),
    ('rayner', 1, 'right', 'Certbot 4.1\'s default: two thirds, half under ten days, unless ARI sets the window (RFC 9773)', VEC + '; ' + FIX + '; ' + D + 'scene.ts:187 (RFC 9773 cited)', ''),
    ('rayner', 4, 'right', 'The default renews at day 60, 42.7 (run at 43), 30, and hour 80 (run at 84)', VEC + '; ' + SCEN, 'model on Certbot\'s vectors'),
    ('rayner', 5, 'right', 'Renewals a year: 6 and 6, 8 and 10, 12 and 24, 104 and 264 with 465 refused; 3 and 13 in two weeks', SCEN, 'model simulation'),
    ('rayner', 4, 'right', 'Margin left when renewal falls due, and the runs it allows (30 days/60 runs, 21.3 days/42, 15 days/30, 80 hours/7)', M + ' summarize; ' + SCEN, 'model'),
    ('rayner', 3, 'right', 'Boulder skips the limit only for an order naming the certificate it replaces, inside its window; Certbot 5.8\'s order names none; a refused order costs nothing, an issued one takes a token', ORDER + '; ' + LIMIT, 'cited source'),
    ('rayner', 5, 'right', 'ARI windows: day 59.1 to 60.9, 42 to 43.3, 29.6 to 30.5, hour 78.9 to 82.1; 1% of the life either side of two thirds or half', BWIN + '; ' + LIVE, ''),
    ('rayner', 4, 'right', 'Run probabilities and renewal counts under ARI', ARIRUNS, 'model'),
    ('rayner', 1, 'right', 'An explicit 30-day setting renews before the window opens, so the ARI answer changes nothing', ARIRUNS + '; ' + FIX, 'model'),
    ('rayner', 1, 'right', '160 hours with 30 days: every run renews until hour 84, then most are refused; later renewals 24 to 36 hours apart', SEQ, 'model; tested sequence'),
    ('rayner', 1, 'right', '5 per 7 days, one back every 33.6 hours', LIMIT + '; ' + GCRA, ''),
    ('rayner', 1, 'right', 'Check 1: 20-day certificates, 264 renewed and 465 refused from hour 84; the default at day 13.3, 27 a year', D + 'answers.ts (from ' + M + ' simulate); ' + PROP, 'model'),
    ('rayner', 1, 'right', 'Check 2: a 10-day setting renews 45-day certificates at day 35 with 20 runs left, replacing the default (day 30, 30 runs)', D + 'answers.ts; ' + FIX, 'model; cited source'),
    ('rayner', 1, 'right', 'Check 3: an ARI-timed order is exempt only if it names its predecessor', ORDER, 'cited Boulder'),
    ('rayner', 1, 'right', 'Certbot 4.1 and later ask Let\'s Encrypt when to renew', ARIRUNS + ' (renewal.py:378-392)', 'cited source'),
    ('rayner', 1, 'right', 'The documented cron runs at 00:00 and 12:00', CRON, ''),
]

for page, count, grade, claim, evidence, note in list(CLAIMS):
    if page != 'rayner':
        continue
    c = claim.replace('The documented cron runs at 00:00 and 12:00', 'Certbot\'s documented cron line runs certbot renew twice a day')
    CLAIMS.append(('method', count, grade, c, evidence, note))
CLAIMS += [
    ('method', 1, 'right', 'ARI step at 90 days: the ten live windows recorded on 2026-10-25 all open at day 59.11 and close at day 60.91 after notBefore', LIVE, 'recorded'),
    ('method', 1, 'right', 'Limit picture (160 hours, 30-day rule): in the first ten days 12 certificates are issued and 9 runs refused', SEQ, 'tested sequence'),
    ('method', 1, 'right', 'Intro: dates and counts come from a model tested against Certbot 5.8.0\'s and Boulder\'s test vectors and the ARI windows of 2026-10-25; the yearly counts are the model\'s own simulation',
     'bench/premise/cert-renewal/method/oracle.ts (copied from ' + T + '); bench/premise/cert-renewal/method/method.test.ts', ''),
]
