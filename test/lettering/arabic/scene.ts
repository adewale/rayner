import {Scene,Text} from 'rayner';
import {stage} from 'rayner/explain';
export default class Example extends Scene {
  static meta = {id: 'lettering-arabic', title: "Arabic", lettering: {scripts:['Arab']}};
  override async construct() {
    const s = stage(this, {heading: false});
    await this.step('example', {title: "Arabic", caption: "Arabic"});
    await s.enter(new Text("السَّلَامُ عَلَيْكُمْ", {color: s.look.ink}));
  }
}
