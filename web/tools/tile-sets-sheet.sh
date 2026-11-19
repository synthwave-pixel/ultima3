#!/usr/bin/env bash
# The tile sets sheet after the README's features (promo/tile-sets.jpg): every look at the opening, in a fight and in a
# dungeon corridor, the same moment in each, two looks to a row. The shots are the map's 704 x 704, taken by
# web/tools/promo/shots.js (promo.tileSets) into screenshots/; this lays them out. Needs ImageMagick 7 and macOS's
# Arial. Run from anywhere: bash web/tools/tile-sets-sheet.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
shots="$root/screenshots"
out="$root/promo/tile-sets.jpg"

# slug|label, in the Visuals menu's order (help.ts TILE_SETS; Standard is labelled U3 2026).
looks=(
  "remastered|Remastered"
  "standard|U3 2026"
  "lairware|Lairware"
  "pc-vga|PC VGA"
  "nintendo|Nintendo"
  "pc-ultima-v|PC Ultima V"
  "pc-mcga|PC MCGA"
  "apple-ii-color|Apple II Color"
  "apple-ii-mono|Apple II Mono"
  "macintosh-b-w|Macintosh B&W"
  "pc-ega|PC EGA"
  "pc-cga|PC CGA"
  "commodore-64|Commodore 64"
)
scenes=(opening combat dungeon)

margin=18 gap=8 side=244 group=28 top=96 label=26 rowgap=20 per=2
block=$((side * 3 + gap * 2))
rows=$(((${#looks[@]} + per - 1) / per))
width=$((margin * 2 + block * per + group * (per - 1)))
height=$((top + rows * (label + side + rowgap) - rowgap + margin))
regular=/System/Library/Fonts/Supplemental/Arial.ttf
bold="/System/Library/Fonts/Supplemental/Arial Bold.ttf"

args=(-size "${width}x${height}" xc:'#111111'
  -font "$bold" -fill white -pointsize 22 -annotate +18+38 'Thirteen tile sets, one game')
for g in $(seq 0 $((per - 1))); do
  for s in 0 1 2; do
    x=$((margin + g * (block + group) + s * (side + gap)))
    args+=(-font "$bold" -fill '#999999' -pointsize 13 -annotate "+$x+$((top - 26))" "$(echo "${scenes[$s]}" | tr a-z A-Z)")
  done
done
for i in "${!looks[@]}"; do
  slug="${looks[$i]%%|*}"
  name="${looks[$i]#*|}"
  gx=$((margin + (i % per) * (block + group)))
  y=$((top + (i / per) * (label + side + rowgap)))
  args+=(-font "$bold" -fill white -pointsize 16 -annotate "+$gx+$((y + 16))" "$name")
  for s in 0 1 2; do
    x=$((gx + s * (side + gap)))
    args+=('(' "$shots/ts-$slug-${scenes[$s]}.png" -resize "${side}x${side}!" ')' -geometry "+$x+$((y + label))" -composite)
  done
done
magick "${args[@]}" -quality 90 -sampling-factor 4:2:0 -strip "$out"
echo "wrote $out (${width}x${height})"
