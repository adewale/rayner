# Publishing

How to put a built page on a website. The contracts it relies on (URL parameters, the resize, step and goto messages, and headers) are in [the reference](REFERENCE.md).

## Publish a page

1. Review every scenario and retain the exact reviewed page:

   ```sh
   rayner review scene.ts --out public/cache.html
   ```

   Review runs the checks and served-reader audit, then saves the reviewed HTML, receipt, header recipe and `loader.js`. Test the model and inspect the screenshots under `out/review/<id>/` too. A failed review removes the success receipt and leaves the previous published page alone.

   The `rayner` command comes with the `rayner` package; in a checkout, use `npm run rayner -- review ...`. A host serving the page needs no package. The HTML contains every scenario, poster, transcript, sources and licence notices. It makes no network requests at runtime. Use `build` for an unreviewed draft.

2. Upload `cache.html` to any static host, with `loader.js` if you will use the loader.

3. Send the headers in `cache.html.headers.json` as HTTP response headers for that file. The CSP pins the page's inline script and style by hash, so a CDN that rewrites or minifies the HTML breaks it; rebuild instead.
   - `frame-ancestors` works only as a response header, never from a `<meta>` tag. The recipe allows any site to frame the page (`frame-ancestors *`); replace `*` with your own origins to restrict it.
   - Do not send `X-Frame-Options: DENY` or `SAMEORIGIN` for a page other sites embed. CORS headers do not grant framing.
   - The page that embeds it needs the artifact's origin in its own `frame-src`, and the loader's in `script-src` if it uses the loader.
   - The recipe's `Cache-Control` revalidates on every load. Long-lived caching is safe only for a URL that changes when the content does, such as one with the receipt's `artifactHash` in it.

## Export the collection

Run `npm run demos:check` and `npm run demos:review` to build and review the complete collection. Each explainer in `scenes/explainers/catalog.ts` has a tier from its verdict under the [rubric](EXPLAINER-RUBRIC.md): the gallery leads with the `showcase` tier (selected exemplars), lists the `gallery` tier behind "More", and gives the `coverage` tier (kept as the only scene exercising some feature, or until it is rebuilt) no card and no `llms.txt` line, though its page is still built and checked. The exported catalog records each explainer's `tier`.

Prepare all pages with `npm run site:export -- <site-root>`. To prepare only the showcase, use:

```sh
npm run site:export -- <site-root> --only showcase
```

`--only showcase` derives its selection from catalog tiers and keeps the declared product entry. The same alias works for `demos:check`; no hand-maintained list of showcase IDs is needed. A toolchain lesson in the showcase tier (lantern) leads the gallery with the subjects; the other toolchain lessons stay under “Authoring recipes and how Rayner works” in a full export.

You can also build and review just the selected pages in an isolated directory:

```sh
npm run demos:check -- --only python-dict,bloom-filter --out out/showcase
npm run demos:review -- --from out/showcase
npm run site:export -- <site-root> --from out/showcase --only python-dict,bloom-filter --entry python-dict
```

Each page is written as `<id>.html`, so the build and the export refuse two catalog ids that are equal ignoring case (on a case-insensitive host one page would replace the other), and a scene whose `meta.id` is not its catalog id. The exporter checks shared files and selected page bytes against their build pins. Unselected pages need not exist. Full catalog CI still requires every source lesson, scenario, resting step and reading width.

`--entry` must name a selected lesson. If omitted, export keeps the catalog entry when selected, otherwise it uses the first requested id. No particular subject is mandatory. The exported catalog, evidence and `llms.txt` report only the selected lessons; complete collection checks remain separate.

Export verifies source and built-file fingerprints before writing. It validates a staging directory, replaces the Rayner subtree, replaces only its own sections of the site's `_headers` and `llms.txt` (see [several collections on one site](#several-collections-on-one-site)) and writes a deployment manifest with file hashes. Each selected lesson gets HTML, a poster, JSON description and embed sizes. Public teaching steps get generated cards and, with `--origin https://example.org`, share pages. Detailed steps retain ordinary query links. Step cards are rendered during export, so excluded lessons incur no card-rendering work.

