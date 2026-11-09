import {Scene,Text} from 'rayner';
import {stage} from 'rayner/explain';
export default class Example extends Scene {
  static meta = {id: 'lettering-hebrew', title: 'עברית', lettering: {scripts: ['Hebr']}};
  override async construct() {
    const s = stage(this);
    await this.step('vowels', {title: 'ניקוד', caption: 'שָׁלוֹם עוֹלָם: אותיות עם ניקוד, מימין לשמאל.'});
    await s.enter(new Text('שָׁלוֹם עוֹלָם', {color: s.look.ink, fontSize: 0.8}));
    await this.step('mixed', {title: 'כיוונים', caption: 'גרסה 2.0 של הכלי יצאה ב־2026. כיוון השורה נקבע לפי האות החזקה הראשונה בפסקה, גם Rayner (בטא) בשורה הבאה, שמתחילה באותיות לטיניות.'});
    await s.clear();
    await s.enter(
      new Text('גרסה 2.0 של Rayner (בטא)', {color: s.look.ink, fontSize: 0.6}).moveTo([0, 0.8]),
      new Text('Rayner גרסה 2.0', {color: s.look.ink, fontSize: 0.6}).moveTo([0, -0.4]),
    );
  }
}
