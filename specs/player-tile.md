# Player tile: the explainer reads as one object

Status: requirements, ready to implement. Mock: [`specs/player-tile.mock.html`](player-tile.mock.html) (open it in a browser; the tags T1 to T6 in it refer to the sections below). Builds on [`specs/player-redesign.md`](player-redesign.md), which is implemented on `feature/player-step-bar` (PR #59). The decisions in §3 are settled and are not to be reopened during implementation; where this document leaves a choice to you, it says so.

This document is written for an implementing agent. It assumes you have read `specs/player-redesign.md` §1 (the player's parts and the functions in `app/embed.ts`), `app/embed.ts`, `app/embed.css`, `app/embed-strings.ts`, `app/embed-icons.ts`, `app/loader.ts`, `app/embed-protocol.ts`, `app/embed-share.ts`, `tools/lib/explain-build.ts`, `tools/explain-demos.ts`, `tools/explain-site.ts`, `tools/lib/explain-share.ts`, `tools/lib/explain-site-describe.ts`, `explain/palettes.ts`, `explain/look.ts`, `explain/stage.ts` (the `paper` rectangle and `colors`), `docs/PUBLISHING.md`, `docs/REFERENCE.md` §Player and §Embedding, and `docs/TESTING.md`.

## 1. Context

### 1.1 The problem

After the step-bar redesign the player card holds the stage, the stepper row and the step's words, and nothing else. The explainer's title and its case picker sit above the card on the page background (`header.head`); the steps rail sits beside it (`aside.rail`) or under it (`details.rail`); the transcript hangs below (`details.transcript`); and when framed without the loader, an "Open in a new tab" link hangs below that (`a.standalone`). Five things on one background, nothing marked as a unit.

Inside a host page it is worse. The iframe shows the whole page, margins included, so the host's box wraps a Rayner page that wraps a Rayner card, with the explainer's title between the two borders as if it were the host's heading. The loader appends its own link after the iframe, outside everything. `out/explainers/embed-lab.html`, built by `npm run demos:build`, shows this at 1280 px: two host cards, each with a page inside and a card inside that, and the link cut off at the bottom left.

A test, borrowed from how Spotify, YouTube and CodePen embeds behave: crop the tile out of any context. It must still say what it is, what it is about, who made it and where to go. Today's card fails on all four. After this change it passes.

### 1.2 What the embeds do

Read once, not to copy, to understand what the host and the reader expect from an embedded object.

| Practice | Spotify | YouTube | CodePen | Rayner today |
| --- | --- | --- | --- | --- |
| One tile holds everything that belongs to the entity (title, meta, content, controls, list) | Yes: artwork, title, artist, controls, scrolling track list | Title over the video, controls under | Header with pen title and author, tabs, result | Title and cases outside the card; rail outside; transcript outside |
| A mark of the maker in the chrome, never on the content | Logo required on every surface | Logo in the control bar | Logo in the header | None (a `generator` meta tag) |
| A way back to the source, inside the tile | "Listen on Spotify" | "Watch on YouTube" | "Edit on CodePen" | A bare link after the iframe |
| The tile is the edge: the iframe's content fills it, `border-radius:12px` in the snippet | Yes | Yes | Yes, with a theme border | Page padding and background show inside the iframe |
| Known sizes | Fixed heights (152, 352) | Minimum 200 × 200, 16:9 advised | `data-height` | 640 px then grows; nothing published |
| Paste-to-embed | oEmbed | oEmbed | oEmbed | None |
| Surface takes its tone from the content | Tile colour from the artwork | No | Theme | White card around a cream or navy paper |

What not to copy: Spotify forbids controls over artwork, and YouTube's title overlay on the video is widely disliked. The rule in `app/embed.ts` ("Keep navigation outside the picture so controls cannot cover its lettering") stands. Identity goes in the chrome, never on the stage.

### 1.3 The current DOM, on `feature/player-step-bar`

`mountEmbed()` builds this and replaces the static shell's children with it (`root.replaceChildren(head, layout, transcript, ...(framed ? [standalone] : []))`, `app/embed.ts` near line 216):

```
main#content
  header.head
    h1                                  the explainer's title (from the shell's h1)
    fieldset.case*                      one per setting: legend, div.segments > label > input[type=radio] + span
  div.layout                            grid; two columns at ≥1100px
    section.player[aria-label=t.player]
      div.frame > div.stage[role=img]
      div.stepper[role=group]           Prev, Next, ol.step-bar, div.tools
      div.view-controls                 narrow only
      div.words                         p.lede, p.caption, details.described
      p.notice[role=status]
      p#picture-summary[hidden], p.ruler, p.lede-ruler
    aside.rail (≥1100px) | details.rail (<1100px)   h2 "Steps" | summary "All n steps"; ol.steps
  details.transcript                    from the shell; every case's steps as links
  a.standalone                          only when framed without parentOrigin
```

The static shell (`tools/lib/explain-build.ts`, the `html` template near line 119) is `<main id="content"><h1>…</h1><div class="stage poster">…</div><p class="caption">…</p><details class="transcript" open>…</details></main>`.

Framed detection: `window.parent !== window`. With `parentOrigin` set (the loader) the page posts its height and sets `--player-reserve: 0px` (line 171); without it the page adds `a.standalone` (lines 211–216). The loader (`app/loader.ts`) creates the iframe, appends an `<a>` "Open in a new tab" after it, and `dispose()` removes both.

The stage's paper is the palette's `paper` colour (`explain/palettes.ts`, thirteen palettes; `explain/stage.ts` draws it as the `__paper` rectangle from `colors.paper`, and `colors` is the stage's `palette` getter). A style can change per case, so the paper can change when the case changes.

### 1.4 Selectors that tests and tools depend on

| Selector or text | Where | Decision |
| --- | --- | --- |
| `h1` | `test/explain-embed.test.ts:1197` (`title`), `tools/lib/bench-measure.ts`, cross-browser tests | Keep one `h1`; it moves into the card (T1) |
| `.case input`, `input[name=…]:checked` | `test/explain-embed.test.ts:2255` and the reader model | Keep; the fieldsets move with the header |
| `a.standalone` | `test/explain-embed.test.ts:2373` | Replace with `.foot a.open` (T3); the assertion changes to "present whenever framed, with or without parentOrigin" |
| Loader's appended `<a>` | `test/explain-embed.test.ts:658` and `:2281` host pages, `test/loader*.test.ts` if any, `docs/PUBLISHING.md` | The loader no longer appends a link (T3); remove assertions on it |
| `.rail`, `.steps`, `details.rail`, `aside.rail` | explain-embed tests from the previous change | Keep the classes; `details.rail` moves inside the card (T2) |
| `.transcript` | reader model, no-JavaScript test (`:1053`), `test/explain-embed.test.ts` transcript-links test (`:1336`) | Keep the class; it moves inside the card (T2); stays `open` in the shell, closed once the player mounts, as today |
| File list `loader.js, index.html, embed-lab.html, catalog.json, evidence.json, …` | `test/explain-built-files.test.ts:10` | Add `<id>/embed.json` (T6) |
| `?theme=` test | `test/explain-embed.test.ts` near line 2290 ("?theme=dark, light and auto…") | Keep; T4 adds the loader's host-scheme behaviour |

### 1.5 Checks you must keep green

Same as `specs/player-redesign.md` §1.4: `npm run check`, `npm test`, `npm run test:embeds` (needs Chromium; see `docs/TESTING.md`), `npm run demos:check`, `npm run check:budgets`, `npm run pack:smoke`. The lettering pin (`test/lettering-baseline-linux.json`) changes with any change to `app/embed.*`: regenerate it on Linux with `UPDATE_GOLDEN=1` as the last, separate commit, titled like `Pin the player tile's output on Linux`. The macOS pin needs a Mac; say so in the report.

`app/embed.css` is 4020 bytes gzip on `feature/player-step-bar`. It may grow by at most 1.5 KiB gzip in this change.

## 2. The idea

**The page is the tile.** Everything the iframe shows is inside one bounded object: title, cases, picture, stepper, words, steps, transcript, maker's mark, way out. Outside the tile the page has only background. A standalone page is then the same tile, centred, on Rayner's background; an embedded page is the same tile on the host's background, with nothing of Rayner's around it. A reader sees one thing and knows where it begins and ends; a host author gets one edge to place.

## 3. Decisions (settled)

1. The title and the case picker move inside the card, as its header (T1). The card's `h1` is the page's `h1`. Nothing is duplicated.
2. On a wide page the steps rail is a pane of the same tile, sharing its surface and border, separated by a vertical rule (T2). On a narrow page the steps disclosure sits inside the card, under the words.
3. The transcript moves inside the card, as a closed disclosure row under the words at every width (T2). The static shell keeps it `open` for readers without JavaScript and for crawlers.
4. The card gets a footer strip: a small Rayner mark with the word "Rayner", linking to the project; and, when framed, an "Open the explainer" link to the page itself (T3). The loader stops appending its own link, and `a.standalone` goes.
5. In a frame, the page has no padding and no background of its own; the card's edge is the iframe's edge (T4). The loader's `theme: 'auto'` follows the host page's computed colour scheme, not the device's, so the transparent frame never paints an opaque canvas.
6. The card's chrome takes a tint from the current case's paper (T5), from the palette, never by sampling pixels. The tint is gated by contrast: the same mix for every palette, as strong as the weakest palette allows.
7. Each explainer publishes its natural framed height at 390, 640 and 900 px, and `site:export --origin` writes an oEmbed response per explainer and a discovery link in each page (T6).
8. No new controls. Play, autoplay, a time scrubber and a "what changed" panel stay out (see `specs/player-redesign.md` §6).
9. The stage stays clean: no mark, no title and no control is ever drawn over the picture.
10. Strings for the new words exist in English and French, like every other string in `app/embed-strings.ts`. "Rayner" is a name and is not translated.

## 4. Requirements

Each requirement ends with acceptance criteria. Tags (T1…) match the mock.

### T1. The header is inside the card

Move `header.head` to be the first child of `section.player`. It keeps its children (`h1`, then one `fieldset.case` per setting) and its layout (title flexible, case pickers at the end of the row, wrapping under the title on a narrow card). It gets the card's padding (16 px, 12 px on a narrow card) and a 1 px rule under it (`border-bottom: 1px solid var(--line)`), so the stage reads as a picture mounted under a label. The card's top corners round the header, not the stage: `.stage` loses its top radius.

The static shell changes to match, so a page without JavaScript has the same outline: `<main id="content"><div class="layout tile"><section class="player"><h1>…</h1><div class="stage poster">…</div><p class="caption">…</p><details class="transcript" open>…</details></section></div></main>`. `mountEmbed()` still replaces the root's children.

`--player-reserve` on `#content` stays 300 px; its comment already counts the header. Check at 1280 × 800 and 1440 × 900 that Next is on screen at load with the header inside the card, and adjust the value only if it is not, reporting the new number.

Acceptance:

- `document.querySelectorAll('h1').length === 1`, and `h1.closest('.player')` is the card, in every built page.
- The case picker is inside the card: `.player .case input` matches, and `.head` has no sibling before `.frame`.
- At 1280 × 800, after load, the Next button's top edge is within the viewport. Report the measured offset for mr-cache, oauth-pkce and quotient-familial as before.

### T2. One tile: the rail is a pane, the steps and transcript are inside the card

`div.layout` becomes the tile: it carries the surface, the border and the 12 px radius (`background: var(--tile); box-shadow: 0 0 0 1px var(--tile-line); border-radius: 12px; overflow: clip`). `section.player` loses its own border and radius. On a wide page (`min-width: 1100px`) the grid is as today, `minmax(0, var(--player-cap)) minmax(300px, 1fr)` with `gap: 0`, and `aside.rail` is the second column with `border-inline-start: 1px solid var(--tile-line)` and padding 12 px; the pane stretches to the tile's height (`align-self: stretch`) and its content, not the pane, is sticky (`.rail > .rail-body { position: sticky; top: 16px; max-height: calc(100dvh - 32px); overflow: auto }`), so the pane's background is continuous while the list follows the reader. The rail's `h2` "Steps" stays.

On a narrow page the `details.rail` ("All n steps") moves inside `section.player`, after `div.words` and before the transcript. Its summary is a full-width row with the card's horizontal padding and a 1 px rule above (`border-top: 1px solid var(--line)`). `placeRail()` keeps moving the one `ol.steps` between `aside.rail` and `details.rail`; when wide, `details.rail` is removed from the card and `aside.rail` appended to the tile; when narrow, the reverse.

`details.transcript` moves inside `section.player` after the steps disclosure (after `div.words` when wide). It is a row of the same shape as the steps disclosure: summary with padding, rule above, closed when the player mounts, `max-width: 68ch` on its list as today. It keeps its class and its click handling.

The card's order is then: `header.head`, `div.frame`, `div.stepper`, `div.view-controls`, `div.words`, `p.notice`, `details.rail` (narrow), `details.transcript`, `footer.foot` (T3), then the hidden summary and rulers.

Fullscreen (`.player:fullscreen`) shows the card alone: keep the header and the stepper row visible and the stage within `100dvh - 180px`; the steps and transcript rows may scroll below. Check the lede is visible at 1280 × 800 in fullscreen.

Acceptance:

- One element on the page carries the tile border: `.layout.tile` has a box-shadow and `.player` has none (`getComputedStyle(player).boxShadow === 'none'`).
- At 1280 × 800 the rail's left rule is continuous from the tile's top to its bottom: the `aside.rail` box height equals the `.layout` box height.
- At 390 × 844 `details.rail` and `details.transcript` are both inside `.player`, in that order, after `.words`; nothing is a child of `#content` but `.layout`.
- Opening the transcript at 390 px grows the card, and (inside the loader) the frame, as the transcript did before; `test/explain-embed.test.ts:658`'s height assertions still pass.
- The reader model's `ClickStep` still opens the closed rail first; the transcript-links test still moves the player.

### T3. The footer strip: mark and way out

Add `footer.foot` as the last visible child of `section.player`: a 40 px row with the card's horizontal padding and a 1 px rule above, `font-size: .8125rem; color: var(--muted)`.

At its start, `a.mark`: the Rayner glyph (16 px, `currentColor`) and the word "Rayner", linking to `PRODUCT.home` (add `home: 'https://github.com/adewale/rayner'` to `PRODUCT` in `scenes/explainers/catalog.ts`; the build passes it into the page as it passes the title; an outside author's page built with `rayner build` uses the same constant from the package). `target="_blank" rel="noopener"`. Its accessible name is `t.madeWith` ("Made with Rayner" / "Réalisé avec Rayner"); its visible text is "Rayner".

At its end, only when framed (`window.parent !== window`, with or without `parentOrigin`): `a.open`, text `t.open` ("Open the explainer" / "Ouvrir l’explication"), `href` = this page's URL with `parentOrigin` removed and the current `step` and case values in the query (as `a.standalone` computed today), `target="_blank" rel="noopener"`. It replaces `a.standalone`, which is deleted, and the loader's appended link, which is deleted from `app/loader.ts` (and from `dispose()`), from `docs/PUBLISHING.md` and from `embed-lab.html`. `t.newTab` is deleted.

The glyph, `icon('mark')` in `app/embed-icons.ts`, on the 24-unit grid: three rounded bars in a row at mid-height, like the step bar, the first filled. Paths: `M2 10.5h5a1.5 1.5 0 0 1 0 3H2a1.5 1.5 0 0 1 0-3z` filled with `currentColor`; `M9.5 10.5h5a1.5 1.5 0 0 1 0 3h-5a1.5 1.5 0 0 1 0-3z` and `M17 10.5h5a1.5 1.5 0 0 1 0 3h-5a1.5 1.5 0 0 1 0-3z` stroked as the other icons are. `icon()` draws strokes only, so give it an optional `fill` list, or add the one filled path as a `rect`; your choice, keep `icon()`'s signature compatible.

Acceptance:

- Every built page has exactly one `.foot a.mark` whose text is "Rayner" and whose `href` is `PRODUCT.home`.
- Framed with and without `parentOrigin`: `.foot a.open` exists, opens the same page at the current step and case without `parentOrigin` (the assertion that today checks `a.standalone`'s count becomes this). Standalone: `.foot a.open` is absent.
- The loader page (`test/explain-embed.test.ts:658` host) has no `<a>` outside the iframe; `dispose()` leaves nothing behind.
- The mark is never inside `.stage`.

### T4. Framed mode: the card's edge is the iframe's edge

When `window.parent !== window`, before first paint, the page sets `document.documentElement.dataset.framed = ''` (the inline script runs before the body is laid out, so do it at the top of the module, as the theme is set at line 41). CSS under `:root[data-framed]`: `body { background: transparent }`, `#content { padding: 0; max-width: none }`. The tile keeps its 12 px radius and its 1 px border, so the host's background shows at the corners and the tile is the only edge. The transcript and rail rows are inside the tile already (T2), so nothing of Rayner's is outside it.

The static shell has no script before its body, so to avoid a flash of padded page in a frame, the build inlines a one-line script at the top of `<body>`: `if(parent!==window)document.documentElement.dataset.framed=''`. It is part of the page's inline script hash (`sri(js)` in `explain-build.ts`) or gets its own hash in the CSP; either way the CSP stays strict.

**Colour scheme.** A cross-origin iframe whose used `color-scheme` differs from its embedder's is painted on an opaque canvas by Chromium, which would defeat the transparent background. So: the loader resolves the host's scheme when `theme` is `'auto'` or absent (`getComputedStyle(document.documentElement).colorScheme`, `'dark'` if it contains `dark` and the device prefers dark, else `'light'`; if the host says `normal`, treat it as light) and passes it as `?theme=`. The page, when framed and given a theme, sets `color-scheme` to that one value only (today `:root[data-theme=light]{color-scheme:light}` and the dark rule already do this). Document that a raw iframe should pass `?theme=light` or `?theme=dark` to match its host, and that without it the device's scheme is used. Test in Chromium: a light host page with `?theme=light` shows the host's background colour at the tile's corners, in both device schemes.

`--player-reserve: 0px` stays for the loader case (the frame follows the content). For a raw iframe with a fixed height, keep the cap, so Next is on screen inside the frame.

Update the snippet in `docs/PUBLISHING.md` step 4 to `<iframe src="…" title="…" style="width:100%;height:640px;border:0;border-radius:12px;display:block" allow="fullscreen" loading="lazy"></iframe>`, and the loader's iframe style to include `border-radius:12px`. Update `embed-lab.html` in `tools/explain-demos.ts` to the new snippet and drop its own card border around each embed: the tile is the edge now, and the lab shows the host's article text above and below each embed so the boundary is visible.

Acceptance:

- Framed: `getComputedStyle(document.body).backgroundColor` is `rgba(0, 0, 0, 0)` and `#content` has zero padding; standalone: unchanged from today.
- In the loader host at 1280 × 800, a pixel 2 px inside the iframe's top-left corner is the host's background colour, in light and dark device schemes, with the host page light.
- The loader passes `theme=light` or `theme=dark` when `theme` is auto, and the given value otherwise.
- The headers recipe (`<page>.html.headers.json`) still pins every inline script and style by hash; `tools/verify-live-site.ts` and the CSP test, if any, pass.

### T5. The chrome takes a tint from the paper

**Historical requirement, superseded by #73.** The player now defaults to neutral colours. Per-page palette cues are opt-in and contrast-checked; the current contract is in [The tile](../docs/REFERENCE.md#the-tile). The automatic tint and its acceptance criteria below describe the earlier implementation.

The player sets `--paper` on `section.player` to the current case's paper colour, from the palette, when the case loads (and in `load()` when it changes). The build sets the same inline `style="--paper:#…"` on the shell's `.player` for the default case, so the first paint is already tinted. Get the colour from where the stage already has it: `explain/stage.ts` exposes `palette` on the stage; make the trace or the scene's description carry `paper` (one hex string per case) and read it in the player. Do not sample pixels.

CSS tokens, on `.tile`:

```
--tint: 10%;
--tile: color-mix(in srgb, var(--paper, var(--surface)) var(--tint), var(--surface));
--tile-line: color-mix(in srgb, var(--paper, var(--line)) 30%, var(--line));
```

`.tile`, `.head`, `.stepper`, `.words`, `.rail`, the disclosure rows and `.foot` use `--tile` where they used `--surface` (the `.button` background stays `var(--surface)` so buttons lift off the tinted chrome; the step bar's quiet segments mix with `--tile`). Rules inside the tile use `--line`; the tile's outer edge and the rail's rule use `--tile-line`. The tint transitions with `background-color 200ms` when the case changes, none under reduced motion.

**Contrast gate.** Add a Node test (`test/embed-tint.test.ts`) that, for each of the thirteen palettes in `explain/palettes.ts` and both themes (light `--surface #fff`, `--fg #14202b`, `--muted #536170`, `--accent #176166`; dark `--surface #17212b`, `--fg #e9eff5`, `--muted #9fb0c0`, `--accent #86d3c8`), computes `--tile` as sRGB linear interpolation at the chosen `--tint`, and asserts `contrast(fg, tile) ≥ 7`, `contrast(muted, tile) ≥ 4.5` and `contrast(accent, tile) ≥ 3` (WCAG 1.4.3 and 1.4.11), using `explain/look.ts`'s `contrast` or an equivalent. Start at 10 %. If any palette fails, lower `--tint` in steps of 1 % until all pass, use that value in `embed.css`, and report the value and the weakest pair. The test reads the value from `embed.css` so the two cannot disagree.

Acceptance:

- `getComputedStyle(player).getPropertyValue('--paper')` equals the case's palette paper, and changes when the case changes to one with another style (find or add a catalog explainer whose cases differ in style; if none exists, test with a scene in the test file).
- The tint test passes at the value in `embed.css`.
- The default case's tint is present before the script runs: the shell's `.player` has the inline `--paper`.

### T6. Known heights and paste-to-embed

**Heights.** `npm run demos:build` (which already launches Chromium for stills) measures each explainer's page, served over a local HTTP origin with `?parentOrigin=<that origin>` so `--player-reserve` is 0 and the page is in framed mode, at viewport widths 390, 640 and 900, default case, first step, after `#content[data-ready]`, and records `document.documentElement.scrollHeight` as `<id>/embed.json`: `{ "schema": 1, "aspect": "16/9", "heights": { "390": n, "640": n, "900": n } }`. `site:export` copies it beside the page as `<id>.embed.json`. The reader-visible transcript and rail are closed at measurement, as they are at load. Add `<id>/embed.json` to the built-files list.

**oEmbed.** With `--origin`, `site:export` writes `<id>.oembed.json` per exported explainer:

```json
{
  "version": "1.0",
  "type": "rich",
  "provider_name": "Rayner",
  "provider_url": "https://github.com/adewale/rayner",
  "title": "<explainer title>",
  "thumbnail_url": "<origin><path>/<id>.png",
  "thumbnail_width": 960,
  "thumbnail_height": 540,
  "width": 640,
  "height": <heights["640"]>,
  "html": "<iframe src=\"<origin><path>/<id>.html?theme=light\" title=\"<title>\" width=\"640\" height=\"<n>\" style=\"border:0;border-radius:12px;display:block;max-width:100%\" allow=\"fullscreen\" loading=\"lazy\"></iframe>",
  "cache_age": 86400
}
```

Thumbnail dimensions come from the PNG, not from constants (check `stillPng`'s width and read the height). `html` is HTML-escaped as JSON. A static host cannot honour `maxwidth`; document that the response is fixed at 640 and that the iframe shrinks with `max-width:100%`. Each exported explainer page gets `<link rel="alternate" type="application/json+oembed" href="<origin><path>/<id>.oembed.json" title="<title>">` in its head, added the way the share tags are (`publishedPage` in `tools/lib/explain-share.ts`), and `checkCards` checks it is present once. `llms.txt` is unchanged. Without `--origin`, neither file nor tag is written, as with share pages.

Acceptance:

- `out/explainers/<id>/embed.json` exists for all 30 explainers with three positive integer heights, each greater than `width * 9 / 16 + 61` for its width.
- A test loads mr-cache in the loader at 640 px wide and asserts the frame's settled height equals `heights["640"]` within 2 px.
- `site:export --origin https://example.org` to a temporary directory writes `<id>.oembed.json` whose `html` parses to one `<iframe>` with the attributes above, and each page has the discovery link once; `checkCards` fails if the file is missing. Without `--origin`, neither exists.
- `test/explain-built-files.test.ts` lists the new file.

### T7. Strings

Add to `Chrome` and both tables in `app/embed-strings.ts`: `madeWith` ("Made with Rayner" / "Réalisé avec Rayner"), `open` ("Open the explainer" / "Ouvrir l’explication"). Delete `newTab`. `frame` stays (the loader's default iframe title). `explain-lang` tests assert both languages.

### T8. Accessibility, keyboard and motion

- Tab order inside the tile is header (case radios), stage, stepper, words' disclosure, steps disclosure or rail, transcript, mark, open. The rail pane's list keeps its roving behaviour.
- `footer.foot` has no landmark role of its own inside `section.player` (a `footer` inside a `section` is not `contentinfo`); fine as is.
- Focus rings are visible on the tinted chrome: `:focus-visible` uses `var(--accent)`, which the T5 gate keeps at ≥ 3:1 against `--tile`.
- No new motion beyond the tint transition, which reduced motion disables.

### T9. Right-to-left pages

The footer uses logical properties; the mark is at the inline start and the open link at the inline end. The rail's rule is `border-inline-start`. Check with `dir="rtl"` forced on mr-cache as the previous change did.

### T10. Documentation and evidence

- `docs/REFERENCE.md` §Player: a paragraph "The explainer is one tile…" describing the header, the panes, the footer, framed mode and the tint; §Embedding: framed mode, the loader's theme behaviour, no appended link, `embed.json`, `oembed.json`, the discovery link.
- `docs/PUBLISHING.md`: steps 4 and 5 updated (snippet, theme advice, no link, heights, oEmbed); a short "Paste-to-embed" subsection.
- `specs/rayner.md` "Reader settings": one sentence that the page is the tile.
- `CHANGELOG.md`: an entry.
- `docs/evidence/player-tile/README.md` with captures, before (from `feature/player-step-bar`) and after: mr-cache and exgit (dark paper) at 1280 × 800 and 390 × 844; `embed-lab.html` at 1280 × 800 before and after; and one "crop test" capture of the tile alone (`locator('.tile').screenshot()`) for mr-cache at 900 px wide. Record the four questions (what it is, about, who made it, where to go) and which elements answer them in the after capture.

### T11. Tests to add

In `test/explain-embed.test.ts` unless noted:

1. One `h1`, inside `.player`, in every catalog page, both languages (extend the catalog sweep).
2. The tile border is on `.layout.tile` only; `.player` has none.
3. Wide: `aside.rail` height equals `.layout` height; narrow: `details.rail` then `details.transcript` inside `.player` after `.words`.
4. `#content`'s only child is `.layout` at both widths.
5. `.foot a.mark` once per page; `.foot a.open` present when framed (both parentOrigin cases), absent standalone; its `href` has the current step and case and no `parentOrigin`.
6. The loader appends nothing but the iframe; `dispose()` removes the iframe and the listener.
7. Framed: transparent body, zero padding; the host's background shows at the tile's corner (pixel check) in light and dark device schemes.
8. The loader passes `theme=light|dark` when auto, from the host's computed scheme.
9. `--paper` equals the palette's paper; changes with a case whose style differs; present in the shell.
10. `test/embed-tint.test.ts`: the contrast gate over thirteen palettes and two themes, reading `--tint` from `embed.css`.
11. `embed.json` for every explainer, each height above the floor; the loader's settled height at 640 px equals `heights["640"]` ± 2.
12. `site:export --origin` writes `oembed.json` and the discovery link; without `--origin` it does not (extend the existing export test, or `test/explain-site.test.ts` if that is where export is tested).
13. The reader model: add `OpenTranscript` and `OpenSteps` commands if absent, and check after every command that `.player` contains `.head`, `.frame`, `.stepper`, `.words`, `.transcript` and `.foot` in that order.
14. RTL forced on mr-cache: the mark is at the right, the open link at the left, the rail on the left.
15. Update the selectors in §1.4.
16. The crop test, T12.

No property test is required.

### T12. The crop test, as a permanent test

The question in §1.1 becomes a test that runs on every catalog page, in `test/explain-embed.test.ts` as part of the catalog sweep (all 30 explainers, so both languages): **the tile stands alone**. Load the page at 900 × 800 standalone, wait for `#content[data-ready]`, and assert, reading the DOM only (no pixel sampling):

1. **What it is.** Inside `.tile`: one `section.player` whose `aria-label` is `t.player` for the page's language ("Explainer" / "Explication"); one `.stepper` holding the Next button (`t.nextLabel`) and `ol.step-bar` with one segment per step of the default case.
2. **What it is about.** Inside `.tile`: one `h1` whose text is the scene's `meta.title`; one `.lede .kicker` reading `t.stepOf(1, n)`; one `.case` fieldset per setting of the scene.
3. **Who made it.** Inside `.tile`: one `.foot a.mark` with visible text "Rayner", `href` equal to `PRODUCT.home`, accessible name `t.madeWith`.
4. **Where to go.** Standalone: `.foot a.open` is absent, and the transcript and steps disclosures are inside `.tile`. Then reload the same page inside a raw iframe (no `parentOrigin`) and inside the loader: in both, `.foot a.open` is present inside `.tile`, its `href` is this page without `parentOrigin` and with the current `step` and case values.
5. **The boundary.** Every element under `#content` with a non-empty bounding box is a descendant of `.tile` or is `.tile` itself, and the union of those boxes equals the tile's own box within 1 px on each side. In a frame, additionally, `getComputedStyle(document.body).backgroundColor` is transparent and `#content` has zero padding, so nothing of Rayner's is drawn outside the tile.

Also save, as evidence (not asserted beyond existence), `locator('.tile').screenshot()` for mr-cache and quotient-familial at 900 px to `docs/evidence/player-tile/crop-<id>-900.jpg`; the README names them as the crop test's pictures.

Acceptance: the test fails on `feature/player-step-bar` (where the title, the rail and the transcript are outside the card) and passes on `feature/player-tile`. Confirm both and say so in the report.

## 5. Order of work and reporting

Work on a branch `feature/player-tile` cut from `feature/player-step-bar`. Commit in this order, each commit green on `npm run check` and `npm test` (except the lettering pin, which fails from the first commit until the last):

1. T1 and the shell (header inside the card; shell outline).
2. T2 (the tile, the rail pane, the rows inside the card) and the test updates in §1.4.
3. T3 and T7 (footer, mark, open link, loader link removed, strings).
4. T4 (framed mode, loader theme, snippet, embed-lab).
5. T5 (tint and its gate).
6. T6 (heights, oEmbed, discovery link).
7. T12 (the crop test).
8. T10 (docs, CHANGELOG, evidence).
9. The Linux lettering pin, alone.

Push the branch. Do not open a pull request.

Report, at the end: what was built against each T-number; the final `--player-reserve` (T1) and `--tint` (T5) values with the weakest contrast pair; the gzip delta of `app/embed.css` against `feature/player-step-bar`; the full output of the six checks in §1.5; which lanes could not run (WebKit, Safari) and what changed in them untested; anything left out and why; the evidence paths. Do not describe the design as improved; show the captures and the measurements.

## 6. Not in this change

A compact tile (stage and stepper only, words as a tooltip) for narrow sidebars; a click-to-load poster facade for heavy pages; a dynamic oEmbed endpoint honouring `maxwidth`; the oEmbed provider registry listing. Each is a separate proposal.
