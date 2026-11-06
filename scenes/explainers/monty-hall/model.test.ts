import { test } from 'node:test';
import { isRefusal } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { monty, threeDoorWorlds, montyExample, threeDoorCells, oddsAfter, roundStart, roundNext, roundDoor, roundResult, ROUND_EVENTS } from './model.ts';
import type { Round, RoundEvent } from './model.ts';

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<2e-14,`${a} != ${b}`);

// Enumerate prize and remaining-door choices directly. An informed host keeps
// the prize when it is unchosen; a random host chooses a remaining door uniformly.
test('host-conditioned odds and displayed rows match complete physical worlds',()=>{
  for(let n=3;n<=25;n++) for(const host of ['informed','random'] as const) {
    let stay=0,swap=0,continues=0;
    for(let prize=0;prize<n;prize++) for(let other=1;other<n;other++) {
      if(host==='informed'&&prize!==0) {swap++;continues++;}
      else if(prize===0) {stay++;continues++;}
      else if(other===prize) {swap++;continues++;}
    }
    const m=monty(n,host);
    close(m.stayChance,stay/continues);close(m.switchChance,swap/continues);close(m.continuationChance,continues/(n*(n-1)));
  }
  close(monty(100,'informed').switchChance,.99);close(monty(100,'random').continuationChance,.02);
  for(const choice of [0,1,2]) for(const host of ['informed','random'] as const) {
    const worlds=threeDoorWorlds(choice,host);
    // Independently open physical doors, then inspect the chosen and remaining
    // doors. Aggregate only the informed host's equivalent goat openings.
    const expected:{prize:string;opened:string;stay:string;swap:string}[]=[];
    for(let prize=0;prize<3;prize++) {
      const openings:{door:string;stay:string;swap:string}[]=[];
      for(let opened=0;opened<3;opened++) {
        if(opened===choice||(host==='informed'&&opened===prize)) continue;
        let remaining=-1;
        for(let door=0;door<3;door++) if(door!==choice&&door!==opened) remaining=door;
        const ended=opened===prize;
        openings.push({door:'ABC'[opened]!,
          stay:ended?'ends':choice===prize?'win':'lose',
          swap:ended?'ends':remaining===prize?'win':'lose'});
      }
      if(host==='informed') {
        assert.ok(openings.length>0);
        const {stay,swap}=openings[0]!;
        assert.ok(openings.every(o=>o.stay===stay&&o.swap===swap));
        expected.push({prize:'ABC'[prize]!,opened:openings.map(o=>o.door).join(' or '),stay,swap});
      } else for(const opening of openings) expected.push({prize:'ABC'[prize]!,
        opened:`${opening.door}: ${opening.door==='ABC'[prize]?'car':'goat'}`,
        stay:opening.stay,swap:opening.swap});
    }
    assert.deepEqual(worlds,expected,`every displayed ${host} host row with initial door ${'ABC'[choice]}`);
    assert.equal(worlds.length,host==='informed'?3:6);
    assert.equal(worlds.filter(w=>w.stay==='win').length,host==='informed'?1:2);
    assert.equal(worlds.filter(w=>w.swap==='win').length,2);
    assert.equal(worlds.filter(w=>w.stay==='ends').length,host==='informed'?0:2);
    for(const strategy of ['stay','switch'] as const) {
      const e=montyExample(choice,strategy);
      assert.notEqual(e.opened,e.prize);assert.notEqual(e.opened,choice);
      assert.equal(e.final,strategy==='stay'?choice:e.offered);assert.equal(e.won,e.final===e.prize);
    }
  }
});

