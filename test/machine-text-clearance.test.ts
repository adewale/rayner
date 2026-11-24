import assert from 'node:assert/strict';
import test from 'node:test';
import { Circle, Group, Rectangle, Scene, Succession, Text, keyed, toSvgString } from '../src/index.ts';
import { Machine, view } from '../explain/index.ts';
import { pass } from '../explain/drawing.ts';
import { MachineMotionCheck } from '../tools/lib/explain-motion-rules.ts';
import { rasterize } from '../tools/lib/explain-raster.ts';
import { observationOf } from '../tools/repo/motion-corpus-lib.ts';

test('authored text clearance protects native glyph cores against narrow filled and stroked travellers without widening generic coverage rules', async () => {
  const trials = ['blade', 'stroke', 'hollow', 'filled', 'clipped', 'underlay', 'near-miss', 'faint', 'alpha',
    'merged-glyph', 'other-glyph', 'shifted-camera', 'letterbox', 'handoff'] as const;
  for (const trial of trials) {
    const reject = ['blade', 'stroke', 'filled', 'alpha', 'merged-glyph', 'shifted-camera', 'letterbox'].includes(trial);
    class Clearance extends Scene {
      override state = {n: 0};
      override async construct() {
        if (trial === 'shifted-camera') this.frame.scale(0.73).shift([0.0193, 0.0287]);
        if (trial === 'letterbox') this.frame.setWidth(12, true).shift([0.0193, 0.0287]);
        const picture = view(this, () => {
          const text = new Text(trial.includes('glyph') ? 'III' : 'I', {fontSize: 0.7, color: '#f00'});
          const subject = trial.includes('glyph') ? text.children[0]! : text;
          keyed(subject, 'reading');
          return new Group(text, keyed(new Text('dock', {fontSize: 0.4}).moveTo([2, 0]), 'attachment'));
        }, {place: false});
        const machine = new Machine(this, {
          start: this.state, events: ['send'], next: () => ({n: 1}), views: [picture], runTime: 0.9,
          motion: () => [{view: picture, during: 'traveller', clearText: ['reading']}],
          transition: {send: t => {
            const c = t.choreograph(picture);
            const round = ['hollow', 'filled'].includes(trial);
            const token = round ? new Circle({radius: 1.0, fill: trial === 'filled' ? '#000' : 'none', stroke: '#000', strokeWidth: 0.04})
              : new Rectangle({width: trial === 'stroke' ? 0.1 : 0.04, height: 1, fill: trial === 'stroke' ? 'none' : '#000', stroke: trial === 'stroke' ? '#000' : 'none', strokeWidth: 0.04});
            if (trial === 'faint' || trial === 'alpha') token.setOpacity(trial === 'faint' ? 0.03 : 0.5);
            if (trial === 'clipped') token.clipBox = [-2, 0.8, 2, 1.2];
            const subject = c.from('reading'), at = subject.center();
            const y = trial === 'near-miss' ? subject.box()![3] + token.height() / 2 + 0.02 : at[1];
            const start = trial === 'other-glyph' ? 0.15 : round ? -0.1 : -0.6;
            const end = trial === 'handoff' ? 2 : trial === 'other-glyph' ? 0.3 : round ? 0.1 : 0.6;
            return new Succession([...pass(c, 'traveller', token, [[trial === 'handoff' ? 0.5 : start, y], [end, y]], {appear: 0.1, move: 0.5, leave: 0.1}), c.rest({runTime: 0.1})]);
          }},
        });
        this.add(picture);
        await this.play(machine.send('send'));
      }
    }
    const check = new MachineMotionCheck();
    let witness: {actual: string; noText: string; noActor: string; neither: string} | undefined;
    let nearest = Infinity;
    const scene = new Clearance({async frame(s) {
      const actor = s.find('traveller');
      if (actor && trial === 'underlay') {
        const parent = actor.parent!, rest = parent.children.filter(m => m !== actor);
        parent.remove(...parent.children).add(actor, ...rest);
      }
      await check.frame(s);
      if (!actor || s.time < 0.12 || s.time > 0.58) return;
      const text = s.find('reading')!;
      // Select an ordinary-colour witness independently of the checker's result.
      // A stroke-only rectangle is aligned by its edge; filled blades by centre.
      const distance = Math.abs(actor.center()[0] - text.center()[0] - (trial === 'stroke' ? actor.width() / 2 : 0));
      if (distance >= nearest) return;
      nearest = distance;
      const actual = toSvgString(s, {width: 800});
      const ta = text.style.opacity, aa = actor.style.opacity;
      text.setOpacity(0); const noText = toSvgString(s, {width: 800});
      actor.setOpacity(0); const neither = toSvgString(s, {width: 800});
      text.setOpacity(ta); const noActor = toSvgString(s, {width: 800});
      actor.setOpacity(aa);
      witness = {actual, noText, noActor, neither};
    }});
    await check.during(scene, () => scene.run());
    const collisions = check.findings.filter(f => f.includes('must remain clear'));
    assert.equal(collisions.length, reject ? 1 : 0, `${trial}: ${check.findings.join('\n')}`);
    assert.ok(witness, trial);
    // Independent ordinary-colour full-stage knockouts, without the checker's crop
    // or matte serializer: the protected text really contributes native paint.
    const images = await Promise.all(Object.values(witness).map(rasterize));
    const [actual, noText, noActor, neither] = images.map(image => image.pixels);
    assert.ok(noActor!.some((v, i) => v !== neither![i]), `${trial}: unblocked text paints`);
    if (trial !== 'filled') assert.ok(actual!.some((v, i) => v !== noText![i]), `${trial}: presence alone still holds`);
    let lost = 0;
    for (let i = 0; i < actual!.length; i += 4) {
      const available = Math.max(...[0, 1, 2].map(c => Math.abs(noActor![i+c]! - neither![i+c]!)));
      // The independently authored red glyph's opaque core is invariant to an
      // underlay changing its background contrast. Antialias edges are not used
      // by this ordinary-colour oracle; the subject knockout retains ownership.
      const core = noActor![i]! >= 250 && noActor![i+1]! <= 5 && noActor![i+2]! <= 5 && available >= 128;
      if (core && noActor![i]! - actual![i]! >= 32) lost++;
    }
    assert.equal(lost > 0, reject, `${trial}: full-stage ordinary-colour glyph contribution vs traveller knockout (${lost} core pixels lost)`);
    if (reject) {
      const o = observationOf({scenario: '{}', line: collisions[0]!});
      assert.ok(o?.type === 'finding');
      assert.equal(o.requirement, 'clear'); assert.equal(o.path, 'traveller');
      assert.equal(o.victim, 'reading'); assert.deepEqual(o.masks, ['traveller']);
    }
  }
});

