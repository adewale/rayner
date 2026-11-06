#!/usr/bin/env bash
# Regenerate vendor/lettering/: the faces explainers ask for with meta.lettering
# (src/lettering.ts). They are the same Inter and JetBrains Mono releases as the
# embedded faces, cut to Latin Extended, Greek and Cyrillic. They are build
# inputs only: each explainer that asks embeds a subset of them, cut again to the
# characters it draws (tools/lib/explain-lettering.ts). The embedded faces in
# src/font-data.ts are not touched; tools/repo/fonts.sh makes those. Needs fonttools +
# brotli and npm:
#   pip install fonttools brotli && npm run fonts:lettering
set -euo pipefail
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
(cd "$tmp" && npm pack --silent inter-ui@4.1.1 jetbrains-mono@1.0.6 >/dev/null && for t in *.tgz; do mkdir "${t%.tgz}" && tar xzf "$t" -C "${t%.tgz}"; done)

# Keep in step with SCRIPTS in tools/lib/explain-lettering.ts.
LATN="U+0100-024F,U+1E00-1EFF"           # Latin Extended-A and -B, Latin Extended Additional
GREK="U+0370-03FF,U+1F00-1FFF"           # Greek and Coptic, Greek Extended
CYRL="U+0400-052F"                       # Cyrillic, Cyrillic Supplement
U="$LATN,$GREK,$CYRL"

# The same layout features as the embedded faces, so a word kerns as it would there.
mkdir -p vendor/lettering
sub() { pyftsubset "$1" --unicodes="$U" --layout-features="$3" --flavor=woff2 --output-file="$2"; }
sub "$tmp/inter-ui-4.1.1/package/web/Inter-Regular.woff2" vendor/lettering/inter.woff2 'kern,liga,ccmp,locl,mark,mkmk'
sub "$tmp/jetbrains-mono-1.0.6/package/fonts/webfonts/JetBrainsMono-Regular.woff2" vendor/lettering/jetbrains-mono.woff2 'kern,mark,mkmk'
ls -l vendor/lettering/*.woff2 | awk '{print $5, $9}'
