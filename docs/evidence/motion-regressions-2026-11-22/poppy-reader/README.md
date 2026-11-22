Poppy reader origin repair

Source starts from detached 5bff60e0aa5660c2b944fb59fbfe0b59e703db93. The script explicitly promises driving the whole protocol from poppy.json at the final step. The authored final state has already discovered the Company, started its Session and populated its cart, so the implicit resting-state reader policy refuses discovery and cart. A scene-local liveStart:'start' makes the first event of each reader history begin before discovery. Empty histories still display the authored signed-out Session, including Reset.

Former-policy controls: before-scene.log fails because logStart returned rest instead of start. before-browser.log is a successful Chromium execution of the negative test: it fails specifically because Read poppy.json has aria-disabled=true. (An earlier sandbox browser startup failure was corrected by running the authorized Chromium test outside the command sandbox; the final before-browser.log is the relevant negative receipt.)

After: after-scene.log passes both approval settings and checks literal start/rest states. after-browser.log passes both approval settings in actual Chromium at 390px. It drives all nine independent protocol history events, checks the first discovery is before any Company knowledge, checks the unauthenticated 401, checks the approval-specific 200 versus 403 insufficient_scope, reloads the exact URL and requires identical SVG, resets to the initial authored final SVG and words with no sent URL parameter, and begins another discovery history successfully.

Typecheck: npm run check passed, exit 0.
Poppy catalog: --check --only poppy passed for both scenarios, plus embed heights at 390/640/900 px (catalog.exit 0), using 768 MB JS heap bound. This is a complete Poppy check, not an all-catalog claim.