Export prepares files in the directory you supply. Uploading or deploying those files is a separate step.

For a custom selection, pass explicit IDs to `--only`. Their `toolchain` groups remain in the exported catalog. The complete collection remains available in the repository.

### The exported catalog

The exported `catalog.json` (version 2) contains the product copy, authoring links, titles, groups and counts used by the generated gallery; `totals.scenarios` and each scene's `scenarios` count the scenarios built (version 1 called them `cases`). A host with its own page design can render that data into its template. Regenerate that page as part of the host build, so a new explainer or a changed requirement cannot leave a second catalog behind.

Its `facts` object holds what a project page's panel shows beside the explainers. Each fact is taken from `package.json` or from `PRODUCT` in `scenes/explainers/catalog.ts`, so a host types none of them:

| Fact | Source |
| --- | --- |
| `name`, `version`, `license` | `package.json` |
| `repository` | `package.json` `repository.url`, without `git+` and `.git` |
| `install`, `installGuide`, `requirements` | `PRODUCT`, the same strings as in `product` |
| `publishes` | `PRODUCT.publishes`, the last sentence of `PRODUCT.description` |

```json
"facts": {
  "name": "rayner",
  "version": "0.2.0",
  "install": "Rayner 0.2.0, which these guides describe, is not on npm yet: …",
  "installGuide": "https://github.com/adewale/rayner#quick-start",
  "requirements": "Node 24 or later to write, check and build. …",
  "publishes": "One HTML page of steps and a transcript, with no runtime network requests.",
  "repository": "https://github.com/adewale/rayner",
  "license": "MIT"
}
```

The export refuses a catalog whose facts are missing, empty, unknown, not https URLs where a URL is expected, or different from the `product` copy beside them. The catalog version stays 2, since a reader that ignores `facts` reads the rest as before; a catalog exported before `facts` existed has none, so a host should check for it.

### Several collections on one site

One site can hold several collections from one Rayner checkout, each exported to its own `--path`:

```sh
npm run site:export -- <site-root> --from out/main --path /projects/rayner
npm run site:export -- <site-root> --from out/poppy --path /projects/poppy \
  --only poppy,poppy-discovery --entry poppy --llms-heading "Poppy, explained" --index none
```

Each export replaces everything under its own path, and only its own section of the two files the collections share at the site root:

- **`llms.txt`.** The collection's lists sit between `<!-- rayner:begin <path> -->` and `<!-- rayner:end <path> -->`, under `## <heading>` (`--llms-heading`, default `Explainers`; toolchain lessons go under `## How these are made` with the default heading, else `## <heading>: how these are made`). The first export to a site writes the H1, blockquote and intro line above it. Later exports keep everything outside their own markers, the host's preamble and other collections' sections included. An export appends its section the first time and replaces it in place after that. An `llms.txt` the host wrote is kept and the section appended to it.
- **`_headers`.** The collection's URL rules sit between ``# Rayner explainers at <path>: generated by `npm run site:export`; regenerate rather than edit.`` and `# End of Rayner explainers at <path>.`. Rules outside every marked block are the host's and are kept, except a rule for one of the collection's own pages.

An `llms.txt` or `_headers` from an export before sections were marked migrates on the next export: the unmarked `## Explainers` and `## How these are made` lists and the old `# Rayner explainers: generated by` comment are dropped, with the rules under that comment for the exported path, and the marked section is appended. Other sections the host added stay. Rules for explainers that the old comment did not head, and that are no longer exported, stay until removed by hand.

Delete or edit a marker line only together with its section: an export refuses a begin line that appears twice or has no end line after it.

**The deployment manifest.** Each collection's `<path>/deployment.json` (version 2) pins its own bytes and none of another collection's:

