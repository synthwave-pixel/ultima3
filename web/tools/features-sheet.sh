#!/usr/bin/env bash
# The features sheet after the README's banner (promo/features.jpg): twelve shots of the Remastered look, three
# across, each with its caption. The shots are the game's canvas (1280 x 768) with its letters, captured from a
# development build by web/tools/promo/shots.js (promo.shot) and saved to screenshots/ by tools/pilot/shots.mjs
# (DEVELOPMENT.md); this lays them out.
# Needs ImageMagick 7 and macOS's Arial. Run from anywhere: bash web/tools/features-sheet.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
shots="$root/screenshots"
out="$root/promo/features.jpg"

# name|caption, in reading order.
panels=(
  "f01-overworld|Remastered: Sosaria framed in blue, its coasts in sand and surf"
  "f02-town|Towns framed in copper, their talk in sentence case"
  "f03-snap|Snap attacks: the foe X will strike, marked"
  "f04-spell-aim|Bolt spells aimed the same way, LB/RB for another"
  "f05-sheet|A character's sheet, and a look of their own"
  "f06-dungeon|Each dungeon walled in its own stone"
  "f07-top-down|Top down: the level round the party"
  "f08-sosaria|View map: Sosaria as the party has seen it"
  "f09-journal|A quest journal with just enough hints"
  "f10-spells|On a controller, spells with no use here are greyed"
  "f11-visuals|Fonts for reading: Legible, Dyslexic, Sixtyfour, DOS"
  "f12-ambrosia|Ambrosia in gold: each place has its own frame"
)

margin=18 gap=12 w=500 h=300 top=50 caption=36 cols=3
rows=$(((${#panels[@]} + cols - 1) / cols))
width=$((margin * 2 + w * cols + gap * (cols - 1)))
height=$((top + rows * (h + caption)))
regular=/System/Library/Fonts/Supplemental/Arial.ttf
bold="/System/Library/Fonts/Supplemental/Arial Bold.ttf"

args=(-size "${width}x${height}" xc:'#111111'
  -font "$bold" -fill white -pointsize 22 -annotate +18+38 'Ultima III: Exodus, Remastered')
for i in "${!panels[@]}"; do
  name="${panels[$i]%%|*}"
  text="${panels[$i]#*|}"
  x=$((margin + (i % cols) * (w + gap)))
  y=$((top + (i / cols) * (h + caption)))
  args+=('(' "$shots/$name.png" -resize "${w}x${h}!" ')' -geometry "+$x+$y" -composite
    -font "$regular" -fill '#dddddd' -pointsize 15 -annotate "+$x+$((y + h + 20))" "$text")
done
magick "${args[@]}" -quality 90 -sampling-factor 4:2:0 -strip "$out"
echo "wrote $out (${width}x${height})"
