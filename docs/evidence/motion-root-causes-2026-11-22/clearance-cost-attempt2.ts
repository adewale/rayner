import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Group,Rectangle,Scene,Succession,Text,keyed} from '../../../src/index.ts';
import {Machine,view} from '../../../explain/index.ts';
import {pass} from '../../../explain/drawing.ts';
import {MachineMotionCheck} from '../../../tools/lib/explain-motion-rules.ts';
const checkerUrl=new URL('../../../tools/lib/explain-motion-rules.ts',import.meta.url);
const before=execFileSync('git',['show','2954eb36:tools/lib/explain-motion-rules.ts'],{encoding:'utf8'});
const rewritten=before.replace(/from '([^']+)'/g,(_,p)=>`from '${new URL(p,checkerUrl).href}'`);
const Old=(await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(rewritten)).toString('base64'))).MachineMotionCheck;
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
const inputProvenance={beforeRevision:'2954eb36',beforeCheckerSha256:hash(before),afterCheckerSha256:hash(await readFile(checkerUrl,'utf8')),engine:'current shared SVG culling; before/after culling arithmetic is unchanged by paintReach extraction'};
const data=[];
async function sample(hit:boolean,clear:boolean,version:string){
 class Demo extends Scene{
  override async construct(){
   const picture=view(this,()=>new Group(keyed(new Text('Sign-in',{fontSize:0.65,color:'#f00'}),'line')),{place:false});
   const machine=new Machine(this,{start:{n:0},events:['send'],next:()=>({n:1}),views:[picture],runTime:1.3,
    motion:()=>[{view:picture,during:'token',...(clear?{clearText:['line']}:{present:['line']})}],
    transition:{send:t=>{const c=t.choreograph(picture);return new Succession([...pass(c,'token',new Rectangle({width:.06,height:.5,fill:'#000',stroke:'none'}),[[-1.1,hit?0:1.6],[1.1,hit?0:1.6]],{appear:.1,move:.9,leave:.1}),c.rest({runTime:.1})]);}}});
   this.add(picture);await this.play(machine.send('send'));
  }}
 const c=new (version==='before'?Old:MachineMotionCheck)();let frames=0;const s=new Demo({async frame(scene){frames++;await c.frame(scene)}});
 const start=performance.now();await c.during(s,()=>s.run());return {version,hit,clear,ms:Number((performance.now()-start).toFixed(2)),frames,found:c.findings.length};
}
for(let rep=-1;rep<5;rep++)for(const hit of rep%2===0?[true,false]:[false,true])for(const clear of rep%2===0?[true,false]:[false,true]){
 for(const version of rep%2===0?['before','after']:['after','before']){const result=await sample(hit,clear,version);if(rep>=0)data.push({rep,...result});}
}
const median=(a:number[])=>a.slice().sort((l,r)=>l-r)[Math.floor(a.length/2)];
const groups=[];for(const version of ['before','after'])for(const hit of [false,true])for(const clear of [false,true]){const rs=data.filter(r=>r.version===version&&r.hit===hit&&r.clear===clear);groups.push({version,hit,clear,medianMs:median(rs.map(r=>r.ms)),minMs:Math.min(...rs.map(r=>r.ms)),maxMs:Math.max(...rs.map(r=>r.ms)),frames:rs[0].frames,found:rs[0].found});}
await writeFile(new URL('clearance-cost-attempt2.json',import.meta.url),JSON.stringify({node:process.version,inputProvenance,sample:'single scene, one 0.9s traveller, 800x450, one protected text; independent warmup of all four conditions then five alternating pairs in one process',groups,data},null,2)+'\n');console.log(groups);

