# Fonts

`IMFeENrm28P.ttf`: IM FELL English Roman, Igino Marini's revival of the
Fell types, under the SIL Open Font License 1.1 (`OFL-imfellenglish.txt`).
The Ultima V port sets its dateline in it, and so does the key art here:
"1983 ~ 2026" (`tools/key-art.mjs`). It is used only to make that art; the
game does not load it.

`Sixtyfour.ttf`: Sixtyfour, Jens Kutilek's face after the Commodore 64's
letters (The Sixtyfour Project Authors), under the SIL Open Font License
1.1 (`OFL-sixtyfour.txt`). The Ultima V port letters its Standard look in
it. Here it is baked into `public/graphics/Standard-Font.png`, the
Standard tile set's letters (`tools/font-sheet.ts`); the game loads that
sheet, not the font.

`AtkinsonHyperlegibleMono.ttf`: Atkinson Hyperlegible Mono, the Braille
Institute of America's, under the SIL Open Font License 1.1
(`OFL-atkinsonhyperlegiblemono.txt`). `OpenDyslexicMono-Regular.otf`:
OpenDyslexic Mono, Abbie Gonzalez's (`LICENSE-opendyslexicmono.txt`). They
are the Font setting's Legible and Dyslexic, as in the Ultima V port, baked
into `public/fonts/Legible.png` and `public/fonts/Dyslexic.png`
(`tools/reading-fonts.ts`, `npm run reading-fonts`); the game loads those
sheets, not the fonts.
