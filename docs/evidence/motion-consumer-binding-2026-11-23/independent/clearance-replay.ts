import {writeFile} from 'node:fs/promises';
import {Rectangle, Group, Scene, Succession, Text, keyed, toSvgString} from '../../../src/index.ts';
import {Machine,view} from '../../../explain/index.ts';
import {pass} from '../../../explain/drawing.ts';
import {MachineMotionCheck} from '../../../tools/lib/explain-motion-rules.ts';
import {rasterize} from '../../../tools/lib/explain-raster.ts';
const results = [];
for (const trial of ['outside-fill-box','ordinary-fill-cross','ink-absent-with-decoration','contradictory-keys']) {
 let witness: {actual:string; free:string} | undefined;
 let distance=Infinity; let geometry;
 class ReviewScene extends Scene {
   override state={n:0};
   override async construct() {
     const picture=view(this,()=>{
       const t=new Text('I',{fontSize:0.8,color:'#f00'});const glyph=t.children[0]!;
       if(trial==='outside-fill-box')glyph.setStyle({stroke:'#f00',strokeWidth:0.35});
       if(trial==='ink-absent-with-decoration'){
         glyph.setOpacity(0);return new Group(keyed(new Group(t,new Rectangle({width:0.08,height:0.08,fill:'#00f',stroke:'none'}).moveTo([-1,1])),'reading'));
       }
       keyed(glyph,'reading');return new Group(t);
     }, {place:false});
     const machine=new Machine(this,{start:this.state,events:['send'],next:()=>({n:1}),views:[picture],runTime:0.9,
       motion:()=>[{view:picture,during:'traveller',clearText:['reading'],...(trial==='contradictory-keys'?{absent:['reading']}:{})}],
       transition:{send:t=>{
         const c=t.choreograph(picture),part=c.from('reading'),b=part.box()!,token=new Rectangle({width:0.055,height:0.15,fill:'#000',stroke:'none'});
         const x=trial==='outside-fill-box'?b[2]+0.07:trial==='ordinary-fill-cross'?part.center()[0]:2;
         const y=part.center()[1];geometry={b,x,y,tokenWidth:token.width()};
         return new Succession([...pass(c,'traveller',token,[[x,y-0.2],[x,y+0.2]],{appear:0.1,move:0.5,leave:0.1}),c.rest({runTime:0.1})]);
       }}
     });
     this.add(picture);await this.play(machine.send('send'));
   }
 }
 const checker = new MachineMotionCheck();
 const scene=new ReviewScene({async frame(s){
   await checker.frame(s);
   const a=s.find('traveller'),target=s.find('reading');
   if(!a||!target||s.time<0.16||s.time>0.55)return;
   const d=Math.abs(a.center()[1]-target.center()[1]);
   if(d>=distance)return;
   distance=d;const actual=toSvgString(s,{width:800}), family=a.family(), op=family.map(m=>m.style.opacity);
   let free:string;try {family.forEach(m=>m.setStyle({opacity:0},false));free=toSvgString(s,{width:800});}
   finally {family.forEach((m,i)=>m.setStyle({opacity:op[i]!},false));}
   witness={actual,free};
 }});
 let error=null;try{await checker.during(scene,()=>scene.run());}catch(e){error=String(e);}
 let count=null;
 if(witness){
   const [actual,free]=await Promise.all([rasterize(witness.actual),rasterize(witness.free)]);
   const v=actual.pixels,b=free.pixels;count=0;
   for (let i=0;i<v.length;i+=4) if (b[i]!>248&&b[i+1]!<10&&b[i+2]!<10&&b[i]!-v[i]!>=32)count++;
 }
 results.push({trial,geometry,ordinaryRedCorePixelsLost:count,findings:checker.findings,error});
}
const s=JSON.stringify(results,null,2)+'\n';await writeFile(new URL('clearance-probe.json',import.meta.url),s);console.log(s);

