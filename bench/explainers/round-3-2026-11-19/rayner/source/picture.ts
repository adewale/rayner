import { Group, Rectangle, Line, Arrow, Dot, keyed, type Vec } from 'rayner';
import type { Stage } from 'rayner/explain';
import { label, tile, keyedParts, addAll, connector, TYPE } from 'rayner/drawing';
import { coffeeStates, graph, structured, featureCounts, transfer, name, type Chart, type Config } from './model.ts';
export type Model = { chart: Chart; config: Config; flat?: Config; last?: string; features?: number };
export type Shown = { mode: string };
/** Position is semantic: coffee cycle is clockwise; player rows become orthogonal regions.
 * Keys name the state or the playback × volume coordinate, never the drawing order. */
export function draw(st: Model, sh: Shown, s: Stage): Group {
 const p=keyedParts(), ink=s.look;
 const text=(k:string,t:string|number,at:Vec,size:number=TYPE.small,color=ink.ink)=>p.add(label(s,t,{at,size,color}),k);
 const node=(k:string,t:string,at:Vec,w=3.3,active=false)=>addAll(p,tile(s,t,{key:k,at,width:w,height:.95,size:.62,active,raised:true}));
 const frame=(k:string,at:Vec,w:number,h:number)=>p.add(new Rectangle({width:w,height:h,stroke:ink.soft,strokeWidth:.045,fill:'none',cornerRadius:.16}).moveTo(at),k);
 const arrow=(k:string,a:Vec,b:Vec)=>p.add(new Arrow(a,b,{stroke:ink.soft,strokeWidth:.045,tipLength:.2,tipWidth:.18}),k);
 const route=(k:string,pts:Vec[])=>{p.add(connector(s,pts,{strokeWidth:.045,color:ink.soft}),k); const a=pts.at(-2)!,b=pts.at(-1)!;const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);p.add(new Arrow([b[0]-dx/d*.3,b[1]-dy/d*.3],b,{stroke:ink.soft,strokeWidth:.045,tipLength:.2,tipWidth:.18}),`${k}:tip`);};
 const dot=(k:string,at:Vec)=>p.add(new Dot({radius:.09,fill:ink.ink,stroke:'none'}).moveTo(at),k);
 const summary=(t:string)=>text('summary',t,[0,-3.75]);
 const active=(v:string)=>st.config.includes(v);
 function cycle(parent:boolean,frother=false) {
  const left=-.95,right=4.4,top=1.3,bottom=frother?-.8:-1.5;
  if(parent) {frame('on:box',[1.9,frother?-.05:-.1],10.8,6.5);text('on:name','on',[6.5,2.7],.64);}
  const pos:Record<string,Vec>={idle:[left,top],grinding:[right,top],brewing:[right,bottom],ready:[left,bottom]};
  for(const state of coffeeStates) node(`coffee:${state}`,state,pos[state]!,3.2,active(state));
  arrow('START',[left+1.6,top],[right-1.6,top]);text('START:label','START',[(left+right)/2,top+.62]);
  arrow('GROUND',[right,top-.48],[right,bottom+.48]);text('GROUND:label','GROUND',[6.1,(top+bottom)/2]);
  arrow('POURED',[right-1.6,bottom],[left+1.6,bottom]);text('POURED:label','POURED',[(left+right)/2,bottom-.62]);
  arrow('TAKE',[left,bottom+.48],[left,top-.48]);text('TAKE:label','TAKE',[-2.4,(top+bottom)/2]);
  if(parent) {
   node('off','off',[-5.5,2],3,active('off'));
   route('POWER_ON',[[-5.5,1.5],[-5.5,.6],[-3.5,.6]]);text('POWER_ON:label','POWER_ON',[-5.5,-.05]);
   route('POWER_OFF',[[-3.5,-1.65],[-7.35,-1.65],[-7.35,2],[-7,2]]);text('POWER_OFF:label','POWER_OFF',[-5.5,-2.3]);
   dot('coffee:start',[-2.65,2.3]);arrow('coffee:initial',[-2.55,2.3],[left,top+.48]);
  }
  if(frother) {
   p.add(new Line([-3.2,-1.95],[7,-1.95],{stroke:ink.soft,strokeWidth:.035}),'regions:divider');
   node('frother:still','still',[-.95,-2.85],3.2,active('still'));node('frother:frothing','frothing',[4.4,-2.85],3.2,active('frothing'));
   arrow('FROTH',[.65,-2.65],[2.8,-2.65]);text('FROTH:label','FROTH',[1.7,-2.2]);
   arrow('STOP',[2.8,-3.05],[.65,-3.05]);text('STOP:label','STOP',[1.7,-3.5]);
   dot('frother:start',[-2.9,-2.85]);arrow('frother:initial',[-2.8,-2.85],[-2.55,-2.85]);
  }
 }
 function power(missing:boolean,ask=false) {
  node('off','off',[0,2.05],3.2,false);
  coffeeStates.forEach((v,i)=>{
   const x=-5.55+i*3.7;node(`coffee:${v}`,v,[x,-1.7],3.3,st.config[0]===v);
   if(!ask && !(missing&&v==='brewing')) arrow(`copy:${v}`,[x,-1.22],[-1.1+i*.73,1.57]);
   if(missing&&v==='brewing') {text('missing','missing',[x,-.6],.56,ink.bad);text('ignored','stays brewing',[x,-2.6],.56,ink.bad);}
  });
  text('event','POWER_OFF',missing?[-5.3,2.2]:[0,.8],.64);
  summary(ask?'One destination. How many copies?':missing?'A missed copy changes the behavior.':`${coffeeStates.length} copies of the same event`);
 }
 function flatPlayer() {
  const rows=[['paused','sound'],['playing','sound'],['paused','muted'],['playing','muted']];
  rows.forEach((r,i)=>{
   const x=i%2===0?-3:3,y=i<2?1.5:-1.5,k=`grid:${r[0]}:${r[1]}`;
   const on=name(st.config)===name(r);frame(`${k}:box`,[x,y],4,1.45);
   if(on) p.add(new Rectangle({width:4,height:1.45,fill:'none',stroke:ink.emphasis,strokeWidth:.12}).moveTo([x,y]),`${k}:active`);
   text(`${k}:play`,r[0]!,[x,y+.35],.62);text(`${k}:volume`,r[1]!,[x,y-.35],.56);
  });
  for(const y of [1.5,-1.5]) {arrow(`play:${y}`,[-1,y+.17],[1,y+.17]);arrow(`pause:${y}`,[1,y-.17],[-1,y-.17]);text(`play:${y}:label`,'PLAY / PAUSE',[0,y>0?2.6:-2.6]);}
  for(const x of [-3,3]) {arrow(`mute:${x}`,[x-.17,.775],[x-.17,-.775]);arrow(`unmute:${x}`,[x+.17,-.775],[x+.17,.775]);text(`mute:${x}:label`,'MUTE',[x<0?-5.8:5.8,.35]);text(`unmute:${x}:label`,'UNMUTE',[x<0?-5.8:5.8,-.35]);}
  summary(`${graph('player').states.length} states · ${graph('player').edges.length} transitions`);
 }
 function regions() {
  frame('player:box',[0,0],14.5,6.35);
  p.add(new Line([-7.25,0],[7.25,0],{stroke:ink.soft,strokeWidth:.04}),'player:divider');
  text('playback:label','playback region',[-4.5,2.65]);text('volume:label','volume region',[-4.5,-.45]);
  for(const [row,a,b,e,f] of [[1.3,'paused','playing','PLAY','PAUSE'],[-1.7,'sound','muted','MUTE','UNMUTE']] as const) {
   node(`region:${a}`,a,[-4,row],3.5,active(a));node(`region:${b}`,b,[4,row],3.5,active(b));
   arrow(e,[-2.25,row+.2],[2.25,row+.2]);text(`${e}:label`,e,[0,row+.7]);
   arrow(f,[2.25,row-.2],[-2.25,row-.2]);text(`${f}:label`,f,[0,row-.7]);
   dot(`${a}:start`,[-6.5,row]);arrow(`${a}:initial`,[-6.4,row],[-5.75,row]);
  }
  summary(`${structured.player.boxes} state boxes · ${structured.player.arrows} transitions · 2 active states`);
 }
 const mode=sh.mode;
 if(mode==='cycle') {cycle(false);summary('One active state. An event follows an arrow.');}
 else if(mode==='ask-power') power(false,true);
 else if(mode==='missing') power(true);
 else if(mode==='parent') {cycle(true);summary(`Flat: 5 boxes / 9 arrows     Parent: ${structured.parent.boxes} boxes / ${structured.parent.arrows} arrows`);}
 else if(mode==='flat-player') flatPlayer();
 else if(mode==='regions') regions();
 else if(mode==='third'||mode==='third-answer') {
  const n=st.features??3,c=featureCounts(n);
  text('question','playback × volume × subtitles',[0,2.5],.8);
  node('p','paused / playing',[-4.8,1],4.5);node('v','sound / muted',[0,1],4.5);node('s','hidden / shown',[4.8,1],4.5);
  if(mode==='third') {text('think','One more independent yes/no feature.',[0,-.8],.64);text('think2','What happens to the flat combinations?',[0,-1.9],.64);}
  else {text('flat-count',`${c.flatStates} flat states · ${c.flatArrows} transitions`,[0,-.7],.8);text('region-count',`${c.chartStates} regional states · ${c.chartArrows} transitions`,[0,-1.9],.8);summary('Flat multiplies the choices. Regions add them.');}
 }
 else if(mode==='trace') {
  text('event',`Event: ${st.last??'start'}`,[0,2.5],.8);
  for(const [x,k,t,c] of [[-3.8,'structured','statechart',st.config],[3.8,'flat','flat machine',st.flat??st.config]] as const) {
   frame(`${k}:box`,[x,.25],6.7,3.5);text(`${k}:title`,t,[x,1.4],.64);
   text(`${k}:play`,c[0]!,[x,.35],.8);text(`${k}:volume`,c[1]!,[x,-.65],.8);
  }
  text('equals',name(st.config)===name(st.flat??st.config)?'Same active configuration':'Mismatch',[0,-2.2],.8);summary('Send the same events to both representations.');
 }
 else if(mode==='player-on') {
  frame('on:box',[1.5,-.1],10.8,6.3);text('on:name','on',[5.9,2.5],.8);
  node('off','off',[-5.6,1.7],2.8,active('off'));
  route('POWER_ON',[[-5.6,1.2],[-5.6,.4],[-3.9,.4]]);text('POWER_ON:label','POWER_ON',[-5.6,-.2]);
  route('POWER_OFF',[[-3.9,-1.7],[-7.4,-1.7],[-7.4,1.7],[-7,1.7]]);text('POWER_OFF:label','POWER_OFF',[-5.6,-2.4]);
  text('pb','playback region',[1.3,1.45],.64);node('paused','paused',[-.8,.45],3.5,active('paused'));node('playing','playing',[4,.45],3.5,active('playing'));
  arrow('PLAY',[.95,.6],[2.25,.6]);arrow('PAUSE',[2.25,.3],[.95,.3]);text('pb:events','PLAY / PAUSE',[1.6,-.4]);dot('pb:start',[-3,.45]);arrow('pb:initial',[-2.9,.45],[-2.55,.45]);
  p.add(new Line([-3.9,-.9],[6.9,-.9],{stroke:ink.soft,strokeWidth:.04}),'divider');
  text('vol','volume region',[1.3,-1.4],.64);node('sound','sound',[-.8,-2.2],3.5,active('sound'));node('muted','muted',[4,-2.2],3.5,active('muted'));
  arrow('MUTE',[.95,-2.05],[2.25,-2.05]);arrow('UNMUTE',[2.25,-2.35],[.95,-2.35]);text('vol:events','MUTE / UNMUTE',[1.6,-3]);dot('vol:start',[-3,-2.2]);arrow('vol:initial',[-2.9,-2.2],[-2.55,-2.2]);summary('Flat: 5 boxes / 13 arrows     Statechart: 6 boxes / 6 arrows');
 }
 else if(mode==='transfer') {
  text('condition','The frother works while the machine is on.',[0,2.5],.64);
  node('frother:still','still',[-3.6,1],4);node('frother:frothing','frothing',[3.6,1],4);
  arrow('froth',[-1.6,1.15],[1.6,1.15]);arrow('stop',[1.6,.85],[-1.6,.85]);text('froth:label','FROTH',[0,1.8]);text('stop:label','STOP',[0,.2]);
  text('where','Inside brewing? Beside brewing? Outside on?',[0,-1.3],.64);text('count','Then count the flat combinations, including off.',[0,-2.5],.64);
 }
 else if(mode==='frother'||mode==='final') {cycle(true,true);}
 else if(mode==='own-power'||mode==='own-answer') {
  text('condition','FROTH and STOP also work while off.',[0,2.5],.8);
  if(mode==='own-power') {text('question','Does the frother still belong inside on?',[0,.8],.8);text('count','How many flat states now?',[0,-.5],.8);}
  else {text('placement','Two top-level regions',[0,1.1],.8);text('pair','whole coffee machine × frother',[0,-.1],.8);text('answer',`5 × 2 = ${transfer.outside} flat states`,[0,-1.5],1);summary('The off state now pairs with both frother states.');}
 }
 else if(mode==='steam'||mode==='steam-answer') {
  text('condition','The frother works while brewing; leaving stops it.',[0,2.5],.64);
  if(mode==='steam') {text('question','Are the two words still independent?',[0,.9],.8);text('count','Which states need two-word names?',[0,-.5],.8);}
  else {
   const names=['off','idle','grinding','brewing · still','brewing · frothing','ready'];
   names.forEach((n,i)=>node(`name:${i}`,n,[-3.6+(i%2)*7.2,1.3-Math.floor(i/2)*1.4],6.7));
   text('placement','A parent inside brewing, rather than a region.',[0,-2.8],.64);
   summary(`${transfer.steam} flat states · 13 flat arrows / ${structured.steam.arrows} statechart arrows`);
  }
 }
 else throw new Error(`Unknown picture ${mode}`);
 return p.group();
}
export function describe(st:Model,sh:Shown):string {
 return `${sh.mode}: ${st.chart}. Active configuration: ${name(st.config)}.${st.flat?` Flat representation: ${name(st.flat)}.`:''}${st.last?` Last event ${st.last}.`:''}`;
}
