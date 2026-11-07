`glyph.js`, the shaper every page uses, is MIT-licensed glyph at 6398654, the revision
`vendor/glyph.pin.json` records and `glyph-math.js` is built from; rebuild it with `node tools/repo/vendor-glyph.ts /path/to/glyph`
after `node scripts/fetch.js --runtime` in that checkout generates its two tables.

The optional `glyph-math.js` typesetter is MIT-licensed glyph at
6398654dfda7d5a91763e3ef07369b9a9d8e3b2b (Ivar Vong). Rebuild with
`node tools/repo/vendor-glyph-math.ts /path/to/glyph`. It reuses the combining-class
data already present in `glyph.js` and exports only `typeset`, not the renderer.
It is imported only during requested maths snapshot capture, never by a page.

Requested text faces come from pinned Fontsource 5.3.0 packages, Inter UI 4.1.1
and jetbrains-mono 1.0.6 (JetBrains Mono 2.242, whose OFL is
`vendor/licenses/JetBrainsMono-OFL.txt`; the npm package's own LICENSE is the MIT
licence of its CSS). All are OFL. Optional Noto Sans SC uses the checksum-pinned Sans2.004 TrueType
release. `tools/lettering-outline-fonts.sh` retrieves them without changing default faces.
Each requested face's licence is stored in its snapshot and included in the
page's licence block. Which licences a face may have, and the one exception,
Latin Modern Math 1.959 for `MathTex` (`math: true`), are in `docs/LETTERING.md`,
"Supported requests".
