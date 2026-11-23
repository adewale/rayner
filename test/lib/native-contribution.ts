import { toSvgString, type Mobject, type Scene } from '../../src/index.ts';
import { rasterize } from '../../tools/lib/explain-raster.ts';

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
