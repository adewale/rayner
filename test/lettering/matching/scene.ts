import {Scene,Text,TransformMatchingText} from 'rayner';
import {stage} from 'rayner/explain';
export default class Example extends Scene {
  static meta = {id: 'lettering-matching', title: 'Clusters', lettering: {scripts: ['Deva', 'Arab']}};
  override async construct() {
    const s = stage(this, {heading: false});
    await this.step('grow', {title: 'Grow', caption: 'नम gains स्ते: the clusters it had stay put.'});
    const a = new Text('नम', {color: s.look.ink, fontSize: 0.9});
    await s.enter(a);
    await this.play(new TransformMatchingText(a, new Text('नमस्ते', {color: s.look.ink, fontSize: 0.9})));
    await this.step('conjunct', {title: 'Conjunct', caption: 'क becomes the conjunct क्ष, so it fades.'});
    await s.clear();
    const b = new Text('क', {color: s.look.ink, fontSize: 0.9});
    await s.enter(b);
    await this.play(new TransformMatchingText(b, new Text('क्ष', {color: s.look.ink, fontSize: 0.9})));
    await this.step('joining', {title: 'Joining', caption: 'سلم gains an alef: its letters change shape and keep their places.'});
    await s.clear();
    const c = new Text('سلم', {color: s.look.ink, fontSize: 0.9});
    await s.enter(c);
    await this.play(new TransformMatchingText(c, new Text('سلام', {color: s.look.ink, fontSize: 0.9})));
  }
}
