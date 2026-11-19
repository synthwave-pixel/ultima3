#!/usr/bin/env bash
# The tile sets sheets after the README's features (promo/tile-sets-1.jpg, promo/tile-sets-2.jpg): every look at the
# opening, in a fight and in a dungeon corridor, the same moment in each, two looks to a row - the new looks and the
# PC's, then the Macintosh's, the Apple II's, the Commodore 64's and the NES's. The shots are the map's 704 x 704,
# taken by web/tools/promo/shots.js (promo.tileSets) into screenshots/; this lays them out. Needs ImageMagick 7 and
# macOS's Arial. Run from anywhere: bash web/tools/tile-sets-sheet.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
shots="$root/screenshots"

scenes=(opening combat dungeon)
margin=18 gap=8 side=244 group=28 top=96 label=26 rowgap=20 per=2
block=$((side * 3 + gap * 2))
regular=/System/Library/Fonts/Supplemental/Arial.ttf
bold="/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# sheet OUT TITLE "slug|label"...: the looks in order (slugs as promo.tileSets names the shots).
sheet() {
  local out="$root/promo/$1" title="$2"
  shift 2
  local looks=("$@")
  local rows=$(((${#looks[@]} + per - 1) / per))
  local width=$((margin * 2 + block * per + group * (per - 1)))
  local height=$((top + rows * (label + side + rowgap) - rowgap + margin))
  local args=(-size "${width}x${height}" xc:'#111111' -font "$bold" -fill white -pointsize 22 -annotate +18+38 "$title")
  for g in $(seq 0 $((per - 1))); do
    for s in 0 1 2; do
      local x=$((margin + g * (block + group) + s * (side + gap)))
      args+=(-font "$bold" -fill '#999999' -pointsize 13 -annotate "+$x+$((top - 26))" "$(echo "${scenes[$s]}" | tr a-z A-Z)")
    done
  done
  for i in "${!looks[@]}"; do
    local slug="${looks[$i]%%|*}" name="${looks[$i]#*|}"
    local gx=$((margin + (i % per) * (block + group)))
    local y=$((top + (i / per) * (label + side + rowgap)))
    args+=(-font "$bold" -fill white -pointsize 16 -annotate "+$gx+$((y + 16))" "$name")
    for s in 0 1 2; do
      local x=$((gx + s * (side + gap)))
      args+=('(' "$shots/ts-$slug-${scenes[$s]}.png" -resize "${side}x${side}!" ')' -geometry "+$x+$((y + label))" -composite)
    done
  done
  magick "${args[@]}" -quality 90 -sampling-factor 4:2:0 -strip "$out"
  echo "wrote $out (${width}x${height})"
}

sheet tile-sets-1.jpg 'Thirteen tile sets, one game: the new looks and the PC'"'"'s' \
  "remastered|Remastered" "standard|U3 2026" "pc-vga|PC VGA" "pc-ultima-v|PC Ultima V" \
  "pc-mcga|PC MCGA" "pc-ega|PC EGA" "pc-cga|PC CGA"

sheet tile-sets-2.jpg 'Thirteen tile sets, one game: the Macintosh, Apple II, Commodore 64 and NES' \
  "lairware|Lairware (Macintosh)" "macintosh-b-w|Macintosh B&W" "apple-ii-color|Apple II Color" \
  "apple-ii-mono|Apple II Mono" "commodore-64|Commodore 64" "nintendo|Nintendo"
