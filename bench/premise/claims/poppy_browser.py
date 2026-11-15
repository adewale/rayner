"""Claims for poppy-browser (round 3 trio): the plain page, the method-only page and the Rayner page."""

D = 'scenes/explainers/poppy-browser/'
T = D + 'model.test.ts'
M = D + 'model.ts'
FLOW = M + ':5-14 (section 6: the Company\'s browser-session page gives the browser a one-time code and, in the same response, a short-lived cookie tying the code to that browser; the agent authorizes the code in a request of its own, with its Session header and, if signed in, its access token; the browser then submits the code with the cookie; only then does the Company set the Session\'s cookie)'
STEP1 = T + ':63-85 (6 step 1: page served 200 with the code; join cookie __Host-poppy_join, HttpOnly, Secure, SameSite=Strict, Max-Age 60; loading starts, ends and changes no Session; only the join cookie changes)'
STEP2 = T + ':86-104 (6 step 2: the Company checks the Session header, the scope, then the code; 204 and the code is recorded as authorized for the Session and, with a token, its account and scopes; a join without a token names the Session only, account null)'
SCOPE = T + ':105-111 (a token without poppy:browser-sign-in gets 403 insufficient_scope; the same code can then be authorized without a token)'
STEP3 = T + ':113-140 (6 step 3: the browser that loaded the page joins with its cookie and the join cookie is cleared; every failed check is named; a code is used by the first request that submits it, whatever the result; a code without its cookie fails)'
FORGE = T + ':141-156 (10.6: an attacker\'s authorized code posted from evil.example fails because the browser sends no join cookie with a cross-site form; the __Host- prefix stops another host on the domain planting one; without the prefix the agent\'s browser would join the attacker\'s Session, account M)'
PHISH = T + ':158-171 (6 step 2 and 10.6: the agent authorizes only a code its own browser loaded; the Company cannot tell; a careless agent would put the attacker\'s browser in the User\'s Session, signed in)'
NOKEY = T + ':179-190 (the access token never appears in any state a browser reaches; step 3\'s request is the cookie and the code)'
LOGINS = T + ':192-205 and ' + M + ':259-265 (what a join does to an earlier login: no key leaves it, a key replaces it, and when the Session\'s sign-in ends (Session ends, cookie expires, User signs out or disconnects the agent, browser signs out, agent joins again without a token) the browser is signed out and the earlier login does not come back)'
UNSCOPED = T + ':207-222 (where the website cannot apply scopes, poppy:browser-sign-in allows everything the account can do there, approved and flagged, and the issuer sets web.unscoped)'
WEB = T + ':224-236 and ' + M + ':310-315 (web.disabled: the agent SHOULD NOT use a browser, a request the protocol cannot enforce)'
FETCH = T + ':238-251 (5.2: a page fetched with the agent\'s own client carries the Session header without a token, so it is signed out)'
STORY = T + ':252-280 (the story in each scenario: fetch 200; load 200; authorize 204 with or without a token, or 403 then 204; submit 303; browse signed in to A or signed out; forge 400; phish declined then 400)'
ENDPOINT = T + ':40-44 (endpoint https://example.com/poppy/browser-session, authorize URL .../authorize)'
STATUS = M + ':216 (the draft says "redirects" and "an error status" without numbers; 303 and 400 are this model\'s) and ' + M + ':416-424 (the draft gives a status only for the browser-session page; other pages are served 200 by this model)'
NONE = 'No rule or example of the draft, as the model and its tests pin it, covers this.'

ORACLE = ('The Personal Agent Protocol draft 1.0 (as published on 2026-11-13), section 6 and 10.6, read and not run, as ' + M + ' transcribes it and ' + T + ' pins it, test by test, with the draft\'s examples. '
          'There is no reference implementation, so nothing here was measured.')

PAGES = {
    'plain': {'file': 'bench/premise/poppy-browser/plain.html', 'round': 3, 'how': 'Written by a fresh session with no repository from the question and Reader line, with round 1\'s instruction word for word.'},
    'method': {'file': 'bench/premise/poppy-browser/method.html', 'round': 3, 'how': 'Method-only page (bench/premise/poppy-browser/method/), built with the model and the draft\'s pinned values and no engine.'},
    'rayner': {'file': 'scenes/explainers/poppy-browser (rayner describe at 3e71fe38)', 'round': 3, 'how': 'The catalogued explainer; text read from `rayner describe`.'},
}

