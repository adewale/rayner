export type Host = 'informed' | 'random';
// Fix the first choice at door 0. An informed host leaves the prize available;
// a random host picks the other closed door without knowing the prize location.
// For the informed host's tied case, each other door is equally likely to remain.
export function monty(doors: number, host: Host) {
  if (!Number.isInteger(doors) || doors < 3 || doors > 100) throw new Error('Use 3 to 100 doors');
  if (!['informed', 'random'].includes(host)) throw new Error('Unknown host rule');
  const stay = doors - 1, swap = host === 'informed' ? (doors - 1) ** 2 : doors - 1;
  const total = doors * (doors - 1), discarded = total - stay - swap;
  return {doors, host, stay, swap, discarded, total, continuing: stay + swap,
    stayChance: stay / (stay + swap), switchChance: swap / (stay + swap),
    continuationChance: (stay + swap) / total, opened: doors - 2};
}
export function threeDoorWorlds(choice: number, host: Host) {
  if (![0,1,2].includes(choice)) throw new Error('Choose door A, B or C');
  const name=(i:number)=>'ABC'[i]!;
  return [0,1,2].flatMap(prize=>{
    const possible=[0,1,2].filter(i=>i!==choice);
    if(host==='informed') return [{prize:name(prize),opened:possible.filter(i=>i!==prize).map(name).join(' or '),
      stay:prize===choice?'win':'lose',swap:prize===choice?'lose':'win'}];
    return possible.map(opened=>({prize:name(prize),opened:`${name(opened)}: ${opened===prize?'car':'goat'}`,
      stay:opened===prize?'ends':prize===choice?'win':'lose',swap:opened===prize?'ends':prize===choice?'lose':'win'}));
  });
}
export function montyExample(choice: number, strategy: 'stay'|'switch') {
  if (![0,1,2].includes(choice) || !['stay','switch'].includes(strategy)) throw new Error('Invalid Monty Hall choice');
  const prize=2, opened=[0,1,2].find(i=>i!==choice&&i!==prize)!;
  const offered=[0,1,2].find(i=>i!==choice&&i!==opened)!;
  const final=strategy==='stay'?choice:offered;
  return {choice,prize,opened,offered,final,won:final===prize,strategy};
}
/** How the host picks the door he opens: `leftmost` knows the prize and, given two goat doors, always opens the first (A before B before C). */
export type Opener = Host | 'leftmost';
/**
 * Every (car, opened door) round for a first pick, with its chance in sixths. The car is behind
 * each door a third of the time; the host then opens one of the two unchosen doors by his rule.
 * Unlike threeDoorWorlds, the informed host's two goat openings stay separate rounds.
 */
export function threeDoorCells(choice: number, host: Opener) {
  if (![0,1,2].includes(choice)) throw new Error('Choose door A, B or C');
  if (!['informed','random','leftmost'].includes(host)) throw new Error('Unknown host rule');
  const name=(i:number)=>'ABC'[i]!;
  return [0,1,2].flatMap(prize=>{
    const possible=[0,1,2].filter(i=>i!==choice), goats=possible.filter(i=>i!==prize);
    const opens=host==='random'?possible:host==='informed'?goats:[goats[0]!];
    return opens.map(opened=>{
      const left=possible.find(i=>i!==opened)!, ends=opened===prize;
      return {prize:name(prize),opened:name(opened),shows:ends?'car':'goat',sixths:2/opens.length,
        stay:ends?'ends':prize===choice?'win':'lose',swap:ends?'ends':left===prize?'win':'lose'};
    });
  });
}
/** Once the host has opened `opened` and shown a goat: the sixths that show it, those where switching wins, and both chances. */
export function oddsAfter(choice: number, host: Opener, opened: string) {
  const seen=threeDoorCells(choice,host).filter(c=>c.opened===opened&&c.shows==='goat');
  const sixths=seen.reduce((n,c)=>n+c.sixths,0), swapSixths=seen.filter(c=>c.swap==='win').reduce((n,c)=>n+c.sixths,0);
  if(!sixths) throw new Error(`The ${host} host never shows a goat behind ${opened}`);
  return {opened,sixths,swapSixths,stayChance:(sixths-swapSixths)/sixths,switchChance:swapSixths/sixths};
}
