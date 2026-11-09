import {Scene,Text} from 'rayner';
import {stage} from 'rayner/explain';
export default class Example extends Scene {
  static meta = {id: 'lettering-style', title: "Serif", lettering: {faces:{sans:'eb-garamond'}}};
  override async construct() {
    const s = stage(this, {heading: false});
    await this.step('example', {title: "Serif", caption: "Serif"});
    await s.show({source: 'graph LR\nA[Ink] --> B[Paper]', style: 'pen-and-ink'}, {box: 'top'});
    await s.enter(new Text("Ink on paper", {color: s.look.ink}).moveTo([0, -2]));
  }
}
