import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Line, Rectangle, Scene, toSvgString} from '../../../src/index.ts';
import {renderAsync} from '@resvg/resvg-js';
import type {Box, Vec} from '../../../src/index.ts';
import {fc, params} from './pbt.ts';
import {clearRoute} from './clear-route.ts';

test('constructed routes keep the complete carrier clear and preserve their declared ports', () => {
  fc.assert(fc.property(fc.array(fc.record({x:fc.integer({min:-40,max:40}), y:fc.integer({min:-20,max:20}), w:fc.integer({min:2,max:12}), h:fc.integer({min:2,max:12})}), {maxLength:8}), shapes => {
    const carrier = new Rectangle({width:0.4,height:0.3,stroke:'none'});
    const subjects = shapes.map(s => new Rectangle({width:s.w/10,height:s.h/10,stroke:'none'}).moveTo([s.x/10,s.y/10]));
    const start: Vec = [-6,0], end: Vec = [6,0], frame: Box = [-8,-4.5,8,4.5];
    const path = clearRoute(start,end,carrier,subjects,frame);
    assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);
    for (let n=1;n<path.length;n++) {
      const a=path[n-1]!,b=path[n]!;
      assert.ok(a[0]===b[0]||a[1]===b[1]);
      // Sample the independent swept footprint rather than the planner's grid.
      for (let j=0;j<=50;j++) {
        const x=a[0]+(b[0]-a[0])*j/50,y=a[1]+(b[1]-a[1])*j/50;
        assert.ok(x-0.2>=frame[0]&&x+0.2<=frame[2]&&y-0.15>=frame[1]&&y+0.15<=frame[3]);
        for(const subject of subjects) {const s=subject.box()!;
          assert.ok(x+0.2<=s[0]||x-0.2>=s[2]||y+0.15<=s[1]||y-0.15>=s[3]);}
      }
    }
  }),params(100));
});

test('a sealed corridor and an obstructed port refuse instead of constructing unsafe motion', () => {
  const carrier = new Rectangle({width:1,height:1,stroke:'none'}), frame:Box=[-4,-3,4,3];
  const wall = new Rectangle({width:1,height:6,stroke:'none'});
  assert.throws(()=>clearRoute([-2,0],[2,0],carrier,[wall],frame),/No route/);
  assert.throws(()=>clearRoute([0,0],[2,0],carrier,[wall],frame),/declared route port/);
  assert.throws(()=>clearRoute([-4,0],[2,0],carrier,[],frame),/declared route port/);
  assert.throws(()=>clearRoute([-2,0],[2,0],carrier,[],[-Infinity,-3,4,3]),/finite/);
  assert.throws(()=>clearRoute([NaN,0],[2,0],carrier,[],frame),/finite/);
});

test('diagonal square caps and default stroke opacity reserve the ink that native SVG paints', async () => {
  for (const strokeOpacity of [1, undefined]) {
    const carrier = new Line([-.1,-.1],[.1,.1],{stroke:'#ff0000',strokeWidth:1,lineCap:'square',lineJoin:'round',strokeOpacity});
    const subject = new Rectangle({width:.4,height:.4,fill:'#0000ff',stroke:'none'});
    const path = clearRoute([-2,0],[2,0],carrier,[subject],[-8,-4.5,8,4.5]);
    const bend = path.find(point=>point[1]!==0);assert.ok(bend);
    const scene = new Scene({async frame(){}});scene.add(subject);
    const paint = () => renderAsync(toSvgString(scene,{width:800}),{font:{loadSystemFonts:false}});
    const before = (await paint()).pixels;
    scene.add(carrier.moveTo([0,bend[1]]));const after=(await paint()).pixels;
    let ink=0;
    for(let n=0;n<before.length;n+=4) if(before[n]===0&&before[n+1]===0&&before[n+2]===255) {
      ink++;assert.deepEqual(after.subarray(n,n+4),before.subarray(n,n+4));
    }
    assert.ok(ink>300,'the protected square really paints');
  }
});
