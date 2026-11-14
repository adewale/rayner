// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { listed } from '../lib/format.ts';
import { apart, clusters, lengths, utf8, word } from './model.ts';

/** The Arabic word's three lengths, and how many of its code points are marks. */
export const SALAM = apart(word('salam').text);
/** The characters of नमस्ते that fit whole in ten bytes of UTF-8, and what the next one needs. */
export const FIT = (() => {
  const groups = clusters(word('namaste').text), limit = 10;
  let used = 0, fit = 0;
  while (fit < groups.length && used + groups[fit]!.flatMap(utf8).length <= limit) used += groups[fit++]!.flatMap(utf8).length;
  const next = groups[fit]!;
  return { limit, fit, used, read: groups.slice(0, fit).map((g) => g.map((cp) => String.fromCodePoint(cp)).join('')), next: next.map((cp) => String.fromCodePoint(cp)).join(''), nextPoints: next.length, nextBytes: next.flatMap(utf8).length };
})();
/** hello's three lengths. */
export const HELLO = lengths(word('hello').text);

const number = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n);

export const questions = {
  1: () =>
    `${SALAM.bytes} bytes, ${SALAM.points} code points and ${SALAM.characters} characters. Each of the ${number(SALAM.parts.filter((p) => p.kind === 'mark').length)} vowel marks is a code point of its own that rides on the letter before it, and every code point of this word takes ${number(SALAM.bytes / SALAM.points)} bytes in UTF-8.`,
  2: () =>
    `${number(FIT.fit).replace(/^./, (c) => c.toUpperCase())}: ${listed(FIT.read)}, ${FIT.used} bytes. The third character, ${FIT.next}, is ${number(FIT.nextPoints)} code points and needs ${FIT.nextBytes} bytes, more than the ${FIT.limit - FIT.used} left. Cutting at byte ${FIT.limit} would also split a code point, since each takes three bytes.`,
  3: () =>
    `Its ${number(HELLO.points)} letters are ${number(HELLO.points)} code points below U+0080, which UTF-8 writes as one byte each, and none of them is a mark or a joiner. So all three counts are ${HELLO.bytes === HELLO.points && HELLO.points === HELLO.characters ? HELLO.bytes : 'different'}, and code that confuses them passes every test written in English.`,
};
