# Premise test: do unchecked explainers get things wrong, and is the value in the method or the engine?

An outside review made two points. First, Rayner exists because unchecked explainers get things wrong, yet neither round in [`bench/explainers/README.md`](../explainers/README.md) recorded an error in a plain page, and the topic (statecharts) was one models already know. It proposed fact-checking pages on topics that have an oracle, and adding a third page built with Rayner's method (script, model, oracle) but without the engine. Second, it asked how many of Rayner's checks would still apply to a page drawn as pure state-to-SVG functions.

This directory answers both for two catalogued explainers whose models are tested against a real system:

- `trust-proxy`, "Which address should Express call the client?", checked against req.ip and req.ips recorded from real Express 5.3.0 (proxy-addr 2.0.8, forwarded 0.2.0) for eight trust settings on three requests.
- `pg-page`, "Why can int4 and int8 rows take the same space?", checked against pageinspect output, rows per page and table sizes measured on a real Postgres 18.6 server (64-bit, 8192-byte blocks, maximum alignment 8).

Short result: on these two topics the plain pages were mostly right. They made 3 errors between them, all minor, and none in a headline number. The method-only and Rayner pages made none. Between the method-only page and the Rayner page the fact-check found no difference in correctness. 21 of the 33 checks that `rayner check` and `rayner review` run would also apply to a state-to-SVG page, 9 exist because of the timeline engine and its fixed stage, and 3 are about Rayner's own build pipeline.

## Method

### The three pages per topic

| Page | Author | Given | Not given |
| --- | --- | --- | --- |
| `plain.html` | A fresh agent session started with no repository checkout (the session was created without a source repository). It used only a shell, plus reading its own screenshot; it made no web requests. | The script's `#` question, its Reader line, and the instruction quoted below. | The Answer line, the script's other lines, the model, the fixtures, any numbers, Rayner, this repository. |
| `method.html` | Built for this experiment, after reading the explainer's `script.md`, `model.ts`, `model.test.ts`, `answers.ts` and `fidelity.ts`. | The script's intent, the explainer's `model.ts` and `answers.ts` (imported, not copied) and the oracle values (copied into `method/oracle.ts` from `model.test.ts`). | The engine: nothing from `src/` or `explain/`. No Scene, timeline, animation, close-ups or player. |
| `rayner.html` | The existing catalogued explainer, unchanged. | Built with `npm run -s rayner -- build scenes/explainers/<id>/scene.ts --out bench/premise/<id>/rayner.html` at commit `07e82129`. | |

The plain authors' whole prompt, for trust-proxy (pg-page is the same with its own question and reader):

