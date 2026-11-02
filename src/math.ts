import {Text} from './text.ts';
import type {TextOpts} from './text.ts';

/** TeX-subset maths from a retained shaping service. No browser typesetter. */
export class MathTex extends Text {
  readonly display: boolean;
  constructor(latex: string, {display = false, ...opts}: TextOpts & {display?: boolean} = {}) {
    super(latex, opts, {display});
    this.display = display;
  }
}
