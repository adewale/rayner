# Publishing

How to put a built page on a website. The contracts (URL parameters, the resize, step and goto messages and headers) are in [the reference](REFERENCE.md).

## Publish a page

1. Review every case and retain the exact reviewed page:

   ```sh
   rayner review scene.ts --out public/cache.html
   ```

   Review runs the checks and served-reader audit, then saves the reviewed HTML, receipt, header recipe and `loader.js`. Test the model and inspect the screenshots under `out/review/<id>/` too. A failed review removes the success receipt and leaves the previous published page alone.

   In a checkout, use `npm run rayner -- review ...`. The HTML contains every case, poster, transcript, sources and licence notices. It makes no network requests at runtime. Use `build` for an unreviewed draft.

2. Upload `cache.html` to any static host, with `loader.js` if you will use the loader.

3. Send the headers in `cache.html.headers.json` as HTTP response headers for that file. The CSP pins the page's inline script and style by hash, so a CDN that rewrites or minifies the HTML breaks it; rebuild instead.
   - `frame-ancestors` works only as a response header, never from a `<meta>` tag. The recipe allows any site to frame the page (`frame-ancestors *`); replace `*` with your own origins to restrict it.
   - Do not send `X-Frame-Options: DENY` or `SAMEORIGIN` for a page other sites embed. CORS headers do not grant framing.
   - The page that embeds it needs the artifact's origin in its own `frame-src`, and the loader's in `script-src` if it uses the loader.
   - The recipe's `Cache-Control` revalidates on every load. Long-lived caching is safe only for a URL that changes when the content does, such as one with the receipt's `artifactHash` in it.

## Export the collection

Run `npm run demos:check` and `npm run demos:review` to build and review the complete collection. Its gallery leads with six showcase lessons; the rest remain available as subject lessons and authoring recipes. The catalog records `showcase` separately from coverage counts.

Prepare all pages with `npm run site:export -- <site-root>`. To prepare only the showcase, use:

```sh
npm run site:export -- <site-root> --only python-dict,bloom-filter,git-branches,melody-rhythm,monty-hall,token-bucket --entry python-dict
```

You can also build and review just the selected pages in an isolated directory:

```sh
npm run demos:check -- --only python-dict,bloom-filter --out out/showcase
npm run demos:review -- --from out/showcase
npm run site:export -- <site-root> --from out/showcase --only python-dict,bloom-filter --entry python-dict
```

The exporter checks shared files and selected page bytes against their build pins. Unselected pages need not exist. Full catalog CI still requires every source lesson, case, resting step and reading width.

`--entry` must name a selected lesson. If omitted, export keeps the catalog entry when selected, otherwise it uses the first requested id. No particular subject is mandatory. The exported catalog, evidence and `llms.txt` report only the selected lessons; complete collection checks remain separate.

Export verifies source and built-file fingerprints before writing. It validates a staging directory, replaces the Rayner subtree, preserves other host header rules and writes a deployment manifest with file hashes. Each selected lesson gets HTML, a poster, JSON description and embed sizes. Public teaching steps get generated cards and, with `--origin https://example.org`, share pages. Detailed steps retain ordinary query links. Step cards are rendered during export, so excluded lessons incur no card-rendering work.

Export prepares files in the directory you supply. Uploading or deploying those files is a separate step.

For Oshineye.dev, the same six subject lessons can be accompanied by `font-metrics` and `pen-and-pencil` under “How these are made.” Add those ids to `--only`; their `toolchain` group remains in the exported catalog. The remaining examples stay available in the full collection and source repository.

## Embed a page

1. Embed it with a plain iframe:

   ```html
   <iframe src="/explainers/cache.html?step=request&request=miss&theme=light"
           title="Why a cache changes the request path"
           style="width:100%;height:640px;border:0;border-radius:12px;display:block"
           allow="fullscreen"
           loading="lazy"></iframe>
   ```

   In a frame the page draws only the explainer's tile: no background or padding of its own, so your page's background shows around it, and the tile is the only edge. Write no card or border around it. Pass `theme=light` or `theme=dark` to match your page's colour scheme; without it the reader's device scheme is used, and a browser may then paint an opaque background behind the tile. The iframe keeps its height and scrolls when the content is taller; captions make the page taller on phones. The heights in `<id>.embed.json` (below) give the page's natural height at 390, 640 and 900 px. `allow="fullscreen"` lets the reader's Enlarge button work; without it the button is hidden. The tile's footer carries "Open the explainer", which opens the page at the reader's step and case in a new tab.

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

   **Drive an explainer from the host page.** The loader tells the host each step the reader settles on, and lets the host move the player: a scrolling essay can follow along, or a button elsewhere on the page can show a step or a case.

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

5. Check what the host actually serves; the repository's tests run against local files.
   - `curl -sI https://your.site/explainers/cache.html` shows the CSP and `Cache-Control` from the recipe.
   - The page opens at the step and case in its URL, Next plays, and the transcript opens.
   - With two embeds on one page, opening one transcript resizes only that iframe.
   - Inside a frame, your page's background shows at the tile's corners, and the tile's footer has "Open the explainer".
   - With `--origin`, `<id>.oembed.json` is served as JSON and the page's head links to it.
   - Record the `artifactHash` from the receipt beside the URL you published. For the collection, compare the served bytes with `deployment.json`; valid CSP hashes alone do not prove that the latest reviewed page was deployed.

The exported `catalog.json` contains the product copy, authoring links, titles, groups and counts used by the generated gallery. A host with its own page design can render that data into its template. Regenerate that page as part of the host build, so a new explainer or a changed requirement cannot leave a second catalog behind.
