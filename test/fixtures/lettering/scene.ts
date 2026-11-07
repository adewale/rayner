// A fixture for lettering on request (test/lettering.test.ts): it asks for Greek and
// draws Greek letters in Inter (a card and free text) and in JetBrains Mono (code).
// Its cut faces are pinned beside it in scene.lettering.json.
import { Scene, Text } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { LetteringRequest } from '../../../src/index.ts';

const WORDS: Record<string, { word: string; meaning: string }> = {
  logos: { word: 'λόγος', meaning: 'word' },
  phos: { word: 'φῶς', meaning: 'light' },
};

export default class GreekLettering extends Scene {
  static meta = {
    id: 'lettering-greek',
    title: 'Greek letters on request',
    lettering: { scripts: ['Grek'] } satisfies LetteringRequest,
  };
  static settings = [
    {
      id: 'word',
      label: 'Word',
      default: 'logos',
      options: [
        { value: 'logos', label: 'logos' },
        { value: 'phos', label: 'phos' },
      ],
    },
  ];
  override async construct() {
    const { word, meaning } = WORDS[settingsOf(this)['word']!]!;
    const s = stage(this);
    await this.step('word', { title: 'A Greek word', caption: `The word ${word} means ${meaning}.` });
    await s.card(
      [
        ['Word', word],
        ['Meaning', meaning],
      ],
      { title: 'Αλφάβητο', at: [-3.6, 0.4] },
    );
    await this.step('code', { title: 'The same word in code', caption: 'Code keeps the Greek letters in the monospaced face.' });
    await s.code([`const word = '${word}';`, `const αβγ = word.length; // ${[...word].length}`], { title: 'greek.ts', at: [3.6, 0.4] });
    await s.enter(new Text('Ελληνικά', { fontSize: 0.5 }).moveTo([0, -3]));
  }
}