```json
{
  "version": 2,
  "path": "/projects/poppy",
  "build": { "...": "the build inputs" },
  "files": [{ "path": "/projects/poppy/catalog.json", "sha256": "…" }],
  "sections": [
    { "path": "/_headers", "begin": "# Rayner explainers at /projects/poppy: generated by `npm run site:export`; regenerate rather than edit.", "end": "# End of Rayner explainers at /projects/poppy.", "sha256": "…" },
    { "path": "/llms.txt", "begin": "<!-- rayner:begin /projects/poppy -->", "end": "<!-- rayner:end /projects/poppy -->", "sha256": "…" }
  ]
}
```

`files` lists every file under the path except `deployment.json`, by SHA-256 of its bytes. Version 1 also listed `/_headers` there, by the digest of the whole file, so any other export to the site made it stale. Version 2 lists neither shared file in `files`. Each `sections` entry gives the SHA-256 of that collection's section: the bytes from the start of the `begin` line to the newline after the next `end` line, both lines included. To verify a section, find the line equal to `begin`, which must appear once, then the first line after it equal to `end`, and hash that text. Check that `begin` and `end` name the manifest's own path. `tools/repo/verify-live-site.ts` does this (`verifySections` in `tools/repo/lib/site-headers.ts`), and reads version 1 manifests as before. A host's own verifier should do the same. It should check `/_headers` by its section, and accept changes to the rest of the file, which belongs to the host and the other collections.

**The collection's index page.** By default each export writes a generic gallery at `<path>/index.html` and pins it in `files`. A host with its own page for the collection passes `--index none`: no `index.html` is written under the path, so the host neither copies its page over the gallery nor rewrites the manifest. Serve the host's page at `<path>.html` (outside the exported subtree, so exports never touch it) and send `<path>/` to it. Cloudflare's `auto-trailing-slash` HTML handling redirects `<path>/` to `<path>` when `<path>/index.html` does not exist; elsewhere, add a redirect. The full collection's `embed-lab.html` links `index.html`; with `--index none` that link is broken unless the host also redirects `<path>/index.html`.

## Embed a page

Embed it with a plain iframe:

```html
<iframe src="/explainers/cache.html?step=request&request=miss&theme=light"
        title="Why a cache changes the request path"
        style="width:100%;height:640px;border:0;border-radius:12px;display:block"
        allow="fullscreen"
        loading="lazy"></iframe>
```

In a frame the page draws only the explainer's tile: no background or padding of its own, so your page's background shows around it, and the tile is the only edge. Write no card or border around it. Pass `theme=light` or `theme=dark` to match your page's colour scheme; without it the reader's device scheme is used, and a browser may then paint an opaque background behind the tile. The iframe keeps its height and scrolls when the content is taller; captions make the page taller on phones. The heights in `<id>.embed.json` (below) give the page's natural height at 390, 640 and 900 px. `allow="fullscreen"` lets the reader's Enlarge button work; without it the button is hidden. The tile's footer carries "Open the explainer", which opens the page at the reader's step and scenario in a new tab.

Or let the loader size the iframe to its content:

```html
<div id="cache-explainer"></div>
<script src="/explainers/loader.js"
        data-src="/explainers/cache.html?step=request&request=miss"
        data-target="cache-explainer"
        data-title="Why a cache changes the request path"></script>
```

The loader starts the iframe at 640 px, then follows the page's height messages, accepting them only from that iframe's window and the page's origin, so several embeds on one page size independently. It adds the iframe and nothing else; the way out is the tile's own footer. With `data-theme` absent or `"auto"` it passes your page's computed colour scheme to the player, so the frame stays transparent; `data-theme="light"` or `"dark"` fixes the player's colours. `data-lang` sets the language of the frame's default title, otherwise your page's `lang`. An application can mount and remove embeds itself:

```js
const dispose = RaynerEmbed.mountExplainer(target, '/explainers/cache.html', { title: 'Cache', height: 640, theme: 'auto' });
dispose(); // removes the iframe and the message listener
```

