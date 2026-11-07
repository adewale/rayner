`glyph.js`, the shaper every page uses, is MIT-licensed glyph at the same revision
(`vendor/glyph.pin.json`); rebuild it with `node tools/repo/vendor-glyph.ts /path/to/glyph`
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
page's licence block. Only faces under the SIL Open Font License 1.1 or the
Apache License 2.0 may be embedded: capture checks each notice, and every check
and build from a snapshot checks them again, so a face under any other licence
fails the build. Latin Modern Math 1.959, for `Math`, is the one exception (GUST
Font License); its source checksum and notice are checked before subsetting.
