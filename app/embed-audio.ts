import {stepAudio} from '../explain/audio.ts';
import type {AudioClip} from '../explain/audio.ts';
import {StateScope} from './embed-scope.ts';
import {UNITS} from '../src/svg.ts';

/** Optional reader module. Only pages with authored audio import this code. */
export function mountAudio(stage: HTMLElement, frame: HTMLElement) {
  const panel=document.createElement('div');panel.className='score-audio';panel.hidden=true;panel.lang='en';
  panel.setAttribute('role','group');panel.setAttribute('aria-label','Listen to this score');
  const buttons=document.createElement('div');buttons.className='score-audio-buttons';
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Ready. Sound starts when you press Play.';
  const elapsed=document.createElement('output');elapsed.setAttribute('aria-hidden','true');
  const pulseLabel=document.createElement('label'),pulse=document.createElement('input');pulse.type='checkbox';pulse.checked=true;
  pulseLabel.append(pulse,' Pulse');
  const stopButton=document.createElement('button');stopButton.type='button';stopButton.textContent='Stop';
  panel.append(buttons,status);frame.after(panel);
  type Playing = {kind:'playing'; scope:StateScope; active:Map<OscillatorNode,GainNode>; cursor:SVGLineElement|null};
  type Phase = {kind:'idle'|'finished'|'failed'} | {kind:'starting';scope:StateScope} | Playing;
  let context: AudioContext | null=null;
  let phase:Phase={kind:'idle'};
  function enter(next:Phase) {
    if('scope' in phase && (!('scope' in next) || phase.scope!==next.scope)) phase.scope.abort();
    if(phase.kind==='playing') {
      for(const [osc,gain] of phase.active) {osc.stop();osc.disconnect();gain.disconnect();}
      phase.cursor?.remove();
    }
    stopButton.disabled=!('scope' in next);
    panel.dataset.playing=String(next.kind==='playing');elapsed.value='';
    phase=next;
  }
  function revealScore() {
    // A click or keyboard focus can scroll the controls into view while hiding
    // the score. Native scrolling also reveals it through a host iframe or a
    // fullscreen scroll container, where window.scrollBy cannot reach it.
    for(const node of [panel,stage]) node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  }
  const stop=()=>enter({kind:'idle'});
  function tone(state:Playing,ctx:AudioContext,midi:number,start:number,duration:number,volume:number) {
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type='triangle';osc.frequency.setValueAtTime(440*2**((midi-69)/12),start);
    const edge=Math.min(0.012,duration/4);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+edge);
    gain.gain.setValueAtTime(volume,start+duration-edge);gain.gain.linearRampToValueAtTime(0,start+duration);
    osc.connect(gain);gain.connect(ctx.destination);state.active.set(osc,gain);
    osc.onended=()=>{osc.disconnect();gain.disconnect();state.active.delete(osc);};
    osc.start(start);osc.stop(start+duration);
  }
  function play(clip:AudioClip) {
    const scope=new StateScope();
    const name=clip.id.toUpperCase();
    enter({kind:'starting',scope});
    status.textContent=`Starting ${name}.`;
    return scope.run(function* () {
      try {
        if(!context||context.state==='closed') context=new AudioContext();
        const ctx=context;
        yield* scope.wait(ctx.resume());
        const state:Playing={kind:'playing',scope,active:new Map(),cursor:null};
        enter(state);
        const seconds=60/clip.bpm,start=ctx.currentTime+0.04,total=clip.beats*seconds;
        // Equal-time note endings precede starts, so adjacent notes retain the
        // monophonic level. Chords share that level instead of clipping the mix.
        const events=clip.notes.flatMap(n=>[{at:n.at,change:1},{at:n.at+n.duration,change:-1}])
          .sort((a,b)=>a.at-b.at||a.change-b.change);
        let voices=0,peak=1;
        for(const event of events) {voices+=event.change;peak=Math.max(peak,voices);}
        for(const note of clip.notes) tone(state,ctx,note.midi,start+note.at*seconds,note.duration*seconds,0.09/peak);
        if(pulse.checked) for(let beat=0;beat<clip.beats;beat++) tone(state,ctx,beat%4===0?88:81,start+beat*seconds,0.045,0.025);
        const svg=stage.querySelector('svg:not(.leaving)');
        if(svg&&clip.plot) {
          const [left,bottom,,top]=clip.plot;
          state.cursor=document.createElementNS('http://www.w3.org/2000/svg','line');
          for(const [name,value] of Object.entries({
            class:'score-playhead','aria-hidden':'true',
            x1:left*UNITS,x2:left*UNITS,y1:-top*UNITS,y2:-bottom*UNITS,
            stroke:'#d35400','stroke-width':45,
          })) state.cursor.setAttribute(name,String(value));
          svg.append(state.cursor);
        }
        status.textContent=`Playing ${name} at ${clip.bpm} BPM.`;
        const tick=()=>{
          const t=Math.max(0,ctx.currentTime-start);
          if(t>=total) {enter({kind:'finished'});status.textContent=`Finished ${name}.`;return;}
          elapsed.value=`Beat ${Math.min(Math.floor(t/seconds)+1,Math.ceil(clip.beats))} / ${clip.beats}`;
          if(state.cursor&&clip.plot) {
            const x=(clip.plot[0]+(clip.plot[2]-clip.plot[0])*Math.min(t/total,1))*UNITS;
            for(const name of ['x1','x2']) state.cursor.setAttribute(name,String(x));
          }
          state.scope.frame(tick);
        };
        tick();
        revealScore();
      } catch {
        enter({kind:'failed'});status.textContent='Audio could not start. The score remains available; try Play again.';
      }
    });
  }
  stopButton.onclick=()=>{stop();status.textContent='Stopped.';};
  pulse.onchange=()=>{stop();status.textContent='Pulse changed. Press Play to hear it.';};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();status.textContent='Stopped while the page is hidden.';}});
  window.addEventListener('pagehide',()=>{stop();if(context && context.state!=='closed') void context.close().catch(()=>{});});
  return {
    stop() {
      stop();
      // Navigation invalidates the score before its new picture is ready.
      for(const b of buttons.querySelectorAll('button')) b.disabled=true;
    },
    set(value:unknown) {
      stop();const audio=stepAudio(value);panel.hidden=!audio;
      buttons.replaceChildren();
      if(!audio) return;
      pulse.disabled=typeof AudioContext==='undefined';
      for(const clip of audio.clips) {
        const b=document.createElement('button');b.type='button';b.textContent=`Play ${clip.id.toUpperCase()}`;
        // The accessible name must contain the visible button text for voice input.
        b.setAttribute('aria-label',clip.label.includes(b.textContent)?clip.label:`${b.textContent}: ${clip.label}`);b.onclick=()=>void play(clip);
        b.disabled=typeof AudioContext==='undefined';buttons.append(b);
      }
      buttons.append(stopButton,pulseLabel,elapsed);
      status.textContent=typeof AudioContext==='undefined'?'Audio is unavailable in this browser. The score is still shown.':'Ready. Sound starts when you press Play.';
    },
  };
}
