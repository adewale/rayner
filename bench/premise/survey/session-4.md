Session 4 (`session_01N4DAa6FyC1bbvjTw14x5MQ`, model `claude-opus-5-5`, no repository). Questions: pg-page, unified-diff, poppy-sign-in, melody-rhythm, tailwind-gamut, quotient-familial. The session's final message, verbatim:

1. **Postgres pads every row to a multiple of 8 bytes, so the 4 bytes you save often turn into padding.** Each heap row starts with a 23-byte header, which is padded to 24. The row as a whole is then rounded up to a multiple of 8 (MAXALIGN on 64-bit builds).
   - A row holding one int4 is 24 + 4 = 28 bytes, rounded up to 32.
   - A row holding one int8 is 24 + 8 = 32 bytes.

   Both are 32 bytes. Each row also gets a 4-byte line pointer in the page, so about 226 rows fit on an 8 KB page either way. Padding also appears inside the row, because an int8 must start on an 8-byte boundary. Putting the 8-byte columns first and the smaller ones after them can save space. I'm highly confident about this.

2. **A patch finds its place by matching the unchanged context lines around each change, not by trusting the line numbers.** `@@ -2,3 +2,4 @@` means "in the old file, 3 lines starting at line 2; in the new file, 4 lines starting at line 2". Those numbers are only where the tool looks first. If the context lines don't match there, it searches up and down for where they do. GNU patch then reports something like "Hunk #1 succeeded at 15 (offset 13 lines)". GNU patch can also apply "fuzz": it ignores up to 2 outer context lines if they don't match. `git apply` accepts an offset but uses no fuzz by default. "Patch does not apply" means the context lines, or the lines being removed, were themselves edited, so there is nowhere left to match. I'm highly confident about this.

3. **The agent gets a token, not your password.** You sign in directly with the service. The service then gives the agent an access token that is limited in scope, expires, and can be revoked. You can cut off the agent without changing your password. I don't know section 4 of the Personal Agent Protocol specifically, so this part is a guess with low confidence. Specs like it usually change OAuth for agents in three ways:
   - The token is tied to the agent's Session. Only the holder of that seal can use the key, so a stolen token is useless on its own. This is similar to DPoP.
   - Scopes are narrower and short-lived.
   - The agent uses a flow that suits software with no browser of its own, such as PKCE or a device-code flow.

   Check that section for the exact mechanism.

4. **The notes that should feel strong don't start on the beat lines.** On the piano roll, the beats are evenly spaced vertical lines. In the version that feels right, the important notes (the long ones and the ones that start phrases) begin on those lines. In the off version, three things are worth checking:
   - **Is the whole tune shifted?** Often everything has moved a little earlier or later, or the tune starts at the wrong point. Then strong notes land between beats and weak notes land on them.
   - **Is the spacing uneven?** Look for notes that drift slightly ahead of or behind the lines.
   - **Is it deliberate?** Notes placed between beats on purpose are called syncopation, and that can sound good. Accidental misplacement just sounds wrong.

   Compare where the notes start against the lines, not how high or low they are. I'm fairly confident about this.

5. **Maybe not exactly.** In oklch, chroma means how colourful (saturated) a colour is.
   - **Standard (sRGB) screens:** they can't show very high chroma, especially for vivid greens, cyans and magentas. Tailwind 4's palette was designed for wider-gamut (Display-P3) screens, which recent Macs and phones have. Some of its colours, mostly the vivid mid shades around 400–600, are outside sRGB. On a standard screen the browser pulls them back into range. In practice it mostly clips them, so they look a little duller or shift slightly, though they still look close.
   - **Pale and very dark shades** (like 50–200 or 900–950) have low chroma and fit almost everywhere.
   - **To check a colour:** paste its oklch value into a tool like oklch.com, which shows whether it fits in sRGB and in P3.
   - **To target P3 screens in CSS:** use `@media (color-gamut: p3)`.

   I'm moderately to highly confident about this.

6. **Le quotient familial fait baisser l'impôt parce que le barème est progressif.** Le fisc divise votre revenu imposable par le nombre de parts. Il applique le barème à ce revenu par part, puis multiplie l'impôt obtenu par le nombre de parts. Un revenu par part plus petit est taxé dans des tranches plus basses, donc le total baisse.
   - **Le couple :** un couple marié ou pacsé a 2 parts. Prenons un couple où un seul conjoint gagne 60 000 €. Il est imposé comme deux personnes à 30 000 €, ce qui coûte nettement moins qu'un célibataire à 60 000 €. Si les deux conjoints gagnent autant, le couple ne gagne presque rien.
   - **Les enfants :** chacun des deux premiers ajoute une demi-part, puis chaque enfant à partir du troisième ajoute une part entière.
   - **Le plafond :** l'avantage de ces demi-parts est plafonné, à environ 1 750–1 800 € par demi-part selon l'année. Je suis assez sûr du mécanisme, moins du chiffre exact du plafond.
