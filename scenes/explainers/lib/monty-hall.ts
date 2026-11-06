import { refuse } from '../../../src/index.ts';
import type { Refusal } from '../../../src/index.ts';
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
/**
 * How the host picks the door he opens: `leftmost` knows the prize and, given two goat doors, always opens the first
 * (A before B before C). `coin` knows the prize: when the first pick is right he opens a goat at random; when it is
 * wrong he tosses a coin, heads he opens the car (and the round ends), tails the other goat.
 */
export type Opener = Host | 'leftmost' | 'coin';
/**
 * Every (car, opened door) round for a first pick, with its chance in sixths. The car is behind
 * each door a third of the time; the host then opens one of the two unchosen doors by his rule.
 * Unlike threeDoorWorlds, the informed host's two goat openings stay separate rounds.
 */
/** `prior` weighs where the car is hidden (default: each door alike); the sixths still sum to 6. */
export function threeDoorCells(choice: number, host: Opener, prior: readonly number[] = [1,1,1]) {
  if (![0,1,2].includes(choice)) throw new Error('Choose door A, B or C');
  if (!['informed','random','leftmost','coin'].includes(host)) throw new Error('Unknown host rule');
  if (prior.length!==3 || prior.some(w=>!(w>=0)) || !(prior[0]!+prior[1]!+prior[2]!>0)) throw new Error('Give three non-negative weights');
  const name=(i:number)=>'ABC'[i]!, total=prior[0]!+prior[1]!+prior[2]!;
  return [0,1,2].flatMap(prize=>{
    const possible=[0,1,2].filter(i=>i!==choice), goats=possible.filter(i=>i!==prize);
    const opens=host==='random'?possible:host==='informed'?goats:host==='coin'?(prize===choice?goats:possible.filter(i=>i===prize||goats.includes(i))):[goats[0]!];
    return opens.map(opened=>{
      const left=possible.find(i=>i!==opened)!, ends=opened===prize;
      return {prize:name(prize),opened:name(opened),shows:ends?'car':'goat',sixths:6*prior[prize]!/total/opens.length,
        stay:ends?'ends':prize===choice?'win':'lose',swap:ends?'ends':left===prize?'win':'lose'};
    });
  });
}
/** Once the host has opened `opened` and shown a goat: the sixths that show it, those where switching wins, and both chances. */
export function oddsAfter(choice: number, host: Opener, opened: string, prior?: readonly number[]) {
  const seen=threeDoorCells(choice,host,prior).filter(c=>c.opened===opened&&c.shows==='goat');
  const sixths=seen.reduce((n,c)=>n+c.sixths,0), swapSixths=seen.filter(c=>c.swap==='win').reduce((n,c)=>n+c.sixths,0);
  if(!sixths) throw new Error(`The ${host} host never shows a goat behind ${opened}`);
  return {opened,sixths,swapSixths,stayChance:(sixths-swapSixths)/sixths,switchChance:swapSixths/sixths};
}

/**
 * One round a reader could play, as the reader sees it: pick a door, the host opens another, stay
 * or switch, and the car is shown. Where the car is stays unknown until a door shows it, so each
 * state is what the reader knows. An informed host never opens your door or the car; a random
 * host may open the car, which ends the round. `roundNext` refuses every move the rules forbid.
 */
export type Letter = 'A' | 'B' | 'C';
export type RoundEvent = `pick ${Letter}` | `open ${Letter}: goat` | `open ${Letter}: car` | 'stay' | 'switch' | `car behind ${Letter}`;
export interface Round {
  host: Host;
  /** The door you picked first (0, 1, 2), or null before you pick. */
  pick: number | null;
  /** The door the host opened, and what it showed. */
  opened: number | null;
  shows: 'goat' | 'car' | null;
  decision: 'stay' | 'switch' | null;
  /** Where the car was shown: behind the host's door (the round ends there) or by the reveal. */
  car: number | null;
}
const LETTERS: readonly Letter[] = ['A', 'B', 'C'];
export const ROUND_EVENTS: readonly RoundEvent[] = [
  ...LETTERS.map((d) => `pick ${d}` as const),
  ...LETTERS.map((d) => `open ${d}: goat` as const),
  ...LETTERS.map((d) => `open ${d}: car` as const),
  'stay',
  'switch',
  ...LETTERS.map((d) => `car behind ${d}` as const),
];
export function roundStart(host: Host): Round {
  if (!['informed', 'random'].includes(host)) throw new Error('Unknown host rule');
  return { host, pick: null, opened: null, shows: null, decision: null, car: null };
}
/** Your door now: the first pick, or after a switch the other closed door. */
export function roundDoor(r: Round): number | null {
  if (r.pick === null) return null;
  return r.decision === 'switch' ? [0, 1, 2].find((i) => i !== r.pick && i !== r.opened)! : r.pick;
}
/** How the round ended: won or lost once the car is shown after your choice, over when the host opened the car. */
export function roundResult(r: Round): 'win' | 'lose' | 'over' | null {
  if (r.car === null) return null;
  if (r.decision === null) return 'over';
  return roundDoor(r) === r.car ? 'win' : 'lose';
}
/** The round after one event, or the rules' refusal, saying which rule forbids it. Pure. */
export function roundNext(r: Round, event: RoundEvent): Round | Refusal {
  const door = (letter: string) => LETTERS.indexOf(letter as Letter);
  let m: RegExpMatchArray | null;
  if ((m = event.match(/^pick ([ABC])$/)))
    return r.pick === null ? { ...r, pick: door(m[1]!) } : refuse(`you picked door ${LETTERS[r.pick]} already, and you pick once`);
  if ((m = event.match(/^open ([ABC]): (goat|car)$/))) {
    const i = door(m[1]!), shows = m[2] as 'goat' | 'car';
    // He opens once, after your pick, never your door; the host who knows never opens the car.
    if (r.pick === null) return refuse('the host opens a door only after you pick one');
    if (r.opened !== null) return refuse(`the host opened door ${LETTERS[r.opened]} already, and he opens one door`);
    if (i === r.pick) return refuse(`door ${LETTERS[i]} is yours, and the host never opens your door`);
    if (shows === 'car' && r.host === 'informed') return refuse('the host knows where the car is, and never opens its door');
    return { ...r, opened: i, shows, car: shows === 'car' ? i : null };
  }
  if (event === 'stay' || event === 'switch') {
    // Only once he has shown a goat: the car behind his door ended the round.
    if (r.shows === 'car') return refuse(`the host showed the car behind door ${LETTERS[r.opened!]}, so the round is over`);
    if (r.shows === null) return refuse('you stay or switch once the host has opened a door');
    if (r.decision !== null) return refuse(`you chose to ${r.decision} already`);
    return { ...r, decision: event };
  }
  if ((m = event.match(/^car behind ([ABC])$/))) {
    const i = door(m[1]!);
    // Shown after your choice, behind a door still closed: never behind the goat he opened.
    if (r.car !== null) return refuse(`the car was shown behind door ${LETTERS[r.car]} already`);
    if (r.decision === null) return refuse('the car is shown once you have stayed or switched');
    if (i === r.opened) return refuse(`door ${LETTERS[i]} is open and shows a goat`);
    return { ...r, car: i };
  }
  throw new RangeError(`Unknown round event ${event}`);
}
