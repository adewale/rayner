/** Deliberately small statechart semantics: no guards, actions, history, delays or finals.
 * Inner states take events first, as in XState/SCXML (not Statemate priorities).
 * State is the active leaf configuration; an absent transition leaves it unchanged.
 */
export const coffeeStates = ['idle', 'grinding', 'brewing', 'ready'] as const;
export const coffeeEvents = ['POWER_ON', 'START', 'GROUND', 'POURED', 'TAKE', 'POWER_OFF'] as const;
export const playerEvents = ['PLAY', 'PAUSE', 'MUTE', 'UNMUTE'] as const;
export const frotherEvents = [...coffeeEvents, 'FROTH', 'STOP'] as const;
export type Chart = 'coffee' | 'missing' | 'parent' | 'player' | 'player-on' | 'frother' | 'independent' | 'steam';
export type Config = string[];
export type Edge = { from: string; event: string; to: string };
const cycle: Record<string, [string,string]> = {idle:['START','grinding'], grinding:['GROUND','brewing'], brewing:['POURED','ready'], ready:['TAKE','idle']};
export function start(chart: Chart): Config { return chart === 'player' ? ['paused','sound'] : chart === 'independent' ? ['off','still'] : ['off']; }
export function events(chart: Chart): readonly string[] { return chart === 'player' ? playerEvents : chart === 'player-on' ? ['POWER_ON',...playerEvents,'POWER_OFF'] : chart === 'frother' || chart === 'independent' || chart === 'steam' ? frotherEvents : coffeeEvents; }
export function send(chart: Chart, config: Config, event: string): { config: Config; handled: boolean } {
  const c = [...config];
  if (chart === 'player' || chart === 'player-on') {
    if (c[0] === 'off') return event === 'POWER_ON' ? {config:['paused','sound'],handled:true} : {config:c,handled:false};
    if (event === 'POWER_OFF' && chart === 'player-on') return {config:['off'],handled:true};
    const swaps: Record<string,[number,string,string]> = {PLAY:[0,'paused','playing'], PAUSE:[0,'playing','paused'], MUTE:[1,'sound','muted'], UNMUTE:[1,'muted','sound']};
    const t = swaps[event];
    if (t && c[t[0]] === t[1]) { c[t[0]] = t[2]; return {config:c,handled:true}; }
    return {config:c,handled:false};
  }
  const phase = c[0]!;
  if ((chart === 'independent' || (chart === 'frother' && phase !== 'off') || (chart === 'steam' && phase === 'brewing')) && ((event === 'FROTH' && c[1] === 'still') || (event === 'STOP' && c[1] === 'frothing'))) {
    c[1] = event === 'FROTH' ? 'frothing' : 'still'; return {config:c,handled:true};
  }
  if (event === 'POWER_ON' && phase === 'off') return {config: chart === 'frother' ? ['idle','still'] : chart === 'independent' ? ['idle',c[1]!] : ['idle'],handled:true};
  if (event === 'POWER_OFF' && phase !== 'off' && !(chart === 'missing' && phase === 'brewing')) return {config:chart === 'independent' ? ['off',c[1]!] : ['off'],handled:true};
  const edge = cycle[phase];
  if (edge && event === edge[0]) {
    const to = edge[1];
    return {config:chart === 'frother' || chart === 'independent' ? [to,c[1]!] : chart === 'steam' && to === 'brewing' ? [to,'still'] : [to],handled:true};
  }
  return {config:c,handled:false};
}
export const name = (c: Config) => c.join(' · ');
export function graph(chart: Chart) {
  const states: Config[] = [start(chart)], edges: Edge[] = [], known = new Set([name(states[0]!)]);
  for(let i=0;i<states.length;i++) for(const event of events(chart)) {
    const result=send(chart,states[i]!,event);
    if(result.handled) { edges.push({from:name(states[i]!),event,to:name(result.config)}); if(!known.has(name(result.config))) {known.add(name(result.config));states.push(result.config);} }
  }
  return {states,edges};
}
export function run(chart: Chart, sequence: readonly string[], from = start(chart)) { return sequence.reduce((c,e)=>send(chart,c,e).config,from); }
export const structured = {coffee:{boxes:5,arrows:9},parent:{boxes:6,arrows:6},player:{boxes:4,arrows:4},'player-on':{boxes:6,arrows:6},frother:{boxes:8,arrows:8},independent:{boxes:8,arrows:8},steam:{boxes:8,arrows:8}} as const;
/** Binary independent features: each event flips one bit, in one of 2^(n-1) contexts. */
export const featureCounts = (n:number) => ({flatStates:2**n, flatArrows:n*2**n, chartStates:2*n, chartArrows:2*n});
export function flatPlayerNext(config: Config,event:string): Config {
  // Explicit flat transitions generated independently from each row/column state.
  const table:Record<string,Record<string,string>>={
    'paused · sound':{PLAY:'playing · sound',MUTE:'paused · muted'},
    'playing · sound':{PAUSE:'paused · sound',MUTE:'playing · muted'},
    'paused · muted':{PLAY:'playing · muted',UNMUTE:'paused · sound'},
    'playing · muted':{PAUSE:'paused · muted',UNMUTE:'playing · sound'},
  };
  return (table[name(config)]?.[event] ?? name(config)).split(' · ');
}
export const transfer = { inside:graph('frother').states.length, outside:graph('independent').states.length, steam:graph('steam').states.length, steamNames:graph('steam').states.map(name) };
