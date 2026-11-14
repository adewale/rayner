# Premise test: do unchecked explainers get things wrong, and is the value in the method or the engine?

An outside review made two points. First, Rayner exists because unchecked explainers get things wrong, yet neither round in [`bench/explainers/README.md`](../explainers/README.md) recorded an error in a plain page, and the topic (statecharts) was one models already know. It proposed fact-checking pages on topics that have an oracle, and adding a third page built with Rayner's method (script, model, oracle) but without the engine. Second, it asked how many of Rayner's checks would still apply to a page drawn as pure state-to-SVG functions.

This directory answers both for two catalogued explainers whose models are tested against a real system:

- `trust-proxy`, "Which address should Express call the client?", checked against req.ip and req.ips recorded from real Express 5.3.0 (proxy-addr 2.0.8, forwarded 0.2.0) for eight trust settings on three requests.
- `pg-page`, "Why can int4 and int8 rows take the same space?", checked against pageinspect output, rows per page and table sizes measured on a real Postgres 18.6 server (64-bit, 8192-byte blocks, maximum alignment 8).

Short result: on these two topics the plain pages were mostly right. They made 3 errors between them, all minor, and none in a headline number. The method-only and Rayner pages made none. Between the method-only page and the Rayner page the fact-check found no difference in correctness. 21 of the 33 checks that `rayner check` and `rayner review` run would also apply to a state-to-SVG page, 9 exist because of the timeline engine and its fixed stage, and 3 are about Rayner's own build pipeline.

