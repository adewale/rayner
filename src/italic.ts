import {Text} from './text.ts';
import type {TextOptions} from './text.ts';

/** Real italic, supplied by this text's shaping service or its scene's compatibility context. */
export class ItalicText extends Text {
  constructor(text: string, opts: TextOptions = {}) { super(text, {...opts, italic: true}); }
}
