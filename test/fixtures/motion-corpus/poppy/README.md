# Frozen Poppy scenes for the motion corpus

The motion corpus ([`../corpus.ts`](../corpus.ts), [docs/MOTION-CORPUS.md](../../../../docs/MOTION-CORPUS.md))
measures the keyed motion check by editing these folders, never the current `scenes/explainers/`.
So its figures change only when the checks change: redesigning a current Poppy chapter cannot make
an edit stop applying, or turn a reconstructed defect into a no-op. The current chapters are held
by their own scene tests and the catalog's gates.

Frozen from `scenes/explainers/{lib,poppy,poppy-*}` as they stand at
`6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef` (last changed in `3664c14cd06cd44940bda2f67528d2f7299d067e`), where
every corpus edit applied and the full run kept each historical ID's own diagnosis or its named
construction obligation. The historical 39/59 and 16/20 figures were measured on earlier revisions
and stay as recorded in docs/MOTION-CORPUS.md.

The copy is never imported in place: `buildVariant` copies it to `out/motion-corpus-<id>/`, three
levels below the root as `scenes/explainers/<id>/` is, so its relative imports reach the current
engine. It is excluded from the type-check projects for that reason; running it is its check (the
default corpus sample, and the full run, which also requires every frozen baseline to replay with no
finding). Edit it only to migrate it across a deliberate engine API change, keeping its pictures and
motion as they are, and say so in the commit.
