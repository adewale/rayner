# Will this Tailwind colour fit the display?

- **Reader:** a front-end developer who uses Tailwind's colour names and has seen that Tailwind 4 writes them in oklch(), without knowing what chroma is or what a display's gamut does to it.
- **Answer:** Most of these colours lie outside sRGB, so an sRGB screen shows them less vivid than written
- **Changed condition:** the shade (300, 500 or 700) and the screen (sRGB or Display P3). The shade changes the requested colours and their limits, since the edge moves with lightness, so which colours overshoot and which goes furthest change; the screen decides the ending: on sRGB the overshooting colours are mapped down to the edge, on Display P3 every colour shows as written.
- **Reader's own work:** predict whether the other shades fit after seeing the opening colour, and which colour goes furthest as a share of its own edge before the share view answers; choose the shade and the screen; answer the check questions.
- **Checked against:** Color.js 0.7.1. `model.test.ts` compares the model's in-gamut answers, sRGB and Display P3 edges and CSS gamut-mapped colours for every vendored colour with Color.js 0.7.1's, captured for the colours parsed from npm tailwindcss@4.3.3's theme.css, which the vendored lines match; `answers.ts` computes the check answers from the model. The conversion matrices are copied from CSS Color 4's sample code.
- **Leaves out:** the grey families and the other shades; what a particular browser, calibration, colour management or physical screen produces, since the numbers are the colour a correct implementation of the pinned CSS mapping (binary search with local MINDE) would choose; the other mapping methods CSS Color 4 allows.

## Check yourself

1. An sRGB screen paints cyan-500 with chroma 0.130. Suppose you write that chroma yourself, at cyan-500’s own lightness and hue: oklch(71.5% 0.130 215.221). Does it fit sRGB?
   No. The sRGB edge at that lightness and hue is 0.126, below 0.130. The mapped colour fits because the final clip also moved it, to lightness 72.2% and hue 217.7°, where the edge is higher. Whether a chroma fits depends on the lightness and hue it comes with.
2. In raw chroma, lime-500 is the 500 colour furthest past the sRGB edge. Why does the share view put cyan-500 first instead?
   The edge sits at a different chroma on every spoke. lime-500 overshoots by 0.024 on an edge at 0.209; cyan’s edge is 0.126, so its smaller overshoot is a larger share of it.
3. pink-500 has the most room of the 500 shades, at 90.4% of its sRGB edge. Does that make pink-700 safe on an sRGB screen?
   No: pink-700 asks for 105.6% of its edge, so an sRGB screen maps it. The darker shade has its own lightness and chroma, and the edge moves with lightness, so a family’s name says nothing about whether it fits.

## Why this explainer

Tailwind 4 moved its palette to oklch "to make the colors more vivid", and most readers will never notice that many of those colours cannot be shown on the sRGB screens most people use. The opening makes that concrete with one colour: the swatch as written is empty, because this page has no paint for it, beside the duller colour an sRGB screen actually paints.

The radar gives each family its own spoke because a display's limit depends on lightness and hue together; there is no single chroma cutoff. The raw and relative views answer different questions, and the palette step asks which colour goes furthest as a share of its own edge before the share step answers. At shade 500 the raw leader (lime) and the share leader (cyan) differ, which is what makes the question worth asking and the share view worth having. Display P3 then shows that the colours were written for a wider gamut, and the screen setting picks which ending the reader sees. The opening always compares against sRGB, even when the chosen ending is Display P3.

The check answers quote model values for shade 500; a guard in `scene.ts` fails the scene if the model stops giving them.
