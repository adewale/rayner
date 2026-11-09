// The script's answer and the answers to its reader questions, computed from the model: rayner check holds script.md's to these.
import { CHARS, SPACE, predicates, rewrite } from './model.ts';

const TF = (b: boolean) => (b ? 'True' : 'False');
const SPACED = rewrite([SPACE, '7']),
  FLOATS = { arabic: rewrite([CHARS.arabic, '.5']), super: rewrite(['2.', CHARS.super]) };

export const answer = () => `No: isdigit() is True for ${CHARS.super.char}, and int('${CHARS.super.char}') raises ValueError`;

export const questions = {
  1: () => ({
    question: `s is two characters: ${SPACE.code}, IDEOGRAPHIC SPACE, then an ASCII 7. Its line in UnicodeData.txt is ${SPACE.ucd}. Does the isdigit() guard let s through, and what would int(s) do?`,
    answer: `The guard turns s away: ${SPACE.code} has nothing in field 7, so s.isdigit() is ${TF(predicates(SPACE).isdigit)}. Yet int(s) returns 7. Its category Zs makes it whitespace to Python, so the rewrite turns it into a space, '${SPACED}', and int() ignores surrounding spaces. The isdigit() guard also refuses text that int() can parse.`,
  }),
  2: () => ({
    question: `float() runs the same rewrite as int() before it parses. What do float('${CHARS.arabic.char}.5') and float('2.${CHARS.super.char}') do?`,
    answer: `float('${CHARS.arabic.char}.5') returns 3.5: ${CHARS.arabic.char} has a decimal digit value, so the text becomes '${FLOATS.arabic}'. float('2.${CHARS.super.char}') raises ValueError: ${CHARS.super.char} has none, so the text becomes '${FLOATS.super}', for the same reason int('${CHARS.super.char}') fails.`,
  }),
};
