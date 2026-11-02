import {Text} from './text.ts';
import type {TextOpts} from './text.ts';

/** Real italic, supplied by this text's shaping service or its scene's compatibility context. */
export class ItalicText extends Text {
  constructor(text: string, opts: TextOpts = {}) { super(text, {...opts, italic: true}); }
}
