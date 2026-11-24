#!/usr/bin/env bash
# Optional, build-time lettering inputs. npm verifies the registry's integrity.
# No changes to application dependencies or the default embedded faces.
set -euo pipefail
cd "$(dirname "$0")/.."
font_dir="${RAYNER_LETTERING_FONTS:-$PWD/out/lettering-fonts}"
mkdir -p "$font_dir"
cd "$font_dir"
npm pack --silent @fontsource/noto-naskh-arabic@5.3.0 @fontsource/noto-sans-devanagari@5.3.0 @fontsource/eb-garamond@5.3.0 @fontsource/source-sans-3@5.3.0 @fontsource/noto-sans-hebrew@5.3.0 inter-ui@4.1.1 jetbrains-mono@1.0.6
for name in fontsource-noto-naskh-arabic-5.3.0 fontsource-noto-sans-devanagari-5.3.0 fontsource-eb-garamond-5.3.0 fontsource-source-sans-3-5.3.0 fontsource-noto-sans-hebrew-5.3.0 inter-ui-4.1.1 jetbrains-mono-1.0.6; do
  mkdir -p "$name"
  tar xzf "$name.tgz" -C "$name"
done

# CJK must use TrueType outlines: glyph does not read CID-keyed CFF.
if [ "${LETTERING_CJK:-0}" = 1 ]; then
  curl -fLsS https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf -o noto-sans-sc-vf.ttf
  echo 'd68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964  noto-sans-sc-vf.ttf' | shasum -a256 -c -
  SOURCE_DATE_EPOCH=0 "${RAYNER_LETTERING_PYTHON:-python3}" -m fontTools.varLib.instancer noto-sans-sc-vf.ttf wght=400 -q -o noto-sans-sc.ttf
  curl -fLsS https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/LICENSE -o Noto-CJK-OFL.txt
fi
