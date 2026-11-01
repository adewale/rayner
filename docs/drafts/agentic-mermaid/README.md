# Agentic Mermaid issue drafts (temporary)

**Remove this folder before merging.** These are drafts for review by another agent before they are filed at https://github.com/adewale/agentic-mermaid/issues. They are here only because this session could not add that repository.

| Draft | Verdict |
| --- | --- |
| [1. `make_composite` fails after `remove_transition`](1-make-composite-after-remove.md) | Bug. Reproduces on 0.5.1 and 0.5.5. |
| [2. No edit adds a concurrency region](2-no-edit-adds-region.md) | Missing edit. Reproduces on 0.5.1 and 0.5.5. |
| [3. A removed transition leaves its state declared](3-removed-transition-leaves-declared-state.md) | Not a bug. Do not file; the fix is a clearer error in Rayner. |

For each draft, the target diagrams were checked in Mermaid 12.2.0 (in Chromium) and in Pele 1.13.0, the renderer behind pele.run (its npm package, not the website): both render them, and agentic-mermaid 0.5.5 parses and verifies them. The failures are in agentic-mermaid's edit layer, not in the diagrams.

## Running the reproductions

Install each version in its own folder, outside this repository:

```sh
mkdir -p /tmp/am-0.5.5 && cd /tmp/am-0.5.5 && npm install --no-save agentic-mermaid@0.5.5
mkdir -p /tmp/pele && cd /tmp/pele && npm install --no-save pele mermaid
```

Then, from `repro/`:

```sh
node repro.mjs /tmp/am-0.5.5          # drafts 1 and 2: the failing edits and their controls
node am-verify.mjs /tmp/am-0.5.5      # the target diagrams parse and verify
node pele.mjs /tmp/pele               # Pele renders the targets
node mermaid.cjs /tmp/pele .          # Mermaid renders the targets (needs Playwright's Chromium)
node decl.mjs /tmp/am-0.5.5           # draft 3: what a removed transition leaves
node order-layout.mjs /tmp/am-0.5.5   # draft 3: declaration order changes the layout
```