test('clearance includes painted glyph stroke and requires glyph-owned contribution inside a decorated group', async () => {
  for (const trial of ['stroke', 'stroke-near-miss', 'clear', 'hidden', 'clipped', 'covered', 'same-background', 'faint', 'conflict'] as const) {
    class Reading extends Scene {
      override state = {n: 0};
      override async construct() {
        const picture = view(this, () => {
          const text = new Text('I', {fontSize: 0.8, color: trial === 'same-background' ? this.colors.paper : '#f00'});
          const glyph = text.children[0]!;
          if (trial.startsWith('stroke')) glyph.setStyle({stroke:'#f00',strokeWidth:0.35});
          if (trial === 'hidden') glyph.setOpacity(0);
          if (trial === 'faint') glyph.setOpacity(0.03);
          if (trial === 'clipped') glyph.clipBox = [2,2,3,3];
          const cover = trial === 'covered' ? [new Rectangle({width:1,height:1,fill:'#000',stroke:'none'})] : [];
          return new Group(keyed(new Group(text,...cover,new Rectangle({width:0.08,height:0.08,fill:'#00f',stroke:'none'}).moveTo([-1,1])), 'reading'));
        }, {place:false});
        const machine = new Machine(this,{start:this.state,events:['send'],next:()=>({n:1}),views:[picture],runTime:0.9,
          motion:()=>[{view:picture,during:'traveller',clearText:['reading'],...(trial==='conflict'?{absent:['reading']}:{})}],
          transition:{send:t=>{
            const c=t.choreograph(picture), glyph=c.from('reading').family().find(m=>m instanceof Text)!.children[0]!, box=glyph.box()!;
            const x=trial==='stroke'?box[2]+0.07:trial==='stroke-near-miss'?box[2]+0.175+0.0275+0.04:2;
            return new Succession([...pass(c,'traveller',new Rectangle({width:0.055,height:0.15,fill:'#000',stroke:'none'}),[[x,-0.2],[x,0.2]],{appear:0.1,move:0.5,leave:0.1}),c.rest({runTime:0.1})]);
          }}});
        this.add(picture); await this.play(machine.send('send'));
      }
    }
    const check=new MachineMotionCheck(); let witness: {actual:string;free:string;noGlyph:string}|undefined;
    const scene=new Reading({async frame(s){
      await check.frame(s);
      if(witness||s.time<0.32||!s.find('traveller')) return;
      const actor=s.find('traveller')!, glyph=s.find('reading')!.family().find(m=>m instanceof Text)!.children[0]!;
      const actual=toSvgString(s,{width:800}), aa=actor.style.opacity, ga=glyph.style.opacity;
      actor.setOpacity(0); const free=toSvgString(s,{width:800}); actor.setOpacity(aa);
      glyph.setOpacity(0); const noGlyph=toSvgString(s,{width:800}); glyph.setOpacity(ga);
      witness={actual,free,noGlyph};
    }});
    if(trial==='conflict') {await assert.rejects(check.during(scene,()=>scene.run()), /distinct, nonempty subject keys/);continue;}
    await check.during(scene,()=>scene.run()); assert.ok(witness);
    const images=await Promise.all([witness.actual,witness.free,witness.noGlyph].map(rasterize));
    const [actual,free,noGlyph]=images.map(i=>i.pixels);
    const missing=['hidden','clipped','covered','same-background'].includes(trial);
    assert.equal(actual!.some((v,i)=>v!==noGlyph![i]),!missing,`${trial}: exact grouped glyph omission excludes blue sibling ink`);
    let lost=0; for(let i=0;i<actual!.length;i+=4) if(free![i]!>248&&free![i+1]!<10&&free![i+2]!<10&&free![i]!-actual![i]!>=32) lost++;
    assert.equal(lost>0,trial==='stroke',`${trial}: actual opaque painted red stroke (${lost} pixels)`);
    if(trial==='stroke') assert.ok(check.findings.some(f=>f.includes('must remain clear')),check.findings.join('\n'));
    else if(missing) assert.ok(check.findings.some(f=>f.includes('must be present')),trial);
    else assert.deepEqual(check.findings,[],trial);
  }
});
