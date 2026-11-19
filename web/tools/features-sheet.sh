#!/usr/bin/env bash
# The features sheets after the README's banner (promo/features-1.jpg, promo/features-2.jpg): six shots of the
# Remastered look each, three across, each with its caption - the world, then playing it. The shots are the game's
# canvas (1280 x 768) with its letters, captured from a development build by web/tools/promo/shots.js (promo.shot)
# and saved to screenshots/ by tools/pilot/shots.mjs (DEVELOPMENT.md); this lays them out. Needs ImageMagick 7 and
# macOS's Arial. Run from anywhere: bash web/tools/features-sheet.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
shots="$root/screenshots"

margin=18 gap=12 w=500 h=300 top=50 caption=36 cols=3
regular=/System/Library/Fonts/Supplemental/Arial.ttf
bold="/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# sheet OUT TITLE "name|caption"...: the panels in reading order.
sheet() {
  local out="$root/promo/$1" title="$2"
  shift 2
  local panels=("$@")
  local rows=$(((${#panels[@]} + cols - 1) / cols))
  local width=$((margin * 2 + w * cols + gap * (cols - 1)))
  local height=$((top + rows * (h + caption)))
  local args=(-size "${width}x${height}" xc:'#111111' -font "$bold" -fill white -pointsize 22 -annotate +18+38 "$title")
  for i in "${!panels[@]}"; do
    local name="${panels[$i]%%|*}" text="${panels[$i]#*|}"
    local x=$((margin + (i % cols) * (w + gap)))
    local y=$((top + (i / cols) * (h + caption)))
    args+=('(' "$shots/$name.png" -resize "${w}x${h}!" ')' -geometry "+$x+$y" -composite
      -font "$regular" -fill '#dddddd' -pointsize 15 -annotate "+$x+$((y + h + 20))" "$text")
  done
  magick "${args[@]}" -quality 90 -sampling-factor 4:2:0 -strip "$out"
  echo "wrote $out (${width}x${height})"
}

sheet features-1.jpg 'Ultima III: Exodus, Remastered - the world' \
  "f01-overworld|Sosaria framed in blue, its coasts in sand and surf" \
  "f02-town|Towns framed in copper, their talk in sentence case" \
  "f12-ambrosia|Ambrosia in gold: each place has its own frame" \
  "f06-dungeon|Each dungeon walled in its own stone" \
  "f07-top-down|Top down: the level round the party" \
  "f08-sosaria|View map: Sosaria as the party has seen it"

# The Flatpak releases up to v1.0.88 name promo/features.jpg as their screenshot (desktop/metainfo.cjs): kept, as the
# first sheet, so their listing keeps a picture.
cp "$root/promo/features-1.jpg" "$root/promo/features.jpg"

sheet features-2.jpg 'Ultima III: Exodus, Remastered - playing it' \
  "f03-snap|Snap attacks: the foe X will strike, marked" \
  "f04-spell-aim|Bolt spells aimed the same way, LB/RB for another" \
  "f10-spells|On a controller, spells with no use here are greyed" \
  "f05-sheet|A character's sheet, and a look of their own" \
  "f09-journal|A quest journal with just enough hints" \
  "f11-visuals|Fonts for reading: Legible, Dyslexic, Sixtyfour, DOS"
