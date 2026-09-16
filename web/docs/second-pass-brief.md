# Second pass: Pincher, Snatch, Griffon

Status: delivered and integrated; kept as the record of the notes.

Three figures from the first delivery to redraw. Everything else in the pack
is accepted and in the game. Rules, palette and delivery format are as in
`figure-art-spec.md`; only the drawing changes. `second-pass-reference.png`
shows the three as delivered, at 6x, at half size and on green, beside Bradle
and Dragon, which work.

## What is wrong

- **Pincher (tile 28)** has no pincers. It is a dome with two eyes and thin
  legs, and the name is the whole identity of the creature. Frame 2 only
  shifts the legs, so the "opens claws" action is missing. At half size it is
  a pale blob with dots.
- **Snatch (tile 90)** is the same dome in slate grey with red eyes. Colour
  is the only difference from the Pincher, so the variant reads as a palette
  swap, which the brief asked to avoid. Bradle, the other variant in the
  family, works because its brain lobes give it a shape of its own.
- **Griffon (tile 92)** reads as a goose: a bird's head on a bird's body,
  with the gold chest reading as a saddle. The brief said winged lion.

## Pincher (tile 28), two frames

- Keep the lilac dome and the two eyes.
- Add two large front claws, crab-like, one each side of the body, each
  claw 8 to 10 px long and 6 px tall at the pincer. The claws are the
  widest part of the figure and the first thing read at half size.
- Frame 1: claws open, the two halves of each pincer apart. Frame 2: claws
  shut, raised 2 px. Legs may shift with them.
- Colours: lilac light `#f5edfd`, base `#d7c0f9`, shade `#c2a9f3`. Eyes
  gold `#d9b65a`. Claw tips in the shade tone so they read against the dome.

## Snatch (tile 90), two frames

- Same family silhouette as the Pincher: dome plus front claws, so a player
  reads it as Pincher kind. Then make it its own creature in shape, not only
  in colour.
- Spiked shell: four to six 2 px spikes along the top of the dome.
- Longer, thinner claws than the Pincher, 12 px, with a hooked tip.
- Frame 1: claws forward. Frame 2: claws pulled in toward the body, as if
  snatching. Spikes do not move.
- Colours: slate light `#7c7c8a`, base `#5c5b65`, shade `#44434c`. Eyes red
  `#ae4551` with a `#e77b81` glint pixel. Spikes in the light tone.

## Griffon (tile 92), two frames

- A winged lion. The body, hind legs and tail are a lion's; the head and
  forelegs are an eagle's; the wings are the Dragon family's, so it keeps
  the family silhouette (see Dragon, tile 29, and Wyvern, tile 93).
- Side view like the Dragon, facing left. Four legs on the ground: two
  eagle forelegs with talons, two lion hind legs. Tail out behind with a
  tuft.
- Head: eagle, with a 2 px hooked beak and one eye. No neck feathers wider
  than the head, so it does not read as a bird again.
- Frame 1: wings up. Frame 2: wings down, tail up.
- Colours: body, hind legs and tail in gold `#d9b65a` with tan shade
  `#dca576` and light `#fdd7a9`. Head, wings and forelegs in bone light
  `#f2f2f1`, base `#d8d8d7`, shade `#a9a7a7`. Beak and talons gold
  `#d9b65a`. Eye `#141416`.

## Checks before delivery

- [ ] 32 x 32, alpha 0 or 255, colours from the lists above only, on the
      2 px grid
- [ ] All three on baseline row 31, both frames same footprint
- [ ] Pincher and Snatch: claws visible at half size; the two are told apart
      by shape with the colour removed
- [ ] Griffon: reads as a four-legged beast at half size, not a bird
- [ ] Deliver as `pincher-0/1.png`, `snatch-0/1.png`, `griffon-0/1.png`, plus
      the full atlas with those six cells replaced and nothing else changed
