// How an explainer's model was checked, as a reader reads it: a grade and the system it names, from
// the script's optional `- **Grounding:**` line. The page, `rayner describe` and the gallery show the
// same receipt; the script's Checked against line stays the full account, behind a disclosure.
import { primaryLanguage } from './words.ts';

/**
 * - `live`: the model's tests run the real system each time they run.
 * - `recorded`: the real system was run once and its answers are frozen; the tests compare with them.
 * - `read`: a specification or source was read and transcribed; nothing was run.
 * - `none`: nothing outside the model's own tests.
 */
export const GRADES = ['live', 'recorded', 'read', 'none'] as const;
export type Grade = (typeof GRADES)[number];
/** A grade, and for every grade but `none`, the system the model was checked against, with its version: `CPython 3.12's dict storage`. */
export interface Grounding { grade: Grade; subject?: string }

/** `live: CPython 3.12's dict storage` as a Grounding. Throws on a grade not in GRADES. */
export function parseGrounding(text: string, where = 'script.md'): Grounding {
  const m = /^(\w+)\s*(?::\s*(.*))?$/s.exec(text.trim());
  const grade = m?.[1]?.toLowerCase();
  if (!m || !(GRADES as readonly string[]).includes(grade!))
    throw new Error(`${where}: Grounding must start with one of ${GRADES.join(', ')}, then a colon and what was checked (- **Grounding:** recorded: Postgres 18.6, on 2026-10-25), not ${JSON.stringify(text)}`);
  const subject = m[2]?.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
  return { grade: grade as Grade, ...(subject ? { subject } : {}) };
}

interface Words {
  /** A grade's short name, for a gallery card or a list. */
  label: Record<Grade, string>;
  /** The one-sentence receipt under Sources. */
  sentence: (g: Grounding) => string;
  /** The disclosure that holds the script's full Checked against line. */
  details: string;
}
const WORDS: Record<string, Words> = {
  en: {
    label: { live: 'Run live', recorded: 'Recorded', read: 'Read, not run', none: 'Nothing external' },
    sentence: ({ grade, subject }) => {
      const what = subject ?? 'its source';
      switch (grade) {
        case 'live': return `Checked against ${what}, run again each time the model’s tests run.`;
        case 'recorded': return `Checked against ${what}: run once and recorded, and the model’s tests compare with that recording.`;
        case 'read': return `Checked against ${what}, read and not run.`;
        case 'none': return 'Not checked against an outside system: only the model’s own tests check it.';
      }
    },
    details: 'How it was checked',
  },
  fr: {
    label: { live: 'Exécuté', recorded: 'Enregistré', read: 'Lu, non exécuté', none: 'Rien d’extérieur' },
    sentence: ({ grade, subject }) => {
      const what = subject ?? 'sa source';
      switch (grade) {
        case 'live': return `Vérifié par ${what}, exécuté de nouveau à chaque passage des tests du modèle.`;
        case 'recorded': return `Vérifié par ${what} : exécuté une fois et enregistré ; les tests du modèle comparent avec cet enregistrement.`;
        case 'read': return `Vérifié par ${what}, lu et non exécuté.`;
        case 'none': return 'Vérifié par aucun système extérieur : seuls les tests du modèle le vérifient.';
      }
    },
    details: 'Comment il a été vérifié',
  },
};
const wordsIn = (lang: string): Words => WORDS[primaryLanguage(lang)] ?? WORDS.en!;

/** The receipt's one sentence, in the page's language (English when there are no words for it). */
export const groundingSentence = (g: Grounding, lang = 'en'): string => wordsIn(lang).sentence(g);
/** "Recorded: Postgres 18.6, on 2026-10-25", or the grade's name alone for `none` or no subject. */
export const groundingLabel = (g: Grounding, lang = 'en'): string =>
  g.grade !== 'none' && g.subject ? `${wordsIn(lang).label[g.grade]}: ${g.subject}` : wordsIn(lang).label[g.grade];
/** The name of the disclosure that holds the full Checked against line. */
export const groundingDetails = (lang = 'en'): string => wordsIn(lang).details;