> Question: Which address should Express call the client?
>
> Reader: runs an Express app behind a CDN and a load balancer and has set, or is about to set, `trust proxy`; knows what an IP address and an HTTP header are, but not how Express reads X-Forwarded-For.
>
> Write a single self-contained HTML page that explains this to that reader, as well as you can, with diagrams (inline SVG) and any interactivity you think helps. Work from your own knowledge only: do not read files in /home/user, do not search the web. Save it to /tmp/premise/plain.html.
>
> When the file is saved, end your turn with one final message that contains the complete contents of /tmp/premise/plain.html verbatim inside a single ```html fenced block, and nothing else. Do not commit, push or publish anything.

The pg-page question ("Why can int4 and int8 rows take the same space?") tells the author that the rows can take the same space, so it gives away part of the answer. The trust-proxy question gives nothing away.

The plain pages were copied from each session's final message into this directory unchanged. For trust-proxy the final message equals the file the session wrote; for pg-page it equals the file after the session's one fix (it removed a duplicated `</tbody>`).

### The method-only page

`<topic>/method/page.ts` holds the whole explainer: each picture is a function from state to an SVG string, and `steps(...)` maps the chosen scenario to a list of `{ title, caption, svg }`. Captions are computed from the model, as Rayner's are. The closing table is drawn from the oracle values, not the model. `shell.ts` is the whole player: two `<select>`s (one for pg-page), Prev/Next, arrow keys, and the check questions under the last step. `node bench/premise/build.ts` bundles each page with esbuild into one HTML file with an inline script (35 KB and 25 KB).

Checks the method page has: the explainer's own `model.test.ts`, unchanged, and `method/method.test.ts`, which requires the model to give the oracle's values and every step of every scenario to render and to state the oracle's numbers (`node --test bench/premise/*/method/method.test.ts`, 6 tests, all pass). Nothing else was checked before the fact-check below; the measurements in "What the missing checks would have caught" were taken afterwards and the pages were left as first built.

Source size: method pages 529 lines for trust-proxy (`page.ts` 438) and 328 for pg-page (`page.ts` 239), plus 166 shared (`shell.ts`, `build.ts`). The Rayner scenes are 1022 lines (`scene.ts` 833 + `picture.ts` 189) and 606 lines (405 + 201), on top of the engine. Both sets share `model.ts` and `answers.ts`.

### Fact-check rules

Every checkable factual claim on each page was listed once, however many scenarios repeat it. An answer for one (setting, request) or one column counts as one claim. Each claim was marked:

- **Right**: agrees with a recorded oracle value; or with the repository's tested model on an input of the same shape as a recorded one (marked "model"); or with a source file or guide the repository pins (the Express guide at `expressjs.com@4ca3fa8`, Express `v5.3.0`, proxy-addr `v2.0.8` and Postgres `REL_18_6` lines that `model.ts` cites; the guide and the Express and proxy-addr lines were fetched again for this check).
- **Wrong**: contradicted by a recorded value or by the pinned source.
- **Unverifiable**: the oracle and the pinned sources do not cover it. These are not guessed, even where the claim is well known.

The plain trust-proxy page uses its own addresses (CDN 198.51.100.20, attacker 192.0.2.66). Its simulator's 18 answers were read from the rendered page and recomputed with the repository's model on the same headers; every one has the same shape as a recorded Express run. The plain pg-page table of eleven column layouts was read from the rendered page and recomputed with the model. The Rayner pages' text was read from `rayner describe` (every scenario, every step: titles, lines, captions, pictures in words and drawings as text).

## Fact-check: trust-proxy

| Page | Claims | Right | Wrong | Unverifiable |
| --- | --- | --- | --- | --- |
| Plain | 53 | 45 | 2 | 6 |
| Method-only | 40 | 39 | 0 | 1 |
| Rayner | 40 | 39 | 0 | 1 |

### Plain page

| Claim | Mark | Against |
| --- | --- | --- |
| Too little trust makes visitors share one address; too much lets them choose their own | Right | Recorded: 1 gives the CDN edge for the client; 3 and true give 1.2.3.4 for a forged header |
| req.ip should be the first machine you don't run, counting back from the app | Right | The rule the recorded runs follow |
| `trust proxy 2` trusts the load balancer and the CDN, and is right only if nothing reaches the load balancer except through the CDN | Right | Recorded 2: client and attacker via the CDN right, direct attacker wrong |
| An address list (array form, `'loopback', 'uniquelocal'` plus CDN ranges) checks who each hop is and is sturdier | Right | Recorded list run gets 3 of 3; array form in the pinned guide and `compileTrust` |
| `true` lets any visitor pick req.ip | Right | Recorded: true gives 1.2.3.4 for both forged requests |
| Each proxy appends to X-Forwarded-For and does not check or replace it | Unverifiable | Proxy behaviour is outside the oracle; the repository states it as an assumption |
| The header-growth diagram: CDN appends the client, load balancer appends the CDN, socket is the load balancer | Right | Same shape as the recorded client header |
| The left-most entry is the easiest to fake | Right | Recorded forged headers |
| Express hands req.ip to proxy-addr | Right | `request.js:340-343` |
| The list is the socket address (index 0), then X-Forwarded-For right to left | Right | forwarded 0.2.0; recorded req.ips |
| The trust function is passed the address and its index | Right | `compileTrust` |
| Stop at the first untrusted address; if all are trusted, take the last (left-most) | Right | proxy-addr `alladdrs`; recorded runs |
| req.ips lists the kept addresses client end first, without the socket, and is empty when trust is off | Right | Recorded req.ips for all eight settings (false and 0 give `[]`) |
| `false` is the default | Right | `application.js:99` |
| Simulator: req.ip for false, true, 1, 2, 3 and the address list, each on an ordinary visitor, a forged header and a direct attacker (18 claims; the table repeats six of them) | 18 Right | Each equals the model on the page's own headers and has the shape of a recorded run |
| 1 trusts index 0, 2 trusts indexes 0 and 1, 3 trusts one hop more than you have | Right | `i < n` |
| With true, Express always takes the left-most entry, which the visitor writes | Right | Guide; recorded |
| With 3, a fake entry wins | Right | Recorded 3, forged: 1.2.3.4 |
| The address list stops at a direct attacker | Right | Recorded list, direct: 198.51.100.9 |
| A hop count holds only if every request takes that path | Right | Recorded 2, direct |
| The list keeps working if the CDN adds an internal hop whose address is in the ranges | Right (model) | `answers.ts` question 2 |
| Some CDNs route through a second shield tier | Unverifiable | |
| `uniquelocal` is 10/8, 172.16/12, 192.168/16 (and fc00::/7); `loopback` is 127.0.0.0/8 | Right | Recorded uniquelocal preset; pinned guide |
| A function `(addr, i) => …` can be the setting | Right | `compileTrust`'s first line; guide |
| Express reads the setting on every request, so a later change takes effect | Right | `request.js:340-343` reads `trust proxy fn` per access |
| **If the origin can be reached directly, a count-based setting will believe whatever the attacker writes** | **Wrong** | Recorded: `trust proxy 1` on the direct route gives 198.51.100.9, the attacker's real address. True for 2 and 3. The page's own simulator shows 1 as correct here |
| `trust proxy` also governs X-Forwarded-Proto (req.protocol, req.secure) and X-Forwarded-Host (req.hostname) | Unverifiable | |
| For those headers Express asks only whether the socket peer is trusted | Unverifiable | |
| Express reads only X-Forwarded-For for req.ip, not CDN-specific headers | Right | forwarded 0.2.0 |
| Node joins repeated X-Forwarded-For headers into one list | Unverifiable | |
| proxy-addr matches IPv4-mapped addresses (`::ffff:10.0.0.5`) against IPv4 ranges | Unverifiable | The repository leaves IPv4-mapped addresses out |
| Express does not read the `Forwarded` header | Right | forwarded 0.2.0 reads X-Forwarded-For only |
| **Simulator verdict, `trust proxy 1`, attacker skipping the CDN: "The fake entry was ignored because 192.0.2.66 is not one of your proxies, so Express stopped there."** | **Wrong** | With a number, Express's trust function is `function(a, i){ return i < val }` (`utils.js`), which never looks at the address: it stops at index 1 by position. The same sentence is right for the address list |
| Same verdict for the address list | Right | Recorded list, direct |
| Verdict for true and 3 on an ordinary visitor: right only by luck, Express fell back to the left-most entry | Right | Recorded |
| Verdict for 2 and the list on an ordinary visitor: the walk stopped at the first machine you don't run | Right | Recorded |

### Method-only page

Every claim is computed from the model, or is the oracle table itself, so this is largely a check that the captions say what the model computes.

| Claims | Mark |
| --- | --- |
| Every connection comes from the load balancer, 10.0.0.5; what true, 1, 2 and the list tell Express (4) | Right |
| The header is a reported chain; the three headers Express receives; the read order and stopping rule; "the last address is never tested" (4) | Right |
| The 12 req.ip answers | Right (recorded) |
| Which addresses each setting trusts, which it never tests, and that with 2 Express trusts the attacker's real address as if it were a proxy (3) | Right |
| The routes step (count by position, list by address) and the code step (compileTrust branch, proxy-addr loop) (4) | Right (pinned source) |
| Right counts per setting; why-step reasons and the two guide warnings, the guide's list rule; the list is only as safe as its ranges (7) | Right (pinned guide) |
| The closing table and its counts; the intro's "tested against recorded values" (2) | Right |
| The three check answers (3) | Right (model; 3 on the direct route is recorded) |
| Proxies here append; real proxies may replace or strip the header | Unverifiable |

### Rayner page

| Claims | Mark |
| --- | --- |
| Socket address 10.0.0.5; what true, 1, 2 and the list tell Express (4) | Right |
| "Each proxy here appends the address its connection came from" | Unverifiable (stated as this scene's assumption) |
| The header is a reported chain; the three headers Express receives; the read rule (3) | Right (recorded headers) |
| The 12 req.ip answers, in captions, cards and the closing table | Right (recorded) |
| Trusted counts per scenario; "Express never reads 1.2.3.4"; trusted "for its position alone"; the attacker's address trusted as if it were a proxy (4) | Right |
| Routes step for counts and for the list (2) | Right |
| Code step: compileTrust's three branches and proxy-addr's loop, quoted (2) | Right (fetched `v5.3.0` and `v2.0.8` and compared) |
| Right counts per setting; with 1 every request through the CDN reports the CDN edge (2) | Right (recorded) |
| Why steps: the left-most entry is whatever the first sender wrote; the three guide quotes; the path-length explanation (5) | Right (quotes compared with the pinned guide) |
| The list is safe while each range holds only your proxies | Right |
| Three check answers (3) | Right (model; "3 on the short route gives the made-up entry" is recorded) |
| "Twelve answers from real Express 5.3.0" | Right |

## Fact-check: pg-page

| Page | Claims | Right | Wrong | Unverifiable |
| --- | --- | --- | --- | --- |
| Plain | 43 | 33 | 1 | 9 |
| Method-only | 42 | 42 | 0 | 0 |
| Rayner | 42 | 42 | 0 | 0 |

### Plain page

| Claim | Mark | Against |
| --- | --- | --- |
| Switching a single column from bigint to integer leaves the table the same size | Right | Measured: 45 and 45 pages for 10,000 rows |
| On 64-bit builds every tuple starts on an 8-byte boundary and its space is rounded up to a multiple of 8 | Right | Measured lp_off steps of 32; MAXALIGN 8 |
| Tuple header 23 bytes, rounded to 24 | Right | Measured t_hoff 24 |
| header + int4 is 28 bytes, rounded to 32 | Right | Measured lp_len 28 |
| header + int8 is exactly 32 | Right | Measured lp_len 32 |
| Plus a 4-byte pointer, both fit 226 rows per page | Right | Measured 226 and 226 |
| Pages are 8,192 bytes | Right | Measured block_size |
| Page header, line pointers growing forward, tuples packed back from the end | Right | Measured pd_lower, pd_upper, lp_off |
| A line pointer stores the tuple's offset and length | Right | `itemid.h` |
| Rows per page = (8192 − 24) ÷ (rounded tuple + 4), rounded down | Right | Matches all four measured row counts; follows from the cited `bufpage.c`/`hio.c` rules |
| int2, int4 and int8 align to 2, 4 and 8 | Right | Model, `answers.ts` |
| float8 and timestamptz align to 8 | Unverifiable | |
| The header holds xmin, xmax, command id, ctid, flag bits, header length | Right | Field sums in `model.test.ts` |
| **"so user data always begins at byte 24"** | **Wrong** | The cited rule (`heaptuple.c:1151-1160`) is t_hoff = MAXALIGN(23 + null bitmap), so a bitmap longer than one byte moves the data to 32. The page's own section 4 says so ("With 9 or more columns it pushes the data start from 24 to 32") |
| int4 and int8 grids: 28 → 32 and 32 → 32; the next tuple starts 32 bytes on either way | Right | Measured |
| 8168 usable, 36 bytes a row, floor(8168 / 36) = 226 | Right | Measured |
| Cases table, nine integer-only layouts (data end, slot, rows a page) | 9 Right (model; int4 and int8 alone measured) | Recomputed with the model: all equal |
| Cases table, two layouts with timestamptz | 2 Unverifiable | Arithmetic agrees with the model if timestamptz is 8 bytes aligned to 8, which the oracle does not cover |
| Two int4 columns fill one 8-byte word | Right (model) | `answers.ts` question 1 |
| An int4 before an int8 forces 4 bytes of padding | Right (model) | |
| Widest-aligned columns first removes internal padding; the tail rounding stays | Right (model) | |
| A null bitmap is present only when a value is null | Right | `heaptuple.c` as cited |
| A NULL takes no data bytes; the bitmap has one bit per column | Unverifiable | The model leaves nulls out |
| Up to 8 columns the bitmap fits in byte 23; 9 or more push the data to 32 | Unverifiable | (By the same rule more than 72 columns push it to 40; the page does not say so) |
| A B-tree entry is an 8-byte header plus the key padded to 8, so int4 and int8 entries are both 16 | Unverifiable | The repository leaves indexes out |
| B-tree deduplication since PostgreSQL 13 can change this | Unverifiable | |
| 100,000 rows take 443 pages, 3,629,056 bytes | Right (model) | ceil(100000 / 226); consistent with the measured 45 pages for 10,000 |
| pageinspect: lp 1, 2, 3 at 8160, 8128, 8096 with lp_len 28 | Right | lp 1 and 2 measured; lp 3 by the model |
| For the int8 table lp_len is 32 and the offsets are the same | Right | Measured |
| int4's largest value is 2,147,483,647 | Unverifiable | |
| Per-row overhead (header, pointer, tail padding) is often larger than the data | Right | Measured: headers alone are 63.5% of an int4 page |
| An empty row still costs a 24-byte header and a 4-byte pointer | Right (model) | |
| The builder's default page: pointers 904 B, tuples 7,232 B, 32 B left over, 904 B of data (11%) | Right | Measured pd_lower 928, pd_upper 960 |
| The builder's other types: date and float4 4/4, bool 1/1, uuid 16 bytes aligned to 1 | Unverifiable | |

The builder accepts any list of columns; only its default and the cases table were checked.

### Method-only page

| Claims | Mark |
| --- | --- |
| 8192-byte pages, a 24-byte page header, 8168 bytes free; int4 is 4 bytes and int8 8 (4) | Right |
| A row is a line pointer plus a tuple; the tuple header is 23 bytes padded to 24 (2) | Right (measured t_hoff) |
| lp_len 28, 32, 40 and 44 → 48; byte layouts of the four tuples (8) | Right (measured lp_len and data lengths) |
| Rows a page 226, 226, 185, 157; bytes a row 36, 36, 44, 52 (8) | Right (measured rows) |
| Every tuple gets a multiple of 8 on a 64-bit build; text starts at 28 after int4 and 32 after int8 (2) | Right |
| Shares of a full page (headers %, data %) and the bar's byte counts (3) | Right (model, from measured rows) |
| Why-step arithmetic for each column: rows × bytes, pd_upper − pd_lower, free less a pointer, rounding keeps the next row out (4) | Right (measured bounds) |
| Pages for 10,000 rows: 45, 45, 55, 64 (4) | Right (measured) |
| Page drawings: pd_lower 24 / pd_upper 8192 empty; pd_lower 28, pd_upper 8160, lp_off 8160 with one row (2) | Right (measured) |
| "Depends on where the row's bytes end relative to an 8-byte boundary"; the intro's provenance line (2) | Right |
| Three check answers (3) | Right (model, as `answers.ts` says: not measured) |

### Rayner page

| Claims | Mark |
| --- | --- |
| 8192-byte pages, 24-byte header, 8168 free; int4 4 and int8 8 bytes (4) | Right |
| Line pointer plus tuple; 23-byte header padded to 24 (2) | Right (measured) |
| Tuples 28, 32, 40, 44 → 48; layouts (23 header, 1 padding, data, tail padding) of all four (8) | Right (measured) |
| Every tuple a multiple of 8 on a 64-bit build; text needs no alignment and starts at 28 or 32 (2) | Right |
| Bytes a row 36, 36, 44, 52; rows a page 226, 226, 185, 157 (8) | Right (measured) |
| Pie: headers 63.5% (int4, int8) and 51.9% (text), data 11.0%, 22.1%, 36.1%; slice bytes 904, 5198, 1130, 904, 24, 32 (3) | Right (model, from measured rows; pinned by `model.test.ts`) |
| Why step: 8136 of 8168, 32 left; 8140, 28 left; 28 and 24 after a pointer; "the tuple's own 28 bytes would fit" (4) | Right (measured bounds) |
| 45, 45, 55, 64 pages for 10,000 rows, "as measured on Postgres 18.6" (4) | Right (measured) |
| Drawings: lp_off 8160, pd_lower 28, pd_upper 8160; pd_lower/pd_upper 928, 960 (2) | Right (measured) |
| "Where the 8-byte boundaries fall"; "the 4 bytes pushed the int8 + text tuple past a multiple of 8" (2) | Right |
| Three check answers (3) | Right (model, not measured, as the script says) |

## Errors found

None in the Rayner explainers. None in the method-only pages.

In the plain pages:

1. trust-proxy, section 5: "If the origin can be reached directly, a count-based setting will believe whatever the attacker writes." Real Express 5.3.0 with `trust proxy 1` on that route returned 198.51.100.9, the attacker's real address (`model.test.ts`, setting 1, request `direct`). The claim holds for 2 and 3.
2. trust-proxy, simulator verdict for `trust proxy 1` with the attacker skipping the CDN: "The fake entry was ignored because 192.0.2.66 is not one of your proxies, so Express stopped there." Express 5.3.0 compiles a number to `function(a, i){ return i < val }` (`lib/utils.js`), which ignores the address; the walk stops at index 1 by position. This is the distinction (position, not machine) that the Rayner explainer is built around.
3. pg-page, section 2: "so user data always begins at byte 24." By the rule `model.ts` cites (`heaptuple.c:1151-1160`), t_hoff is MAXALIGN(23 + null bitmap), so rows with a bitmap longer than one byte start their data at 32; the page says this itself in section 4.

The plain pages' central answers were right: all 18 simulator answers and the 6-row table on trust-proxy, and all 11 layouts in the pg-page table, match the oracle or the tested model.

## Checks: which would apply to a state-to-SVG page

Sources: the Checks table and Reader review section of [`docs/REFERENCE.md`](../../docs/REFERENCE.md), [`docs/TESTING.md`](../../docs/TESTING.md), `tools/lib/explain-check.ts` (`checkProject`, `declaredClaimProblems`) and `tools/lib/explain-review-scene.ts`. The REFERENCE table has 23 rows; the Views row is split here into its two rules, and the declared-claims gate in `checkProject` is added, giving 25 `check` gates and 8 `review` checks.

(a) applies to the method-only page too, (b) exists only because of the timeline engine and its fixed-size stage, (c) other.

| Check | Command | Class | Why |
| --- | --- | --- | --- |
| Model test (`model.test.ts` passes) | check | a | The method itself |
| Catch lint (no try/catch around awaited code in `construct()`) | check | b | `construct()` is the timeline script |
| Motion (pops, cut-ins, teleports, flicker, misplaced handoff) | check | b | No motion |
| Hold (picture changes after the caption hold) | check | b | No hold |
| Views: the stage's view equals a fresh draw of the step's state | check | b | A state-to-SVG page redraws from state every time, so it cannot drift |
| Views: a draw reads its state (perturbed and other steps' states draw differently) | check | a | A pure function can still ignore its input |
| Keys (two stage parts share a `key`) | check | b | Stage object lookup |
| Machines (every reachable state drawn, legible, distinct, described; transitions end on the state's picture) | check | a | Applies to any page with a live machine; neither topic has one |
| Invariants (author's picture invariants on every frame) | check | a | Would run on each rendered state instead of each frame |
| Seek (seeked frame equals played frame) | check | b | |
| Last frame (finished animation ends on the resting frame) | check | b | |
| Trace (skipping frames gives the same trace) | check | b | |
| Step change (a step's picture differs from the previous one) | check | a | |
| Text (overlap, cut by the edge) | check | a | |
| Routes over labels (connectors crossing label ink) | check | a | |
| Legibility (labels reach 14 px at a 1280 px stage) | check | a | |
| Words (every drawing has text or a description) | check | a | |
| Looks (a colour or pattern the caption names is keyed on the stage) | check | a | |
| Bare runtime (the shipped bundle reproduces the Node trace without DOM or timers) | check | c | Rayner's build pipeline; a reduced form (the bundle renders what the test rendered) would still be useful |
| Glyphs (text the embedded fonts cannot draw) | check | c | Rayner embeds its own fonts |
| Answer (`meta.answer` stated by a step) | check | a | |
| Checked against (the paths the script names exist) | check | a | |
| Script answers (script.md's answers equal `answers.ts`) | check | a | |
| Declared claims (`meta.claims` phrase present and its test exists) | check | a | |
| Painted subjects (what a caption points at is painted) | review | a | |
| Caption text present on the served page | review | a | |
| Close-up tours cover the subjects on a phone | review | b | Close-ups exist because the 16:9 stage is too small on a phone; a responsive page needs none |
| No page overflow | review | a | |
| No console errors | review | a | |
| No outside connections | review | a | |
| Live states reached by pressing events (caption, URL, buttons, labels, Node and browser paint the same) | review | a | Applies to any interactive machine; neither topic has one |
| Narrow openings at 320 × 568 (subjects complete, labels at least 12 px) | review | a | |
| Success receipt and rendering fingerprints | review | c | Build provenance |

Counts: **(a) 21, (b) 9, (c) 3**, of 33.

### What the missing checks would have caught

The method-only pages were built with only the model test and their own `method.test.ts`. Measured afterwards in Chromium over every step of every scenario (108 views for trust-proxy, 18 for pg-page), with the same measurement on the plain pages' default state:

| Page | Smallest SVG text at 390 px | SVG text under 12 px at 390 px | Smallest at 1280 px | Text cut by its SVG's edge | Overlapping text |
| --- | --- | --- | --- | --- | --- |
| trust-proxy method | 8.5 px | all | 16.7 px | 3 labels | 0 |
| trust-proxy plain | 5.2 px | all 31 | 12.1 px | 0 | 0 |
| pg-page method | 9.3 px | all | 18.4 px | 0 | 1 pair |
| pg-page plain | 4.5 px | all 41 | 9.3 px | 0 | 0 |

`rayner check` on the two Rayner pages passes (13 and 7 model tests pass; 3 check answers compared each). Its phone estimate gives 4.2 px (trust-proxy) and 6 to 6.3 px (pg-page) for the whole stage at 390 px, and 12 px with no label under 12 px inside the close-ups. So none of the three kinds of page is legible on a phone as a whole picture; Rayner reaches 12 px through close-ups, which are class (b). A state-to-SVG page would have to meet the same (a) legibility check by drawing narrower pictures. The (a) Text check would have caught the method page's three cut labels and one overlap; other clipped labels on two steps had already been seen in screenshots and fixed by hand before this measurement, which is the manual version of the same check.

## Conclusion

What the evidence shows:

- On these two topics a fresh author working from memory produced pages whose main answers were right. Across 96 claims the plain pages made 3 errors, all secondary: an overgeneralisation, a wrong reason in one simulator message, and an "always" that the page itself contradicts. 15 further claims could not be checked against the oracle. So these topics, like statecharts, are ones an unaided model largely knows; they do not test the premise as the review asked.
- The method-only pages and the Rayner pages made no errors in 82 claims each. Their correctness comes from the same model, oracle and computed answers. On correctness, the engine added nothing measurable here: the method accounts for it.
- Of the checks Rayner runs, 21 of 33 still apply to a state-to-SVG page, and building one without them produced the defects those checks look for (illegible phone text, text cut at the edge). 9 checks exist because of the timeline and the fixed stage; 3 concern Rayner's build.

What it does not show:

- Two topics is a small sample, and both were chosen because they already had oracles, which favours topics that are well documented. A topic where an unaided model is likely to be wrong has still not been tried.
- The method-only pages were written by someone who had read the Rayner explainers, their captions and their oracles. They are not an independent replication of the method.
- Claim counts depend on how claims are split; the tables list every claim so the split can be checked. One person did the fact-check.
- Nothing here measures how well any page teaches.
