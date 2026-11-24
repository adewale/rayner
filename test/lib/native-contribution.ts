import { toSvgString, type Mobject, type Scene } from '../../src/index.ts';
import { rasterize } from '../../tools/lib/explain-raster.ts';
import {paintReach} from '../../src/internal.ts';

/** Independent ordinary-colour full-stage ownership knockouts. All temporary
 * state is restored before any asynchronous native renderer starts. */
export function occlusionSnapshot(scene: Scene, subject: Mobject, actor: Mobject) {
  const subjects=subject.family(), actors=actor.family(), sa=subjects.map(m=>m.style.opacity), aa=actors.map(m=>m.style.opacity);
  const draw=()=>toSvgString(scene,{width:800}); const actual=draw();
  try {
    subjects.forEach(m=>m.setStyle({opacity:0},false)); const noSubject=draw();
    actors.forEach(m=>m.setStyle({opacity:0},false)); const neither=draw();
    subjects.forEach((m,i)=>m.setStyle({opacity:sa[i]!},false)); const noActor=draw();
    return {actual,noSubject,noActor,neither};
  } finally {
    subjects.forEach((m,i)=>m.setStyle({opacity:sa[i]!},false));
    actors.forEach((m,i)=>m.setStyle({opacity:aa[i]!},false));
  }
}
export async function occlusionPixels(snapshot: ReturnType<typeof occlusionSnapshot>) {
  const images=await Promise.all([snapshot.actual,snapshot.noSubject,snapshot.noActor,snapshot.neither].map(rasterize));
  const [a,b,c,d]=images.map(i=>i.pixels); let lost=0,owned=0,actorPaint=0;
  for(let i=0;i<a!.length;i+=4) {
    const available=Math.max(...[0,1,2].map(k=>Math.abs(c![i+k]!-d![i+k]!)));
    const remaining=Math.max(...[0,1,2].map(k=>Math.abs(a![i+k]!-b![i+k]!)));
    if(available>16) owned++;
    if(available>=32 && available-remaining>16) lost++;
    if([0,1,2].some(k=>Math.abs(a![i+k]!-c![i+k]!)>16)) actorPaint++;
  }
  return {lost,owned,actorPaint};
}

/** Keep the original camera and native pixel grid, extending only its canvas.
 * Exact actor omission then exposes painted pixels beyond any camera edge. */
export function extentSnapshot(scene: Scene, actor: Mobject) {
  const family=actor.family(),alpha=family.map(m=>m.style.opacity),camera=scene.frame.box()!,bounds=actor.box()!,reach=paintReach(actor);
  const scale=Math.max(800/(camera[2]-camera[0]),450/(camera[3]-camera[1]));
  const overhang=Math.max(0,camera[0]-bounds[0]+reach,camera[1]-bounds[1]+reach,bounds[2]+reach-camera[2],bounds[3]+reach-camera[3]);
  const pad=Math.max(32,Math.ceil(overhang*scale)+4),w=800+2*pad,h=450+2*pad;
  const extend=(svg:string)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${-pad} ${-pad} ${w} ${h}">${svg.replace('<svg ','<svg overflow="visible" ')}</svg>`;
  const actual=extend(toSvgString(scene,{width:800}));
  try {
    family.forEach(m=>m.setStyle({opacity:0},false));
    return {actual,without:extend(toSvgString(scene,{width:800})),pad,width:800,height:450};
  } finally {family.forEach((m,i)=>m.setStyle({opacity:alpha[i]!},false));}
}
export async function extentPixels(snapshot: ReturnType<typeof extentSnapshot>) {
  const [actual,without]=await Promise.all([snapshot.actual,snapshot.without].map(rasterize));
  const a=actual!.pixels,b=without!.pixels,stride=snapshot.width+2*snapshot.pad;let outside=0,total=0;
  for(let i=0;i<a.length;i+=4) if([0,1,2,3].some(k=>Math.abs(a[i+k]!-b[i+k]!)>16)) {
    total++;const x=(i/4)%stride,y=Math.floor(i/4/stride);
    if(x<snapshot.pad||x>=snapshot.pad+snapshot.width||y<snapshot.pad||y>=snapshot.pad+snapshot.height)outside++;
  }
  return {outside,total};
}
