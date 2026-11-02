# Will this Tailwind colour fit the display?

You choose cyan-500. Tailwind writes it as oklch(71.5% 0.143 215.221): lightness, chroma and hue. Chroma measures how far the colour stands from grey. At this lightness and hue, cyan-500 asks for more chroma than an sRGB display can reproduce. The mapped sRGB colour is #00b8db, with chroma about 0.130. The requested colour and the displayed result are different. Is cyan the only family affected?

Compare the seventeen coloured families at shade 500. To judge each one, we need the sRGB limit at that colour's own lightness and hue. The radar gives each family a spoke; its outline marks the greatest chroma that still fits sRGB. The outline changes from spoke to spoke because a display's limit is not the same for every lightness and hue.

Overlay Tailwind's requested chroma. Fourteen of these seventeen colours extend beyond the sRGB outline. Red, fuchsia and pink fit. The overshoots look small in the raw chroma view: lime-500 extends furthest, about 0.024 past its edge. But a small distance can consume a large share of the range available at that hue.

Now measure each colour relative to its own edge. The sRGB edge becomes the 100% ring. Cyan reaches 113.1%, the largest relative overshoot, even though lime had the largest absolute one. Cyan's available range is smaller, so its smaller excess is larger as a proportion. Pink sits at 90.4%, leaving more room before its edge. These are two comparisons of the same colours: extra chroma in absolute units, and chroma relative to the display's limit.

Add Display P3, a wider colour range. Its edge lies beyond sRGB's on each of these spokes, and all seventeen shade-500 colours fit inside it. Amber comes closest to that edge, at 98.4% of the available chroma.

What happens outside the chosen display's range? The CSS Color 4 mapping used here reduces chroma, compares the trial colour with its clipped version, and returns an in-range result once their difference is small enough. Clipping can shift hue as well. On sRGB, yellow-500 loses the most chroma in this group. On Display P3, all seventeen already fit, so this mapping leaves them unchanged.

Changing the shade changes both the requested colours and their limits. Changing the screen changes which ending applies. A colour's name alone cannot tell you whether it fits: the answer depends on its lightness, chroma and hue together, and on the display range you ask it to fit.
