import { Group } from '../../../../src/index.ts';
import { CHARS, guarded, intOf } from '../isdigit.ts';
import type { CharId, Predicate } from '../isdigit.ts';
import { tile, label, flow, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(char: CharId, predicate: Predicate): ReaderFrame[] {
  const c = CHARS[char],
    selected = guarded(c, predicate),
    parsed = intOf(c),
    safe = guarded(c, 'isdecimal');
  const outcome = (g: ReturnType<typeof guarded>) =>
    g.outcome === 'parsed' ? 'integer' : g.outcome === 'raised' ? 'ValueError' : 'refused';
  return [
    {
      id: 'reader-predict',
      title: 'Will a passing digit check make int safe?',
      line: `Selected character: ${c.char}; guard: ${predicate}.`,
      caption: `For the character ${c.char}, predict two answers: does ${predicate} pass, and can int parse it? Unicode numeric properties and the parser accept different character sets.`,
      values: { char, predicate },
      draw: (s) =>
        new Group(tile(c.char, 0, 1, 4, 2, s, { size: 1.3 }), label(`${predicate} → int`, 0, -1.8, s.palette.ink, 0.9)),
    },
    {
      id: 'reader-result',
      title: 'Does the parser accept what the guard accepts?',
      line: 'Compare both guards on the same character.',
      caption: `${predicate} ${selected.passes ? 'passes' : 'rejects'} ${c.char}. ${'value' in parsed ? `Parsing the character directly returns ${parsed.value}` : 'Parsing the character directly raises ValueError'}. For a single Unicode decimal digit, isdecimal matches int’s accepted character set. Longer strings still need parsing because signs, whitespace and invalid structure affect the result.`,
      values: { char, predicate, selected, safe },
      draw: (s) =>
        table(
          ['Guard', 'Passes?', 'Then int'],
          [
            [predicate, selected.passes ? 'True' : 'False', outcome(selected)],
            ['isdecimal', safe.passes ? 'True' : 'False', outcome(safe)],
          ],
          s,
          { xs: [-4.8, 0, 5], y: 2, gap: 1.7 },
        ),
    },
  ];
}
