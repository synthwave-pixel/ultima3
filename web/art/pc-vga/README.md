# PC VGA

`LairWare-Tiles.png` is the PC VGA sheet as the port first had it:
LairWare's `PC VGA-Tiles.gif`, its alpha from the mask, the
Devil's colours fixed. Its colours are eight only (every channel full on or
off), so `tools/pc-vga-sheet.ts` takes from it no more than the layout and
the few cells the PC never drew (the door, Exodus's light panels), and
draws the rest - `public/graphics/PC VGA-Tiles.png` - from the Ultima III
Upgrade's VGA tile set: `SHAPES.VGA` and `U3VGA.PAL` from
[u3upgrade-3.3.zip](https://ultima3.ultimacodex.com/ultima-3-upgrade/) by
Voyager Dragon (The Exodus Project). Unpack the zip and run, in `web/`:

    node tools/pc-vga-sheet.ts <the unpacked folder>
