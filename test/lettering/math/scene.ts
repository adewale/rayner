import {Scene,MathTex,Group,TransformMatchingShapes,TransformMatchingText} from 'rayner';
import {stage} from 'rayner/explain';
export default class Example extends Scene {
  static meta = {id: 'lettering-math', title: "Math", lettering: {math:true}};
  override async construct() {
    const s = stage(this, {heading: false});
    await this.step('example', {title: "Math", caption: "Math"});
    const half = new MathTex("\\frac{1}{2}+x^2", {color: s.palette.ink});
    await s.enter(half);
    await this.step('morph', {title: "A morph", caption: "The same glyphs, paired by shape, move to their new places."});
    const more = new MathTex("x^2+\\frac{1}{2}", {color: s.palette.ink});
    await this.play(new TransformMatchingShapes(half, more));
    s.keep(more, {describe: 'x squared plus one half.'});
    await this.step('grow', {title: "A new term", caption: "Each glyph keeps its place, and plus y squared grows in at the end."});
    const grown = new MathTex("x^2+\\frac{1}{2}+y^2", {color: s.palette.ink});
    await this.play(new TransformMatchingText(more, grown));
    s.keep(grown, {describe: 'x squared plus one half plus y squared.'});
    await this.step('forms', {title: "Display maths", caption: "Radicals, large operators with limits, an integral and a matrix."});
    await s.clear();
    const ink = {color: s.palette.ink, display: true, fontSize: 0.5};
    const forms = new Group(
      new MathTex("x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}", ink),
      new MathTex("\\sum_{i=1}^{n} i=\\frac{n(n+1)}{2}", ink),
      new MathTex("\\int_0^1 x^2\\,dx=\\frac{1}{3}", ink),
      new MathTex("\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\begin{pmatrix}x\\\\y\\end{pmatrix}", ink),
    ).arrange([0, -1], 0.45);
    await s.enter(forms, {describe: 'The quadratic formula, the sum of 1 to n, the integral of x squared from 0 to 1, and a 2 by 2 matrix times a vector.'});
  }
}