[Round 2](#round-2-topics-models-get-wrong) repeats the plain-page test on three topics chosen because a pilot found an unaided model making errors on them: `ext4-space`, `isdigit` and `cert-renewal`.

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

## Round 2: topics models get wrong

Round 1 left the core question open: on a topic an unaided model gets wrong, does the method catch errors the plain page makes? Round 2 repeats the plain-page test on three topics picked by a pilot. It was run on 2026-11-14 against commit `5e9d07d4`.

Short result: the pilot found few errors anywhere. On the three topics where it found the most, the plain pages made 5 errors in 109 claims and the Rayner pages none in 147. All three plain pages gave the right headline answer, and every error was in a secondary detail. Three of the five contradict values the Rayner page states, and those values come from its oracle. The other two (both about `mkfs.ext4 -T`) are outside what the Rayner page covers; only the source file its model pins exposed them.

### Pilot

Two fresh cloud sessions, created like the plain authors below (no repository, model `claude-opus-5-5`), answered short questions from memory with no tools. Each answer was graded against the explainer's oracle.

| Topic | Questions | Wrong | What it got wrong |
| --- | --- | --- | --- |
| `quotient-familial` (revenus 2024) | barème thresholds and rates, plafond per demi-part, décote for a couple, parts and tax for a couple with one and with three children at 65 673,88 € | 0 of 7 | none: 11 497 / 29 315 / 83 823 / 180 294, 1 791 €, 1 470 € − 45,25 % (nil from 3 248 €), 4 242 € and 1 675 € all match `model.test.ts` |
| `ext4-space` (mkfs.ext4 1.47.3) | journal at 1 GiB, 2 GiB, 16 GiB, 64 GiB, 1 TiB, 20 TiB; size-type switches and inode ratios; inodes at 1 TiB and 20 TiB; reserved blocks at 1 TiB; the kernel's extra reserve; inode-table and total metadata at 1 TiB; resize inode and inodes per group at 20 TiB; reserve against metadata at 1 GiB | 2 of 16 | journal at 1 GiB "64 MiB" (recorded 8,192 blocks, 32 MiB); total metadata at 1 TiB "about 4,502,035 blocks", counting 512 descriptor blocks per copy (dumpe2fs: 4,494,739 overhead blocks, 128 descriptor blocks per copy). The second was flagged low confidence |
| `isdigit` (CPython 3.15.1, Unicode 17.0.0) | counts for isdecimal, isdigit, isnumeric; the isdigit-but-not-isdecimal count; int() of ², ٣, 三; U+3000 then 7 | 1 of 8 | isnumeric count "about 1,950" (recorded 2,023), flagged low confidence. 770, 898 and 128 were right |
| `token-bucket` (x/time/rate v0.15.0) | which of ten calls on `NewLimiter(1, 5)` succeed, and the tokens left | 0 of 1 | none |
| `cert-renewal` | Certbot 4.1's default for 90-day, 45-day and 160-hour certificates; Let's Encrypt's exact-set limit and its exemption; a 30-day margin on 160-hour certificates | 0 of 3, 1 imprecise | "renewals made through ARI, within the suggested window, are exempt": Boulder also requires the order to name the certificate it replaces |
| `ical-recurrence` (Baïkal 0.10.1) | what Bob's copy holds after a cancellation; COUNT with EXDATE | 0 of 2 | none |
| `gtfs` (Google's sample feed) | the FULLW and WE services; what runs on 4 June 2007 | 0 of 1 | none |

Topics chosen: `ext4-space` (two errors, both exact counts), `isdigit` (one error, on a version-specific count) and `cert-renewal` (one imprecise answer, and Let's Encrypt and Certbot dates late enough to test what the model knows). `quotient-familial`, the brief's first suggestion, was dropped because the pilot got every number right. The pilot is weak evidence: a few questions per topic, one sample each.

### Method

The plain pages were made exactly as in round 1: each by a fresh cloud session with no source repository (`create_session` with no `source_url`, model `claude-opus-5-5`). The prompt was the script's `#` question, its Reader line and round 1's instruction, word for word:

> Write a single self-contained HTML page that explains this to that reader, as well as you can, with diagrams (inline SVG) and any interactivity you think helps. Work from your own knowledge only: do not read files in /home/user, do not search the web. Save it to /tmp/premise/plain.html.
>
> When the file is saved, end your turn with one final message that contains the complete contents of /tmp/premise/plain.html verbatim inside a single ```html fenced block, and nothing else. Do not commit, push or publish anything.

The isdigit question ("Does isdigit guarantee int can parse it?") asks yes or no, and an author who knows Python can guess no. The other two give nothing away.

Each page was copied from the session's final message into `<topic>/plain.html`. Afterwards each session was asked for the `sha256sum` of its file: the ext4-space and isdigit copies match byte for byte; the cert-renewal session declined to reply, so that copy was compared by eye only. All three sessions, and both pilot sessions, are archived. All three pages render in Chromium with no console errors. Interactive parts were read in their default state and from their preset buttons; free-form inputs were not explored, as with round 1's pg-page builder.

The Rayner pages' text was read from `rayner describe` at `5e9d07d4` (every scenario, every step, and the check questions). The Rayner pages were not copied here; `rayner build` at that commit reproduces them. No method-only pages were made this round.

The fact-check rules are round 1's: right, wrong or unverifiable against recorded values, the tested model or the sources `model.ts` pins, with each claim counted once however often it repeats. Three additions:

- Claims that are pure arithmetic (1,000 GB is 931 GiB) are marked "Right (arithmetic)".
- Both ext4 pages describe `df`'s Size, Used and Avail. These are taken to be statfs's f_blocks, f_blocks − f_bfree and f_bavail, as both pages use them. That mapping is coreutils behaviour, not part of the recording, so it is counted once on each page as unverifiable.
- The plain ext4 page's example is a "1 TB" drive of 1,000,204,886,016 bytes with a GPT partition. That is not a whole number of 128 MiB block groups, and the model refuses such sizes, so its figures were compared with the model at the two nearest whole-group sizes, 7,452 and 7,453 groups. A figure is marked "Right (model, bracketed)" when the page's rounded value agrees with both.

Two plain-page claims were checked against a pinned source the Rayner page does not quote: `misc/mke2fs.conf.in` at e2fsprogs `v1.47.3`, which `model.ts` cites for its inode ratios, fetched again for this check.

### Totals

| Topic | Page | Claims | Right | Wrong | Unverifiable |
| --- | --- | --- | --- | --- | --- |
| ext4-space | Plain | 46 | 27 | 4 | 15 |
| ext4-space | Rayner | 58 | 55 | 0 | 3 |
| isdigit | Plain | 32 | 23 | 0 | 9 |
| isdigit | Rayner | 45 | 43 | 0 | 2 |
| cert-renewal | Plain | 31 | 23 | 1 | 7 |
| cert-renewal | Rayner | 44 | 44 | 0 | 0 |
| All three | Plain | 109 | 73 | 5 | 31 |
| All three | Rayner | 147 | 142 | 0 | 5 |

### Fact-check: ext4-space

Oracle: the 22 recorded mkfs.ext4 1.47.3 runs in `model.test.ts` (dumpe2fs counts, debugfs block counts of inodes 2, 7, 8, 11 and 12, statfs under Linux 6.8.0), the model, and the e2fsprogs and Linux lines `model.ts` cites.

#### Plain page

| Claim | Mark | Against |
| --- | --- | --- |
| A "1 TB" disk shows 916G Size and 870G Avail in `df -h` (lede and simulator) | Right (model, bracketed) | 915.8–915.9 GiB and 869.2–869.3 GiB; `df -h` rounds up |
| On a typical disk the structures are the smallest of three parts: units about 7%, reserve 5%, structures about 1.7% | Right (model, bracketed) | 1.68% structures, 5.00% reserve |
| 1,000 GB is 931 GiB; the unit change is about 7% (6.9%) | Right (arithmetic) | |
| `df -h` counts in GiB but labels them G; `df -H` uses powers of 1000 | Unverifiable | coreutils |
| The default reserve is 5% of the blocks, for root | Right | Recorded reserved block counts, e.g. 13,421,772 of 268,435,456 |
| ...or for a chosen user or group | Unverifiable | |
| `df` shows statfs's numbers | Unverifiable | See the method |
| The reserve is inside Size but in neither Used nor Avail, so Size − Used ≠ Avail | Right | Recorded statfs: reserved blocks are in f_bfree, not in f_bavail |
| On 1 TB the reserve is about 47 GiB (46.6 GiB in the simulator) | Right (model, bracketed) | 46.59–46.60 GiB with the kernel's 16 MiB |
| `tune2fs -m` and `-r` change the reserve, while mounted | Unverifiable | Only mkfs runs were recorded |
| About 1.7% is the filesystem's own structures (1.68% of the label) | Right (model, bracketed) | |
| Nearly all of it is inode tables, 1.56% | Right | Recorded 1 TiB: 4,194,304 of 268,435,456 blocks |
| A 1 GiB journal | Right | Recorded 1 TiB journal |
| Superblocks, descriptors and bitmaps are under 0.02% | Right (model, bracketed) | 143 MiB, 0.015% |
| Simulator: 61 M inodes, 14.6 GiB of inode tables (also in the table) | Right (model, bracketed) | 61,046,784 inodes, 14.55 GiB |
| Superblocks, descriptors and bitmaps 143 MiB; table ≈ 85 MiB and ≈ 58 MiB | Right (model, bracketed) | 84.8 and 58.2 MiB |
| Reserved for root plus 16 MiB: 46.6 GiB | Right (model, bracketed) | |
| Partition table and alignment, 1 MiB | Unverifiable | Outside the filesystem |
| **`df` Used is 20K (21K with `-H`): "≈ 0 (root dir + lost+found)"** | **Wrong** | Recorded: f_blocks − f_bfree is 519 blocks (2,076 KiB) on 1 TiB and 70 on 1 GiB. debugfs gives root directory 1, lost+found 4, orphan file 512 (64 at 1 GiB), resize inode 1, journal index 1. The page's code hard-codes 5 blocks and leaves out the orphan file |
| 5.00% reserve, 6.7% in total | Right (model, bracketed) | |
| Metadata is subtracted before Size is reported (bsddf) | Right | Recorded: f_blocks = blocks − dumpe2fs overhead |
| `minixdf` reports the raw block count | Unverifiable | |
| Metadata never appears in Used; partition bytes minus Size gives the metadata | Right | Recorded statfs |
| Size − Used − Avail is the root reserve plus at most 16 MiB kept by ext4 | Right | Recorded: f_bfree − f_bavail = reserve + min(2%, 4,096 blocks) |
| ...kept for delayed allocation | Unverifiable | |
| Use% can pass 100% for root; a full disk still lets root write | Unverifiable | |
| `df` computes Use% as Used ÷ (Used + Avail) | Unverifiable | |
| Block groups of 32,768 blocks, 128 MiB | Right | `mke2fs.conf.in`; model |
| A 1 TB disk has about 7,450 groups | Right (model, bracketed) | 7,452 |
| A group's inode table is 8,192 × 256 B = 2 MiB, 1/64 of the group | Right | Recorded inodes per group at 1 TiB |
| Bitmaps are 8 KiB per group | Right | Model: two blocks per group, matching recorded overhead |
| Superblock and descriptor copies only in groups 0, 1 and powers of 3, 5 and 7 | Right | `closefs.c` as cited; recorded resize-inode counts |
| 19 copies on 1 TB, about 4.5 MiB each, with spare descriptor blocks | Right (model, bracketed) | 19 copies of 1 + 117 + 1,024 blocks |
| `flex_bg` packs 16 groups' bitmaps and tables together | Unverifiable | |
| Inode records are 256 bytes, all set aside at format time | Right | `inode_size = 256`; recorded inode counts |
| **"By default that's one inode for every 16 KiB of capacity", and the calculator's "16 KiB (default)" for every size** | **Wrong** | True only below 4 TiB. Recorded 4 TiB: 134,217,728 inodes, one per 32 KiB. Recorded 20 TiB: 335,544,320, one per 64 KiB (`big` and `huge` in `mke2fs.conf.in`) |
| The journal grows in steps and stops at 1 GiB from 128 GiB; the calculator's step table | Right | `mkjournal.c` table as cited; recorded 128 GiB, 1 TiB, 20 TiB |
| The journal is a write-ahead log for crash consistency | Unverifiable | |
| Inodes cannot be added later; running out gives ENOSPC; `df -i` | Unverifiable | |
| `ext4lazyinit` zeroes the inode tables after the first mount | Unverifiable | |
| The reserve's purposes (logs when full, fragmentation) | Unverifiable | |
| **`-T largefile` is 64 KiB per inode** | **Wrong** | `mke2fs.conf.in` v1.47.3: `largefile` has `inode_ratio = 1048576`, 1 MiB |
| **`-T largefile4` is 1 MiB per inode (option label and the "one inode per 1 MiB" comment)** | **Wrong** | `largefile4` has `inode_ratio = 4194304`, 4 MiB |
| 4 KiB per inode for many tiny files | Right | `small` and `news` have `inode_ratio = 4096` |
| Defaults: 4 KiB blocks, 256-byte inodes, `64bit`, `flex_bg`, `sparse_super`, `resize_inode` | Right | `mke2fs.conf.in` |
| "1 TB" drives commonly hold 1,000,204,886,016 bytes | Unverifiable | |

#### Rayner page

| Claims | Mark |
| --- | --- |
| The answer: the 5% reserve is 1.0, 3.0 and 12.4 times the metadata on 1 GiB, 1 TiB and 20 TiB (3) | Right (recorded) |
| Block counts of the three disks (3) | Right (recorded) |
| Blocks users can write, with shares, and blocks unavailable to them, with sizes (118.1 MiB, 68.4 GiB, 1106.5 GiB) (6) | Right (recorded statfs) |
| `df` reads statfs and shows f_bavail as Avail | Unverifiable (see the method) |
| Root reserves 13,107, 13,421,772 and 268,435,456 (3) | Right (recorded) |
| Metadata 13,019, 4,495,258 and 21,625,887 blocks: 5.0%, 1.7%, 0.40% (3) | Right (recorded: blocks − f_bfree) |
| The kernel holds back 4,096 more; users can write the free blocks less both reserves (2) | Right (recorded) |
| Size types: one inode per 16 KiB from 512 MiB to under 4 TiB, 32 KiB under 16 TiB, 64 KiB above | Right (`mke2fs.c` and `mke2fs.conf.in` as cited; recorded 4 TiB and 16 TiB) |
| Inode counts, table blocks, shares of disk and of metadata for each disk (3) | Right (recorded) |
| Journal steps: 16 MiB at 128 MiB, doubling to 1 GiB at 128 GiB | Right (cited table; recorded 512 MiB to 128 GiB) |
| Journal 32 MiB, 1 GiB, 1 GiB, with shares (3) | Right (recorded) |
| Superblock copies in 5 of 8, 19 of 8,192 and 25 of 163,840 groups (3) | Right (cited rule; recorded resize-inode counts) |
| 127 and 1,024 spare descriptor blocks per copy (2) | Right (recorded) |
| Two bitmaps in every group | Right (model; matches recorded overhead) |
| Other metadata 731, 38,810 and 392,223 blocks; the first files 70, 519 and 518 blocks (3) | Right (recorded debugfs counts) |
| Shares users can write at -m 5, 1 and 0 on all three disks (3) | Right (recorded, nine runs) |
| Metadata's share falls because the journal stops at 1 GiB and large disks get fewer inodes per byte | Right |
| At 20 TiB the 5% reserve is 1 TiB (12.4 times) and 1% is 204.8 GiB (2.5 times) (2) | Right (recorded) |
| -m 1: reserves, blocks users can write and the gain on each disk (3) | Right (recorded) |
| -m 0: only the kernel's 4,096 held back; blocks users can write and the gain (3) | Right (recorded) |
| `tune2fs -m` changes the reserve without reformatting | Unverifiable |
| With -m 0 root gets no more room than other users | Right (recorded reserved count 0) |
| Check 1: at 2 GiB the journal doubles to 64 MiB, and 26,214 reserved blocks fall short of 26,284, 0.997 times | Right (recorded) |
| Check 2: 4 TiB is big, with 8,750,621 metadata blocks against 17,138,715 at 128 MiB less, and 32.1 GiB more for users | Right (recorded) |
| Check 3: 13,421,772 blocks (51.2 GiB) come back; 4,495,258 blocks of metadata and the kernel's 4,096 stay | Right (recorded -m 0 run) |
| Check 3: `tune2fs -m 0` on an existing filesystem gives that | Unverifiable (only `mkfs -m 0` was recorded) |
| The reserve is free space, kept for privileged use | Right (recorded: reserved blocks are in f_bfree) |
| An inode records one file; a fixed number of 256-byte inodes is set aside at mkfs | Right |

### Fact-check: isdigit

Oracle: CPython 3.15.1's frozen answers and Unicode 17.0.0's rows in `model.test.ts`, the counts from a scan of every code point, the 128 isdigit-but-not-isdecimal code points in `fixtures/isdigit-digit-ages.json`, the check-question cases (U+3000 then 7, `'٣4'`, `float('٣.5')`, `float('2.²')`, ⑤, 𝟗), and the CPython and UAX #44 lines `model.ts` cites. Signs, underscores, the rest of int()'s grammar and the digit limit are outside the model, so claims about them are unverifiable.

#### Plain page

| Claim | Mark | Against |
| --- | --- | --- |
| No: isdigit() is True for characters int() refuses, so the guarded line can raise | Right | Recorded ² |
| isdigit() also refuses strings int() parses | Right | Recorded U+3000 then 7 |
| The three methods each check a Unicode group; the sets nest; int() uses the smallest | Right | `makeunicodedata.py` and `unicodectype.c` as cited; recorded counts 770, 898, 2,023, int 770 |
| isdecimal covers ASCII and other scripts' digits (٣ ३ ３) | Right | Recorded |
| isdigit adds superscripts, subscripts and circled digits (² ₂ ② ₃ ① ❼) | Right | All in the fixture's 128 |
| ...and some historical scripts whose digits are not positional | Unverifiable | The fixture holds Ethiopic, Kharoshthi and Brahmi digits; how they are used is not in the oracle |
| isnumeric adds fractions, Roman numerals and Chinese numerals (½ Ⅻ 五) | Right | Recorded ½, Ⅻ and 三; 五 has the same Unihan shape as 三 |
| Why int() refuses ² ("1²" would be ambiguous) | Unverifiable | |
| int() strips surrounding whitespace | Right | Recorded U+3000 then 7 |
| int() accepts a sign | Unverifiable | |
| int() accepts underscores between digits | Unverifiable | |
| isdigit() accepts no whitespace, sign or underscore | Right (model) | None has field 7; recorded U+3000 |
| Grid and preset buttons: what the three checks and int() give for 42, ٤٢ (42), ３ and ７, 𝟕𝟕 (77), ², ①, ₃, ፫, 1², ½, Ⅻ, 五 and " 7 " (13) | 13 Right | Recorded rows for ², ½, Ⅻ, ３ and 三; the model for the rest, each the shape of a recorded case (`'٣4'` gives 34; ⑤ and 𝟗 recorded). The page's 20 ranges equal the fixture's 128 code points exactly |
| "abc", "3.5" and "" are refused by both | Unverifiable | int()'s grammar |
| The 4,300-digit limit since 3.11 (and in 3.7 to 3.10 security releases), its message, `sys.set_int_max_str_digits` | Unverifiable | |
| isdecimal() is the same as `re.fullmatch(r"\d+", s)` | Unverifiable | |
| isdecimal() still rejects "-5" and " 5" | Right (model) | Neither '-' nor ' ' has field 6 |
| isascii() and isdecimal() together mean only 0 to 9 | Unverifiable | isascii() is not in the oracle |
| s.isdecimal() means int(s) works (up to the digit limit) | Right (model) | Every field-6 character rewrites to an ASCII digit |
| The ValueError message text | Unverifiable | Only the exception was recorded |

#### Rayner page

| Claims | Mark |
| --- | --- |
| The answer: isdigit() is True for ² and int('²') raises ValueError | Right (recorded) |
| int() turns text into a whole number and raises ValueError when it cannot | Right |
| What each check returns for each of the five characters (15) | Right (recorded) |
| int() of the five characters: ٣ gives 3, the others raise (5) | Right (recorded) |
| The rewrite: non-ASCII decimals to ASCII digits, whitespace to spaces, anything else to '?' | Right (`unicodeobject.c:9536-9553` as cited; recorded U+3000) |
| The eight characters' values; int() and isdecimal() accept the first four, isdigit() adds ², isnumeric() takes all eight (2) | Right (recorded) |
| Fields 6, 7 and 8, and CPython building its tables from them | Right (UAX #44 and `makeunicodedata.py` as cited) |
| Each character's row: ٣ fills 6 to 8, ² 7 and 8, ½ only 8 (1/2), Ⅻ only 8 (12), 三 none, with Unihan kPrimaryNumeric 3 (5) | Right (verbatim rows) |
| isdigit() follows field 7 and int() field 6 | Right (cited source) |
| 770, 898 and 2,023 | Right (recorded scan) |
| The sets nest | Right (UAX #44; recorded scan) |
| The innermost box holds the only single characters int() accepts | Right (recorded: int 770) |
| Accepted by a check but not by int(): 0, 128 and 1,253 (3) | Right (recorded) |
| For one character only isdecimal() matches int() | Right |
| int() accepts surrounding spaces | Right (recorded U+3000 case) |
| int() accepts signs | Unverifiable |
| int() accepts underscores in valid positions | Unverifiable |
| Check 1: s.isdigit() is False and int(s) is 7 | Right (recorded) |
| Check 1: why (Zs is whitespace, rewritten to a space) | Right (cited source) |
| Check 2: float('٣.5') is 3.5 and float('2.²') raises, through the same rewrite | Right (recorded) |

### Fact-check: cert-renewal

Oracle: Certbot v5.8.0's renewal test vectors and the Certbot 3.3, 4.1 and 5.8 lines `model.ts` cites; Boulder's GCRA `TestDecide` vector and `RenewalInfoSimple`; the ARI windows Let's Encrypt served for ten sites on 2026-10-25; the Baseline Requirements and Let's Encrypt lifetime tables; and the model's twice-daily simulation. The year-long renewal counts are the model's own simulation, as the receipt says; claims resting on it are marked "Right (model)" as in round 1.

#### Plain page

| Claim | Mark | Against |
| --- | --- | --- |
| Public certificates are heading for 47 days | Right | BR table: 47 from 2029-03-15 |
| Some are as short as six days | Right | Let's Encrypt's shortlived profile, 160 hours |
| Recent Certbot releases renew at a share of the lifetime when `renew_before_expiry` is unset: with a third left, or at half under about ten days | Right | Certbot vectors; `renewal.py:425-429` |
| ARI is ACME Renewal Information, RFC 9773 | Right | As `model.ts` cites |
| `renew_before_expiry = 30 days` fixes the margin in days | Right | `renewal.py:478` |
| Lifetimes stayed at 90 days for years | Unverifiable | History |
| A fixed 30 days renews 90-, 64- and 47-day certificates at day 60, 34 and 17; a certificate of 30 days or less is due from issue | Right (model) | |
| On 47-day certificates the fixed rule issues about twice as many as needed | Right (model) | 21 against 11 a year |
| A certificate born inside the window is renewed at every run | Right | Certbot's `renew_before_expiry` vector on 7-day certificates; model |
| With a twice-daily timer that is about 730 issuances a year | Right (model) | 729 runs ask; the page then says the CA limits them (the limit lets 264 through) |
| Let's Encrypt limits certificates for the same set of names per week | Right | 5 per 7 days |
| **"Then renewals start failing, and once they keep failing the certificate expires" (and the simulator's verdict: "renewals will fail, and the certificate will then expire")** | **Wrong** | Under Boulder's GCRA a token comes back every 33.6 hours, so a renewal gets through every 24 to 36 hours (`model.test.ts`: issued at hours 0, 12, … 72, 108, 144, 168, 204, 240). For every lifetime from 6 to 30 days the model issues 264 and refuses 465 a year, and the certificate never expires |
| The setting looks fine until the lifetime drops to the margin, then renews at every run | Right (model) | Property test: due from issue exactly when the lifetime is at most 30 days |
| A calendar job every 60 days on 47-day certificates leaves 13 days expired | Right (arithmetic) | |
| Simulator default (47 days, 30-day margin, twice a day): day 17 (36%), 30 days of margin, 60 tries, about 21 a year | Right (model) | |
| Certbot's default timer runs twice a day | Right | `using.rst:965` |
| Caddy renews with a third left | Unverifiable | |
| cert-manager renews at two thirds by default; `renewBeforePercentage` | Unverifiable | |
| CAs offering six-day certificates recommend renewing around half way | Right | Boulder's `RenewalInfoSimple`: half for under ten days |
| Table: the fixed rule's renewal day for 398, 200, 100, 90, 64, 47, 45 and 6 days | Right (model) | |
| 398, 200, 100 and 47 days are the CA/Browser Forum caps, in steps from 2026 to 2029 | Right | BR table |
| 90, 64 and 45 days are typical ACME defaults in the transition | Right | Let's Encrypt classic profile: 90, 64 from 2027-02-10, 45 from 2028-02-16 |
| Six-day certificates are already offered | Right | shortlived profile |
| With ARI the CA answers with a window and the client picks a random time in it | Right | Certbot's draw, modelled and tested |
| The window normally sits around two thirds | Right | `RenewalInfoSimple`; recorded windows |
| The CA can move the window earlier before a revocation | Unverifiable | |
| ARI spreads renewals and lets the CA ask for early replacement | Unverifiable | |
| Some CAs exempt ARI-guided renewals from rate limits | Right, loosely | Boulder exempts an order that names the certificate it replaces and arrives inside its window |
| Certbot's file paths and commands (`renewal/<name>.conf`, `cli.ini`, `--dry-run`, the systemd timer) | Unverifiable | |
| Deleting `renew_before_expiry` lets the proportional default and ARI apply on a current Certbot | Right | The 4.1+ default when unset; a stored setting takes precedence (`renewal.py:475-482`) |
| acme.sh, lego and scripts often use 30 days | Unverifiable | |

#### Rayner page

| Claims | Mark |
| --- | --- |
| BR caps of 398, 200, 100 and 47 days, with their dates | Right (published table) |
| Let's Encrypt: tlsserver 45 days since May 2026; classic 90, 64 from February 2027, 45 from February 2028; shortlived 160 hours (2) | Right (published dates) |
| Certbot 3.3 renews within `renew_before_expiry`, 30 days unless set | Right (cited source) |
| Let's Encrypt dates a certificate 58.5 minutes before issuing it | Right (recorded certificates; Boulder config) |
| A 90-day certificate falls due just before the run at day 60 | Right (model) |
| 30 days before expiry is day 60 (67%), day 34 (53%), day 15 (33%), and 23.3 days (560 hours) before issue for 160 hours (4) | Right (model) |
| Certbot 4.1's default: two thirds, half under ten days, unless ARI sets the window (RFC 9773) | Right (Certbot vectors and source) |
| The default renews at day 60, 42.7 (run at 43), 30, and hour 80 (run at 84) (4) | Right (model on Certbot's vectors) |
| Renewals a year: 6 and 6, 8 and 10, 12 and 24, 104 and 264 with 465 refused; 3 and 13 in two weeks (5) | Right (model simulation) |
| Margin left when renewal falls due, and the runs it allows (4) | Right (model) |
| Boulder skips the limit only for an order naming the certificate it replaces, inside its window; Certbot 5.8's order names none; a refused order costs nothing, an issued one takes a token (3) | Right (cited Boulder and Certbot source) |
| ARI windows: day 59.1 to 60.9, 42 to 43.3, 29.6 to 30.5, hour 78.9 to 82.1; 1% of the life either side of two thirds or half (5) | Right (`RenewalInfoSimple`; recorded live windows for 90 days) |
| Run probabilities and renewal counts under ARI (4) | Right (model) |
| An explicit 30-day setting renews before the window opens, so the ARI answer changes nothing | Right (model; `renewal.py:475-482`) |
| 160 hours with 30 days: every run renews until hour 84, then most are refused; later renewals 24 to 36 hours apart | Right (model; tested sequence) |
| 5 per 7 days, one back every 33.6 hours | Right (Let's Encrypt docs; Boulder) |
| Check 1: 20-day certificates, 264 renewed and 465 refused from hour 84; the default at day 13.3, 27 a year | Right (model) |
| Check 2: a 10-day setting renews 45-day certificates at day 35 with 20 runs left, replacing the default (day 30, 30 runs) | Right (model; cited source) |
| Check 3: an ARI-timed order is exempt only if it names its predecessor | Right (cited Boulder) |
| Certbot 4.1 and later ask Let's Encrypt when to renew | Right (cited source) |
| The documented cron runs at 00:00 and 12:00 | Right (`using.rst:965`) |

### Errors found

None on the Rayner pages. On the plain pages:

1. ext4-space, the `df` output and the Size/Used/Avail diagram: Used is "20K", "root dir + lost+found". The recorded runs give 70 used blocks at 1 GiB and 519 (2,076 KiB) at 1 TiB, most of it the orphan file mke2fs 1.47.3 creates (64 and 512 blocks; debugfs on inode 12), which the page never mentions. Small, and in a number nobody would act on.
2. ext4-space: "By default that's one inode for every 16 KiB of capacity", and the calculator applies that default at every size. mke2fs switches to one per 32 KiB at 4 TiB and one per 64 KiB at 16 TiB; the recorded 4 TiB run has 134,217,728 inodes and the 20 TiB run 335,544,320. For a 20 TiB disk the calculator gives four times the inode tables mkfs makes.
3. ext4-space: the option "64 KiB (-T largefile)". `mke2fs.conf.in` v1.47.3 gives `largefile` an inode ratio of 1,048,576: 1 MiB.
4. ext4-space: "1 MiB (-T largefile4)", in the option and in the code comment. The ratio is 4,194,304: 4 MiB. With error 3, a reader who picks `-T largefile` expecting one inode per 64 KiB gets a sixteenth as many inodes, which is the running-out-of-inodes failure the same page warns about. The Rayner page does not cover `-T` at all; only the pinned source file exposed these two.
5. cert-renewal: a margin longer than the lifetime makes "renewals start failing, and once they keep failing the certificate expires". The limit Let's Encrypt applies (5 per 7 days, one back every 33.6 hours, as Boulder's GCRA computes it) lets a renewal through every 24 to 36 hours, so a certificate of six days or more keeps being replaced: 264 issued and 465 refused a year in the model, which `model.test.ts` holds to Boulder's own vector. The page's advice (use a share of the lifetime) is still right; the harm it predicts is not.

The plain pages' central answers were right in all three. ext4: the reserve and units explain most of the gap, and metadata is about 1.7% on 1 TB. isdigit: no, ² passes and int() raises; its table of the 128 isdigit-only characters is exactly Unicode 17.0.0's. cert-renewal: renew at a share of the lifetime, two thirds or half under ten days, which is Certbot 4.1's default. The pilot's errors did not carry over: the plain ext4 page's journal table gives 32 MiB for a whole 1 GiB filesystem, as recorded.

### What round 2 shows and does not show

It shows:

- Unaided pages by this model on these topics made more errors than in round 1: 5 in 109 claims, against 3 in 96. Four of the five concern mke2fs details (the orphan file, its size types and its profile ratios). Two would mislead a reader who acted on them: the `-T largefile` ratios and the predicted expiry.
- The Rayner pages made none in 147 claims. For three of the five plain-page errors the Rayner page states the contradicting fact, taken from its oracle: the first files' block counts, the big and huge inode ratios, and renewals continuing under the limit. The oracle the method requires is also what exposed the errors in this check. On the other two the Rayner page is silent: it is narrower than the plain page.
- 31 of the plain pages' 109 claims could not be checked against any oracle, against 5 of the Rayner pages' 147. Much of what a plain page adds (tool advice, other clients, history) is exactly what nobody checked.

It does not show:

- That models generally get these topics wrong. The pilot found errors on 3 of 38 questions across seven topics, and the plain pages' headline answers were right in every case. The model that wrote the pages is the same model family that did the checking.
- That the engine, rather than the method, prevents errors: no method-only pages were made this round, and round 1 found no difference between the two.
- Anything about other models, other topics or other authors. One checker, three topics, one page each; claim counts depend on the split, which the tables show.
- How well any page teaches.
