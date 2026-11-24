import { Scene } from 'rayner';
import { stage, view, Machine, refuse, answerOf, type ExplainerMeta } from 'rayner/explain';
import { draw, describe, type Model, type Shown } from './picture.ts';
import { graph, start, send, run, events, flatPlayerNext, name, transfer, featureCounts, type Chart } from './model.ts';
// The prose answers are guarded at collection as well as tested, so pictures and answers drift together.
if(transfer.inside!==9||transfer.outside!==10||transfer.steam!==6||graph('steam').edges.length!==13||name(run('frother',['POWER_OFF','POWER_ON'],['grinding','frothing']))!=='idle · still') throw new Error('Revisit the check answers: the model changed.');
export default class Statecharts extends Scene<Model,Shown> {
 // The approved script is adopted by Rayner into meta.title, meta.answer, meta.questions and grounding.
 static meta = {
  id:'bench-statecharts-round3',
  sources:['https://github.com/statelyai/xstate/tree/xstate%405.33.3/packages/core','https://stately.ai/docs/state-machines-and-statecharts'],
  player:{accent:true,paper:true},
  claims:[
   {says:'both representations',test:'model.test.ts: flat and regional players have identical event traces'},
   {says:'independent binary features',test:'model.test.ts: binary feature counts enumerate the full product through five features'},
  ],
 } satisfies ExplainerMeta;
 override state:Model={chart:'parent',config:['idle']};
 override shown:Shown={mode:'cycle'};
 override async construct() {
  const s=stage(this,{palette:{paper:'#fcfaf5',ink:'#202c35',accent:'#096c70',muted:'#a4aaa7'}});
  const picture=view(this,(st,sh)=>draw(st,sh,s),{place:false});
  const show=async(id:string,title:string,line:string,caption:string,mode:string,state:Model,predict?:{prompt?:string;options:string[];answer:string})=>{
   await this.step(id,{title,line,caption,...(predict?{predict}:{})});
   this.state=state;this.shown={mode};
   if(id==='coffee') await s.enter(picture,{describe:()=>describe(this.state,this.shown)});
   else await picture.sync({runTime:.8});
   s.opening(picture);
  };
  await show('coffee','The coffee machine has one active state','Read an arrow as: event → next state.',
   'A box names a state; an arrow names an event. START takes idle to grinding, GROUND takes grinding to brewing, POURED takes brewing to ready, and TAKE returns to idle. The outlined active box tells you where the machine is. Now add a power button.',
   'cycle',{chart:'parent',config:['idle']});
  await show('power','Give the power button one destination','How many POWER_OFF arrows must you add?',
   'The four working states should all lead to off when POWER_OFF arrives. In a flat machine, an arrow belongs to its source state. Commit to a count before going on.',
   'ask-power',{chart:'coffee',config:['idle']},{options:['1 arrow','4 arrows','5 arrows'],answer:`${graph('coffee').states.length-1} arrows`});
  await show('missed','Four copies leave room for one mistake','Can one arrow replace the repeated rule?',
   'Four arrows are needed. This hand copy accidentally omitted brewing’s arrow, so POWER_OFF leaves it brewing. That is a drawing error, not an appliance feature. How many power-off arrows could suffice if a box could contain the four working states?',
   'missing',{chart:'missing',config:run('missing',['POWER_ON','START','GROUND','POWER_OFF'])},{options:['1 arrow','4 arrows','5 arrows'],answer:`${graph('parent').edges.length-8} arrow`});
  await show('parent','Put the shared rule on a parent','Inside on, the working states share POWER_OFF.',
   `One arrow from on takes POWER_OFF for its contained states. Entering on starts at idle, at the start dot. A parent is itself a state containing states. ${answerOf(this)}. The extra box removes three repeated arrows: six transitions instead of nine.`,
   'parent',{chart:'parent',config:['idle']});
  await show('brew-live','Try the parent’s power button','Send events below; try POWER_OFF while brewing.',
   'The guided events reach brewing. POWER_OFF has no arrow on brewing itself: its parent on handles the event and exits. Try the brewing events, then turn off and on. The start dot makes a fresh entry choose idle. A dim event button explains why that event has no transition here.',
   'parent',{chart:'parent',config:start('parent')});
  const brew=new Machine<Model,string>(this,{start:{chart:'parent',config:start('parent')},events:events('parent'),next:(st,e)=>{const r=send('parent',st.config,e);return r.handled?{...st,config:r.config}:refuse(`no ${e} transition from ${name(st.config)}`);},views:[picture],runTime:.8});
  await this.play(brew.replay(['POWER_ON','START','GROUND']));
  s.opening(picture);
  await show('combinations','A different problem: repeated combinations','Playback and volume each have two choices.',
   'A player can be paused or playing, and sound can be audible or muted. Here sound means audible. Flat, you need a box for each pair. PLAY and PAUSE must appear in both volume contexts; MUTE and UNMUTE must appear in both playback contexts. Four states already need eight transitions.',
   'flat-player',{chart:'player',config:['paused','sound']});
  await show('regions','Split independent choices into regions','One active state per region, at the same time.',
   'Keep playback and volume in separate regions. PLAY changes playback while volume stays put; MUTE changes volume while playback stays put. Four state boxes now need four transitions. Before the next step, add a third independent feature: subtitles hidden or shown. What does the flat player cost?',
   'regions',{chart:'player',config:['playing','muted']},{prompt:'With subtitles, how many flat states and transitions?',options:['6 states / 6 transitions','8 states / 12 transitions','8 states / 24 transitions'],answer:`${featureCounts(3).flatStates} states / ${featureCounts(3).flatArrows} transitions`});
  await show('third','Flat combinations multiply; regions add','The third feature doubles the flat states.',
   'Three independent binary features have 2 × 2 × 2 combinations: eight flat states. Each has three possible flips, making 24 directed transitions. Regions use three pairs of states and two transitions per pair: six states and six transitions. This is the second sign: independent words repeated in state names.',
   'third-answer',{chart:'player',config:['playing','muted'],features:3});
  await show('same-behavior','A statechart changes the drawing, not the behavior','Send one event to both representations.',
   'The same events run through both representations. The guided run sends PLAY, MUTE, then PAUSE; both end paused and muted. Use the buttons to continue the comparison. A statechart can be flattened into an ordinary state machine by naming each active combination; it packages the rules more compactly.',
   'trace',{chart:'player',config:start('player'),flat:start('player'),last:'start'});
  const player=new Machine<Model,string>(this,{start:{chart:'player',config:start('player'),flat:start('player'),last:'start'},events:events('player'),next:(st,e)=>{const r=send('player',st.config,e);return r.handled?{...st,config:r.config,flat:flatPlayerNext(st.flat??st.config,e),last:e}:refuse(`${e} has no transition from ${name(st.config)}`);},views:[picture],runTime:.8});
  await this.play(player.replay(['PLAY','MUTE','PAUSE']));s.opening(picture);
  await show('compose','The two ideas fit inside each other','Put the player’s regions inside on.',
   'Parents and regions compose. This player’s on state holds both playback and volume regions. POWER_OFF exits them together; POWER_ON starts them at paused and sound. Flat, the four pairs plus off need 13 transitions. The statechart has six state boxes and six transitions, including its shared power rule.',
   'player-on',{chart:'player-on',config:['paused','sound']});
  await show('place-frother','Your turn: add the milk frother','Where does it belong, and how many flat states?',
   'The frother can be still or frothing during idle, grinding, brewing or ready. It cannot run while off. Place it before seeing the answer. Count the flat states too: pair the working states with the frother’s two states, then decide what to do with off.',
   'transfer',{chart:'frother',config:['idle','still']},{options:['Inside brewing · 6 flat states','Beside coffee inside on · 9 flat states','Outside on · 10 flat states'],answer:`Beside coffee inside on · ${transfer.inside} flat states`});
  await show('frother','A second region inside on','Four working states × two frother states, plus off.',
   'The frother goes beside the coffee cycle, inside on. Either region can move while the other stays put. There are 4 × 2 + 1 = 9 flat states and 25 flat transitions. The statechart draws eight boxes, including on, and eight transitions. Its two start dots choose idle and still.',
   'frother',{chart:'frother',config:['grinding','frothing']});
  await show('own-power','Change the condition: the frother gets its own power','FROTH and STOP work while off too.',
   'Reconsider the boundary. The frother no longer depends on the coffee machine being on. Where must its region go, and how many combinations does the flat machine need?',
   'own-power',{chart:'independent',config:['off','still']},{options:['Inside on · 9 states','Beside the whole machine · 10 states','Inside off · 6 states'],answer:`Beside the whole machine · ${transfer.outside} states`});
  await show('own-answer','Move it beside the whole machine','The off state gains two frother combinations.',
   'The top level now has two regions: the whole off-and-on coffee machine, and the frother. Each of the coffee machine’s five states pairs with still or frothing: 10 flat states. In particular, off · still and off · frothing are distinct. POWER_OFF would leave this independent frother running.',
   'own-answer',{chart:'independent',config:['off','frothing']});
  await show('steam','Change it again: the frother uses brewing steam','Leaving brewing stops the frother.',
   'The frother now has choices during brewing, but not during idle, grinding, ready or off. Write the flat state names before continuing. Do those names still signal independent regions?',
   'steam',{chart:'steam',config:['brewing','still']},{options:['6 states · a parent inside brewing','9 states · a region inside on','10 states · a top-level region'],answer:`${transfer.steam} states · a parent inside brewing`});
  await show('steam-answer','Two words do not always mean two regions','Ask whether the choices are independent.',
   'The six flat names are shown. The frother’s choice exists inside brewing, so the words are dependent. Make brewing a parent containing still and frothing: the first idea again. The statechart needs eight transitions, where the flat machine needs 13. Look for independent choices, rather than counting words alone.',
   'steam-answer',{chart:'steam',config:['brewing','still']});
  await show('try-frother','Use the two signs, then test the boundary','Try POWER_OFF, then POWER_ON. What returns?',
   'Return to the frother inside on: the machine is grinding while the frother is frothing. Press POWER_OFF, then POWER_ON. Both regions exit, then their start dots choose idle and still; no history remembers frothing. Use a parent for a shared transition. Use regions for independent choices. Flattening preserves the behavior, but repeats those rules.',
   'final',{chart:'frother',config:start('frother')});
  const frother=new Machine<Model,string>(this,{start:{chart:'frother',config:start('frother')},events:events('frother'),next:(st,e)=>{const r=send('frother',st.config,e);return r.handled?{...st,config:r.config}:refuse(`no ${e} transition from ${name(st.config)}`);},views:[picture],runTime:.8});
  await this.play(frother.replay(['POWER_ON','START','FROTH']));s.opening(picture);
 }
}
