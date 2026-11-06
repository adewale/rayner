# rayner-cli

The `rayner` command for [Rayner](https://github.com/adewale/rayner) explainers: `init`, `preview`, `snapshots`, `check`, `review`, `build`, `shots`, `describe` and `see`. It bundles each page with Rayner's player, captures diagram snapshots in headless Chromium and, on request, lettering snapshots with Python.

Scenes import the [`rayner`](https://www.npmjs.com/package/rayner) package, which has no dependencies. This package adds the command and its tools (esbuild, TypeScript, Agentic Mermaid, Playwright, svgpath and resvg) and requires `rayner` at exactly its own version. Install both:

```sh
npm install --save-dev rayner rayner-cli
npx playwright-core install chromium
npx rayner init my-explainer
```

[Quick start](https://github.com/adewale/rayner#quick-start) · [Tutorial](https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md) · [Command line](https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md#command-line)
