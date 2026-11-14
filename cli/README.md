# rayner-cli

The `rayner` command for [Rayner](https://github.com/adewale/rayner) explainers: `init`, `preview`, `snapshots`, `check`, `review`, `build`, `shots`, `describe` and `see`. It bundles each page with Rayner's player.

Scenes import the [`rayner`](https://www.npmjs.com/package/rayner) package, which has no dependencies. This package adds the command and its tools (esbuild, TypeScript, Playwright's library and resvg) and requires `rayner` at exactly its own version. Install both:

```sh
npm install --save-dev rayner rayner-cli
npx rayner init my-explainer
```

A scene that draws no Mermaid diagram and asks for no lettering needs nothing more to `init`, `check`, `see`, `describe` and `build`. `review` opens the page in Chromium: run `npx playwright-core install chromium` once, or set `CHROMIUM_EXECUTABLE_PATH`.

Two add-ons, for the scenes that need them ([add-ons](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#add-ons)):

- **Diagrams**: `npm install --save-dev agentic-mermaid@0.5.1 svgpath@2.6.0`, the optional peer dependencies, and Chromium to capture a diagram into `scene.snapshots/`. Committed snapshots replay without Chromium.
- **Lettering**: Python and the source fonts, to capture a lettering snapshot ([lettering](https://github.com/adewale/rayner/blob/main/docs/LETTERING.md)). A committed snapshot replays without them.

[Quick start](https://github.com/adewale/rayner#quick-start) · [Tutorial](https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md) · [Command line](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#command-line)