The loader needs the page on HTTP(S): for a `file:` URL it throws and mounts nothing.

**Paste-to-embed.** `site:export --origin https://your.site` also writes `<id>.oembed.json` beside each page and a discovery link in its head, so a CMS that speaks oEmbed can turn a pasted page URL into the iframe. The response is fixed at 640 px wide with the page's height there; a static host cannot honour `maxwidth`, and the iframe shrinks with `max-width:100%`. Without `--origin` neither the file nor the link is written. `<id>.embed.json`, written with or without `--origin`, gives `{ "schema": 1, "aspect": "16/9", "heights": { "390": n, "640": n, "900": n } }`, the page's framed height at those widths, for a host that sizes its iframe before loading.

**Drive an explainer from the host page.** The loader tells the host each step the reader settles on, and lets the host move the player: a scrolling essay can follow along, or a button elsewhere on the page can show a step or a scenario.

```html
<div id="cache-explainer"></div>
<button id="show-miss">Show a cache miss</button>
<script src="/explainers/loader.js"></script>
<script>
  const target = document.getElementById('cache-explainer');
  const explainer = RaynerEmbed.mountExplainer(target, '/explainers/cache.html', { title: 'Cache' });
  // Each settled step: { step, index, total, settings }. The event bubbles from the iframe.
  target.addEventListener('rayner:step', (event) => console.log('rayner:step', event.detail));
  document.getElementById('show-miss').onclick = () => explainer.goTo('request', { request: 'miss' });
</script>
```

`goTo` is validated inside the page as a URL is, replaces the frame's history entry, and does nothing after `explainer()` has disposed of the embed. `options.onStep` receives the same detail as the event. Messages go only between the host's origin and the artifact's, and only between that iframe and its parent, so two embeds on one page never hear or move each other. The message formats are in [the reference](REFERENCE.md#host-page-api-v1).

## Check what the host serves

The repository's tests run against local files, so check the deployed page too:

- `curl -sI https://your.site/explainers/cache.html` shows the CSP and `Cache-Control` from the recipe.
- The page opens at the step and scenario in its URL, Next plays, and the transcript opens.
- With two embeds on one page, opening one transcript resizes only that iframe.
- Inside a frame, your page's background shows at the tile's corners, and the tile's footer has "Open the explainer".
- With `--origin`, `<id>.oembed.json` is served as JSON and the page's head links to it.
- Record the `artifactHash` from the receipt beside the URL you published. For the collection, compare the served bytes with `deployment.json`; valid CSP hashes alone do not prove that the latest reviewed page was deployed.

A loader resize conversation needs an exact HTTP or HTTPS parent origin. A sandboxed host with
an opaque origin, a file URL, or a raw iframe without `parentOrigin` uses a fixed-height iframe
with inner scrolling. Set its height explicitly, using the exported `<id>.embed.json` measurements
at 390, 640 and 900 px as a starting point. Include `allow="fullscreen"` when offering enlargement.
Load one chapter at a time when a series would otherwise load several complete HTML artifacts;
each includes its runtime and fonts. Inspect the actual built byte sizes for the selected chapters.

An author-side `rayner review` checks every scenario standalone at phone and desktop widths and
inside the real loader's iframe at 390 px. Its receipt counts framed steps and sampled live states
separately, and the `framed/` subdirectories retain their screenshots. Caption subjects declared
for the standalone page must also be painted in that frame. A scene edited during review fails
with a changed-source diagnostic. Finish concurrent edits and rerun the review on stable input.

An author-side review also measures the default scenario's initial framed height at 390, 640 and
900 px and writes an `<page>.embed.json` file beside the retained HTML. With `review --out answer.html`,
that file is `answer.embed.json`. The receipt records its path and measured sizes. These are initial
heights for a raw iframe. The loader follows later size changes as the reader moves between steps.
