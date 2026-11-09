import {Scene,Text} from 'rayner';
import {stage} from 'rayner/explain';
export default class Example extends Scene {
  static meta = {id: 'lettering-devanagari', title: "Devanagari", lettering: {scripts:['Deva']}};
  override async construct() {
    const s = stage(this, {heading: false});
    await this.step('example', {title: "Devanagari", caption: "Devanagari"});
    await s.enter(new Text("नमस्ते दुनिया", {color: s.look.ink}));
  }
}
