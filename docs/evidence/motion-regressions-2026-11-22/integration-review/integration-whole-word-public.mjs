import assert from'node:assert/strict';import{writeFile}from'node:fs/promises';
const root='/workspace/rayner';
const{Scene,Group,Text,Rectangle,Transform,keyed,toSvgString}=await import(root+'/src/index.ts');
const{loadFonts}=await import(root+'/explain/testing.ts');
const{renderAsync}=await import('@resvg/resvg-js');
await loadFonts();Scene.captionWpm=Infinity;
const raster=async text=>{const scene=new Scene({async frame(){}});const copy=text.copy();for(const m of copy.family())m.setStyle({opacity:1},false);scene.add(copy);const r=await renderAsync(toSvgString(scene,{width:800}),{font:{loadSystemFonts:false}});return Buffer.from(r.pixels);};
const results=[];
for(const staged of[false,true])for(const lagRatio of[0,.3,.9]){
 let references,checks=0,frames=0;
 class Example extends Scene{async construct(){
  const a=keyed(new Text('Old invitation',{fontSize:.4,color:'#913f61'}).rotate(.1).shift([-2,1]),'label');
  const b=keyed(new Text('New permission',{fontSize:.6,color:'#315e86'}).rotate(-.15).shift([2,-1]),'label');
  for(const[t,base]of[[a,.2],[b,.4]])t.children.forEach((m,i)=>m.setStyle({opacity:i%2?base:base*2},false));
  references=new Map([[a.text,{ink:await raster(a),opacities:a.children.map(m=>m.style.opacity)}],[b.text,{ink:await raster(b),opacities:b.children.map(m=>m.style.opacity)}]]);
  const src=keyed(new Group(a,keyed(new Rectangle({width:.4,height:.4,fill:'#8b5f30',stroke:'none'}).shift([-4,-2]),'retained')),'panel');
  const target=keyed(new Group(b,keyed(new Rectangle({width:.4,height:.4,fill:'#8b5f30',stroke:'none'}).shift([4,2]),'retained')),'panel');
  this.add(src);await this.play(new Transform(src,target,{runTime:1.2,match:{by:'key',text:'whole'},staged,lagRatio}));
 }}
 await new Example({async frame(scene){frames++;for(const text of scene.familyMembers().filter(m=>m instanceof Text&&references.has(m.text))){const ref=references.get(text.text);assert.ok((await raster(text)).equals(ref.ink),`${text.text}: geometry altered at frame${frames},lag${lagRatio},staged${staged}`);const ratios=text.children.map((m,i)=>m.style.opacity/ref.opacities[i]);assert.ok(ratios.every(v=>Math.abs(v-ratios[0])<1e-7),'whole glyphs must share fade multiplier even when endpoint opacities differ');checks++;}}}).run();
 assert.ok(frames>=36&&checks>=50);results.push({staged,lagRatio,frames,wordChecks:checks});
}
await writeFile('out/independent-regression-check-2026-11-22/integration-whole-word-public.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