CLAIMS = [
    ('plain', 1, 'unverifiable', 'Some things (a checkout page, a 3-D Secure prompt, a size picker) exist only as web pages', NONE, ''),
    ('plain', 1, 'right', 'The browser must join the same Session and must never get the key', FLOW + '; ' + NOKEY, ''),
    ('plain', 1, 'wrong', 'The agent uses the key over the back channel to ask the shop for a join code ("POST /api/session/join-code"); the shop mints the code H and returns it to the agent, which types it into the join form', FLOW + '; ' + STEP1 + '; ' + STEP2, 'in the draft the code comes from the Company\'s page to the browser, and the agent\'s request authorizes that code'),
    ('plain', 1, 'unverifiable', 'The join code lives for 30 seconds', M + ':20-23 (time is left out; only the join cookie\'s Max-Age 60 is pinned, ' + STEP1 + ')', ''),
    ('plain', 1, 'right', 'The code is bound to the Session and to one browser, is single-use and works only alongside that browser\'s join cookie', STEP2 + '; ' + STEP3, ''),
    ('plain', 1, 'right', 'The browser hands over the code and gets back an ordinary first-party session cookie that points at the same Session', STEP3, ''),
    ('plain', 1, 'right', 'From then on the cookie stands in for the seal in that browser, and the shop looks up what the Session allows on its own side', STORY + ' (browse: the Session cookie makes requests the Session\'s, with its account and scopes)', ''),
    ('plain', 1, 'unverifiable', 'The browser is exposed (third-party scripts, prompt injection, screenshots); an access token is a bearer credential usable from anywhere', NONE, ''),
    ('plain', 1, 'right', 'A browser cannot add the Session header to its requests; it sends cookies, so the web side needs a cookie', FLOW + ' (a browser sends cookies, not the agent\'s headers)', ''),
    ('plain', 1, 'unverifiable', 'The API door rejects cookies and the web door ignores tokens', NONE, ''),
    ('plain', 1, 'unverifiable', 'The shop\'s Session record holds the account, grant, limits, audit log and an end switch', NONE, ''),
    ('plain', 1, 'right', 'Step 1: the browser GETs the join page; the shop sets a random join cookie (HttpOnly, SameSite=Strict); no account is involved yet', STEP1, ''),
    ('plain', 1, 'wrong', 'The join page shows a challenge C = hash(J) of the join cookie (not a code), which the agent reads and sends; the code is bound to the browser through that hash', STEP1 + ' (the page shows the code itself; the Company pairs the code with the join cookie it set in the same response, ' + M + ':93 CodeRecord.cookie)', 'no challenge derived from the cookie in the draft'),
    ('plain', 1, 'right', 'The form is a same-site POST, so the browser attaches the join cookie', STEP3 + '; ' + FORGE, ''),
    ('plain', 1, 'right', 'The shop checks the code is unused and matches the cookie, burns the code, deletes the join cookie and sets the session cookie', STEP3, ''),
    ('plain', 1, 'right', 'Afterwards each page load carries the session cookie and the shop maps it to the Session', STORY, ''),
    ('plain', 1, 'right', 'The key is used only on the agent\'s back channel and never goes near the browser (not in a cookie, storage, URL or on screen)', NOKEY + '; ' + STEP2, ''),
    ('plain', 1, 'right', 'The join cookie is HttpOnly, Secure, SameSite=Strict: page scripts cannot read it and other sites cannot make the browser send it', STEP1 + '; ' + FORGE, ''),
    ('plain', 1, 'wrong', 'The shop mints (authorizes) a join code only for a caller that shows the key and the seal; only the holder of the key can get one', STEP2 + ' (a join without a token, seal alone, is authorized for the Session with no account); ' + STORY + ' (signed out: authorize 204 without a token)', 'a signed-out agent joins its browser with the seal alone'),
    ('plain', 1, 'unverifiable', 'The session cookie is __Host-, HttpOnly, Secure, SameSite=Lax', M + ':33-35 (SESSION_COOKIE name __Host-sb_session from the draft\'s example); its other attributes are not pinned', ''),
    ('plain', 1, 'right', 'The session cookie carries no permissions itself; it points at the Session', M + ':96-101 (Browser.session holds a value the Company maps to the grant)', ''),
    ('plain', 1, 'unverifiable', 'Putting the code in a URL would leak it into history, Referer headers, proxy logs and screenshots', NONE, ''),
    ('plain', 1, 'right', 'A leaked code is useless without the join cookie of the browser it belongs to', STEP3 + ' (a code without its cookie fails)', ''),
    ('plain', 1, 'unverifiable', 'A copied session cookie gives the website inside the Session until it ends, not the API or other accounts', NONE, ''),
    ('plain', 1, 'unverifiable', 'A token in localStorage could be read by any script and used from anywhere', NONE, ''),
    ('plain', 1, 'unverifiable', 'A cross-site form forcing a purchase fails because the session cookie is SameSite=Lax', NONE, ''),
    ('plain', 1, 'right', 'Login CSRF: an attacker\'s code from its own Session, submitted by the agent\'s browser, would put the agent in the attacker\'s account; it fails because a cross-site post carries no join cookie', FORGE, ''),
    ('plain', 1, 'unverifiable', 'API calls and browser clicks are logged under one Session', NONE, ''),
    ('plain', 1, 'wrong', 'The web side can be given less than the key allows but never more, because the browser\'s authority is read from the Session', UNSCOPED, 'where a website cannot apply scopes, poppy:browser-sign-in grants everything the account can do there'),
    ('plain', 1, 'right', 'Ending the Session, or the User revoking it, stops every session cookie that points at it', LOGINS, ''),

    ('rayner', 1, 'right', 'The agent\'s own HTTP fetch carries its seal and never its key, so it is signed out even when the agent is signed in', FETCH, ''),
    ('rayner', 1, 'unverifiable', 'The help page and the orders page answer 200; the redirect after a join is 303 and a failed submission 400', STATUS, 'the draft gives no numbers for these; the model chose them'),
    ('rayner', 1, 'right', 'A browser sends cookies, not the agent\'s headers, so it needs its own way into the Session', FLOW, ''),
    ('rayner', 1, 'right', 'A shop can ask agents not to browse (web.disabled) but cannot enforce it', WEB, ''),
    ('rayner', 1, 'right', 'The join page shows a one-time code and the same response sets a cookie tying the code to this browser', STEP1 + '; ' + FLOW, ''),
    ('rayner', 1, 'right', 'No page can read the join cookie', STEP1 + ' (HttpOnly)', ''),
    ('rayner', 1, 'right', 'The answer: the agent authorizes its browser\'s one-time code in a request of its own; the code works only with the cookie set in that browser', FLOW + '; ' + STEP2 + '; ' + STEP3, ''),
    ('rayner', 1, 'right', 'The agent sends the code with its seal and key; the Company checks the seal, finds poppy:browser-sign-in and authorizes the code for this Session, account and scopes: 204', STEP2, ''),
    ('rayner', 1, 'right', 'The key never touches the browser', NOKEY, ''),
    ('rayner', 1, 'right', 'The browser submits the code with the cookie; the Company checks the cookie fits, the code is authorized and unused; a code works once whatever the answer; then it sets the Session\'s cookie', STEP3, ''),
    ('rayner', 1, 'right', 'The joined browser browses signed in to account A, within the key\'s scopes, whatever cookies it had before', STORY + '; ' + LOGINS, ''),
    ('rayner', 1, 'right', 'Where a website cannot apply scopes, poppy:browser-sign-in means everything the account can do there; the Company must say so at approval and set web.unscoped', UNSCOPED, ''),
    ('rayner', 1, 'right', 'A join without a key leaves an earlier login alone; with a key it replaces it, and when the sign-in ends the browser is signed out and the earlier login does not come back', LOGINS, ''),
    ('rayner', 1, 'right', 'The attacker\'s authorized code posted from evil.example fails: no join cookie goes with a cross-site form, and no other host can plant one', FORGE, ''),
    ('rayner', 1, 'right', 'Had the forged post worked, the agent would shop inside the attacker\'s account', FORGE, ''),
    ('rayner', 1, 'right', 'A code sent to the agent in a message: no check at the Company would stop it; the agent declines because it authorizes only a code from its own browser\'s page, and the attacker\'s submission fails', PHISH + '; ' + STORY, ''),
    ('rayner', 1, 'right', 'Signed out, the agent authorizes the code with its seal alone; the browser joins the Session with no account', STEP2 + '; ' + STORY, ''),
    ('rayner', 1, 'right', 'Signed out, the joined browser is the same visitor as the agent\'s other requests, with no account; signing it in takes a key with poppy:browser-sign-in', STORY, ''),
    ('rayner', 1, 'right', 'Without the browser scope, step 2 answers 403 insufficient_scope; the agent sends the same code again without the key and the browser joins signed out', SCOPE + '; ' + STORY, ''),
    ('rayner', 5, 'right', 'The five check answers (forged form: no join cookie; code by message: declined, then no authorization; 403 then join signed out; logged in as B, joined for A: signed in to A, then signed out; help fetch carries the Session header alone)', D + 'answers.ts (computed from the model); ' + FORGE + '; ' + PHISH + '; ' + SCOPE + '; ' + LOGINS + '; ' + FETCH, ''),
]

for page, count, grade, claim, evidence, note in list(CLAIMS):
    if page == 'rayner' and not claim.startswith('A shop can ask agents not to browse'):
        CLAIMS.append(('method', count, grade, claim, evidence, note))
CLAIMS += [
    ('method', 1, 'right', 'The browser-session endpoint is https://example.com/poppy/browser-session and the agent authorizes at .../authorize', ENDPOINT, ''),
    ('method', 1, 'right', 'The join cookie is __Host-poppy_join, HttpOnly, SameSite=Strict, Max-Age 60', STEP1, ''),
    ('method', 1, 'right', 'The Session\'s cookie is __Host-sb_session', M + ':33-35 (the cookie names of the draft\'s example)', ''),
    ('method', 1, 'right', 'Loading the join page starts and changes no Session', STEP1, ''),
    ('method', 1, 'right', 'Intro: every step replays a model of the draft\'s section 6 tested against its rules and examples, with no reference implementation to run it against', T + ':13-15; bench/premise/poppy-browser/method/method.test.ts', ''),
]
