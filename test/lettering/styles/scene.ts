import {Scene,Text,ItalicText,DecimalNumber,Transform} from 'rayner';
import {stage} from 'rayner/explain';
export default class Example extends Scene {
  static meta = {id: 'lettering-styles', title: 'Bold and italic', lettering: {styles: ['bold', 'italic'], scripts: ['Arab']}};
  override async construct() {
    const s = stage(this);
    await this.step('cuts', {title: 'Real cuts', caption: 'Bold, italic and bold italic, each from its own cut.'});
    const ink = {color: s.look.ink, fontSize: 0.6};
    await s.enter(
      new Text('Regular', ink).moveTo([-3.5, 1.8]),
      new Text('Bold', {...ink, weight: 'bold'}).moveTo([-3.5, 0.8]),
      new ItalicText('Italic', ink).moveTo([-3.5, -0.2]),
      new ItalicText('Bold italic', {...ink, weight: 'bold'}).moveTo([-3.5, -1.2]),
      new Text('const x = 1;', {...ink, font: 'mono', weight: 'bold'}).moveTo([-3.5, -2.2]),
      new Text('مرحبا', {...ink, weight: 'bold'}).moveTo([3.5, 0.8]),
      new ItalicText('مرحبا', ink).moveTo([3.5, -0.2]),
    );
    await this.step('count', {title: 'A bold count', caption: 'A bold number counts up in the Bold cut.'});
    await s.clear();
    const n = new DecimalNumber(0, {color: s.look.ink, fontSize: 1, weight: 'bold', decimals: 1});
    await s.enter(n);
    await this.play(new Transform(n, new DecimalNumber(9.5, {color: s.look.ink, fontSize: 1, weight: 'bold', decimals: 1})), {runTime: 1});
  }
}
