# Why couldn’t these users find the command?

- **Reader:** designs or builds desktop software, or cares about usability, and has never read a usability-test report; knows what a menu and a keyboard shortcut are.
- **Answer:** All six gave up at least once, each time on a menu command
- **Changed condition:** none changes the conclusion. The participant setting chooses whose first give-up opens the story (P1's Undo, P2's icon size, P5's Select All, and so on), while the give-up table and the heat map keep all six visible; the comparison the explainer makes is across people, to test whether a few weaker users account for the give-ups.
- **Reader's own work:** decide whether one give-up was bad luck or a pattern before seeing the same task across all six; follow another participant's first give-up; answer the check questions on a later build, on skill, and on the gray cell.
- **Checked against:** the report's own sentences. The heat map is transcribed by hand from page 7 of GNOME's 2024 report and cross-checked by sampling every cell of the PDF page and the article's image (all 66 agree); `model.test.ts` holds it to what the report says about each task, and holds the title's claim and the moderate-or-worse ranking. There is no other measurement to check it against.
- **Grounding:** read: GNOME’s 2024 usability report, transcribed by hand
- **Leaves out:** any rate for users in general, task times, later versions of Files, and a causal test of menus against other design factors: six first-time GNOME users on two Files 47 test builds support an account of those sessions only.

## Check yourself

1. A later build adds a visible Undo button beside the folder path, outside the Main Menu. Which observation in this study suggests that would help, and what could a six-person study of the old build not tell you?
   The people who gave up on Undo did not open the Main Menu, so a button they can see removes the step they skipped. The study cannot say how many users would still miss it: six first-time users of one test build give no rate, and the new design needs its own test.
2. P5 gave up on Select All but had no difficulty with Undo; P1 had no difficulty with Select All but gave up on Undo. What does that suggest about explaining the give-ups by who was skilled?
   Skill alone would make the same people fail on both. Instead each person stalled on a different command, and all six stalled at least once, which points at where particular commands sat and at habits such as Ctrl+A, not at a few weak users.
3. P6’s attempt at Select All is gray, outside the study’s scope. If it were counted as a give-up instead, how would the ranking of tasks by give-ups change, and why does the report keep gray separate?
   Select All would have four give-ups and be worst on its own, ahead of Undo’s three. The report keeps gray separate because the study excluded that approach, so scoring it either way would rank tasks on something the study did not test.

## Why this explainer

The heat map in GNOME's 2024 Files usability report is easy to glance at and hard to read. The explainer reads it as evidence for one claim: putting a command in a menu made it available, but these users still had to think of opening that menu and then notice the command inside it. It starts from one person's give-up, where the command existed and was not found, and asks the obvious objection (was that person unlucky?) before widening to all six and then to every task. The key comes first so that every later picture's colours are already known.

The comparison that carries the argument is across people: if a few weak users caused the trouble the same names would keep failing, and instead every participant gave up at least once, each on a different command. Menu tasks alone prove little, since nine of the eleven tasks used menus; the stronger evidence is the report's account of why people quit, which the captions quote.

Construction decisions a future author needs: the give-up table shows only the five tasks with a give-up so it reads whole on a 320 px phone, and the full heat map carries the rest as a detail step. Ranking by give-ups counts black cells; the article's own ranking (icon size and Bookmarks hardest) states no method, so the heat-map step sets it beside a count of moderate-or-worse cells, which agrees with it. The journey shows only the participant's first four tasks, which hold every participant's first give-up; an earlier version ran over all eleven in three steps and repeated the heat map. The flat-curve description that P3's middle tasks used to exercise is pinned by `test/fixtures/journey-flat`. The 5-to-1 scores are this page's plotting choice, and gray is left out of the journey rather than averaged in.