test('each round’s chance and the odds after a seen door match a host simulated door by door',()=>{
  // Independently: weight each (car, opened) pair by 1/3 for the car times the host's chance of
  // opening that door, in integer twelfths, so only the final ratios are floats.
  for(const choice of [0,1,2]) for(const host of ['informed','random','leftmost','coin'] as const) {
    const twelfths=new Map<string,number>();
    for(let prize=0;prize<3;prize++) {
      const unchosen=[0,1,2].filter(d=>d!==choice);
      // The coin host may open the car (heads) only when the first pick is wrong.
      const allowed=host==='random'||(host==='coin'&&prize!==choice)?unchosen:unchosen.filter(d=>d!==prize);
      const picks=host==='leftmost'?[Math.min(...allowed)]:allowed;
      for(const d of picks) twelfths.set('ABC'[prize]!+'ABC'[d]!,4/picks.length);
    }
    const cells=threeDoorCells(choice,host);
    assert.equal(cells.length,twelfths.size,`${host} host, pick ${'ABC'[choice]}: one cell per possible round`);
    assert.equal(cells.reduce((n,c)=>n+c.sixths,0),6);
    for(const c of cells) {
      assert.equal(c.sixths*2,twelfths.get(c.prize+c.opened),`${host}: ${c.prize}${c.opened}`);
      const left='ABC'[[0,1,2].find(d=>d!==choice&&'ABC'[d]!==c.opened)!]!;
      assert.equal(c.shows,c.opened===c.prize?'car':'goat');
      assert.equal(c.swap,c.shows==='car'?'ends':left===c.prize?'win':'lose');
      assert.equal(c.stay,c.shows==='car'?'ends':'ABC'[choice]===c.prize?'win':'lose');
    }
    for(const opened of [0,1,2].filter(d=>d!==choice).map(d=>'ABC'[d]!)) {
      let stay=0,swap=0;
      for(const [round,w] of twelfths) if(round[1]===opened&&round[0]!==opened) {
        if(round[0]==='ABC'[choice]) stay+=w; else swap+=w;
      }
      if(stay+swap===0) { assert.throws(()=>oddsAfter(choice,host,opened),/never shows a goat/); continue; }
      const o=oddsAfter(choice,host,opened);
      close(o.switchChance,swap/(stay+swap));close(o.stayChance,stay/(stay+swap));
    }
  }
  // The values the scene and its check questions state.
  for(const choice of [0,1,2]) for(const opened of [0,1,2].filter(d=>d!==choice).map(d=>'ABC'[d]!)) {
    close(oddsAfter(choice,'informed',opened).switchChance,2/3);
    close(oddsAfter(choice,'random',opened).switchChance,1/2);
  }
  close(oddsAfter(0,'leftmost','C').switchChance,1);close(oddsAfter(0,'leftmost','B').switchChance,1/2);
  close(monty(4,'informed').switchChance,3/4);close(monty(100,'random').switchChance,1/2);
  // Check 2's coin-tossed host, by Bayes: (1/2·1/3 + 1/2·1/6) / (1/2·1/2 + 1/2·1/3) = 3/5, from the sixths the scene sums.
  {
    const i=oddsAfter(0,'informed','B'),r=oddsAfter(0,'random','B');
    close((i.swapSixths+r.swapSixths)/(i.sixths+r.sixths),3/5);
  }
  // Check 1: the coin host knows where the car is, yet his rounds are the random host's, cell for cell.
  for(const choice of [0,1,2]) assert.deepEqual(threeDoorCells(choice,'coin'),threeDoorCells(choice,'random'));
  close(oddsAfter(0,'coin','B').switchChance,1/2);
  // Check 2: the car behind A 40% of the time, B and C 30% each. By Bayes, with the pick A and B opened:
  // host who knows, stay .4·½ against switch .3·1; random host, stay .4·½ against switch .3·½.
  close(oddsAfter(0,'informed','B',[4,3,3]).switchChance,.3/(.2+.3));
  close(oddsAfter(0,'random','B',[4,3,3]).switchChance,.15/(.2+.15));
  for(const c of threeDoorCells(0,'informed',[4,3,3])) if(c.prize==='C') assert.equal(c.opened,'B');
  assert.throws(()=>threeDoorCells(0,'informed',[1,-1,1]),/non-negative/);
  assert.throws(()=>threeDoorCells(0,'psychic' as never),/Unknown host rule/);
});

// The scene's sentences about each host's rule, over every first pick: with the car behind one
// unchosen door, the host who knows always opens the other one, the only goat left to him; the
// random host opens that door in only half of those rounds and the car in the rest; and the host
// who knows never opens the car.
test('the host who knows always opens the only goat left when your pick is wrong, and the random host opens it in only half those rounds',()=>{
  for(const choice of [0,1,2]) for(const prize of [0,1,2].filter(d=>d!==choice)) {
    const goat=[0,1,2].find(d=>d!==choice&&d!==prize)!,car='ABC'[prize]!,other='ABC'[goat]!;
    const round=(host:'informed'|'random')=>threeDoorCells(choice,host).filter(c=>c.prize===car);
    assert.deepEqual(round('informed').map(c=>[c.opened,c.shows,c.sixths]),[[other,'goat',2]],`host who knows, pick ${'ABC'[choice]}, car ${car}`);
    assert.deepEqual(round('random').map(c=>[c.opened,c.shows,c.sixths]).sort(),[[car,'car',1],[other,'goat',1]].sort(),`random host, pick ${'ABC'[choice]}, car ${car}`);
  }
  for(const choice of [0,1,2]) for(const prior of [[1,1,1],[4,3,3],[1,0,5]])
    assert.ok(threeDoorCells(choice,'informed',prior).every(c=>c.shows==='goat'),'the host who knows never opens the car');
});

// The round machine the doors step plays: every legal round it reaches, walked event by event, is a
// cell of the strip, and each cell is reached, with the same winner for staying and for switching.
test('every round the round machine can play is a cell of the strip, with the strip’s winner',()=>{
  for(const host of ['informed','random'] as const) {
    let states=0;
    const seen=new Set<string>(),ended:Round[]=[];
    const queue:Round[]=[roundStart(host)];
    while(queue.length) {
      const r=queue.shift()!,key=JSON.stringify(r);
      if(seen.has(key)) continue;
      seen.add(key);states++;
      if(r.car!==null) ended.push(r);
      for(const e of ROUND_EVENTS) {
        const next=roundNext(r,e);
        if(isRefusal(next)) continue;
        // The rules' refusals: he never opens your door, and the host who knows never opens the car.
        if(e.startsWith('open')) { assert.notEqual(next.opened,r.pick); if(host==='informed') assert.equal(next.shows,'goat'); }
        queue.push(next);
      }
    }
    assert.equal(states,host==='informed'?46:52);
    assert.ok(ROUND_EVENTS.every(e=>isRefusal(roundNext(roundStart(host),e))||e.startsWith('pick')),'nothing but a pick starts a round');
    for(const choice of [0,1,2]) {
      const mine=ended.filter(r=>r.pick===choice);
      const cells=threeDoorCells(choice,host).map(c=>JSON.stringify([c.prize,c.opened,c.shows]));
      assert.deepEqual([...new Set(mine.map(r=>JSON.stringify(['ABC'[r.car!],'ABC'[r.opened!],r.shows])))].sort(),[...cells].sort(),`${host}, pick ${'ABC'[choice]}`);
      for(const r of mine) {
        const cell=threeDoorCells(choice,host).find(c=>c.prize==='ABC'[r.car!]&&c.opened==='ABC'[r.opened!])!;
        const said=roundResult(r)==='over'?'ends':roundResult(r);
        assert.equal(said,r.decision==='switch'?cell.swap:cell.stay,JSON.stringify(r));
        if(r.decision==='switch') assert.notEqual(roundDoor(r),r.pick);
      }
    }
  }
});

// Each refusal names the rule that forbids the move, in the reader's words.
test('the round machine says which rule refuses a move',()=>{
  const why=(host:'informed'|'random',events:RoundEvent[],event:RoundEvent)=>{
    const r=events.reduce<Round>((at,e)=>roundNext(at,e) as Round,roundStart(host)),refused=roundNext(r,event);
    return isRefusal(refused)?refused.reason:undefined;
  };
  assert.equal(why('informed',[],'open B: goat'),'the host opens a door only after you pick one');
  assert.equal(why('informed',[],'stay'),'you stay or switch once the host has opened a door');
  assert.equal(why('informed',[],'car behind A'),'the car is shown once you have stayed or switched');
  assert.equal(why('informed',['pick A'],'pick B'),'you picked door A already, and you pick once');
  assert.equal(why('informed',['pick A'],'open A: goat'),'door A is yours, and the host never opens your door');
  assert.equal(why('informed',['pick A'],'open B: car'),'the host knows where the car is, and never opens its door');
  assert.equal(why('random',['pick A'],'open B: car'),undefined);
  assert.equal(why('informed',['pick A','open B: goat'],'open C: goat'),'the host opened door B already, and he opens one door');
  assert.equal(why('informed',['pick A','open B: goat','stay'],'switch'),'you chose to stay already');
  assert.equal(why('informed',['pick A','open B: goat','stay'],'car behind B'),'door B is open and shows a goat');
  assert.equal(why('informed',['pick A','open B: goat','stay','car behind C'],'car behind A'),'the car was shown behind door C already');
  assert.equal(why('random',['pick A','open B: car'],'switch'),'the host showed the car behind door B, so the round is over');
  assert.equal(why('random',['pick A','open B: car'],'car behind C'),'the car was shown behind door B already');
});
