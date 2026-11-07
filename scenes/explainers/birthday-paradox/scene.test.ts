import { test } from 'node:test';
import assert from 'node:assert/strict';
import { birthdayChance, birthdayStory, evenOdds, pairCount, pairShortcut, dateOf } from './model.ts';
import BirthdayParadox from './scene.ts';
import { explainerMeta } from '../../../tools/lib/explain-intent.ts';

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<2e-14,`${a} != ${b}`);

test('the birthday story: thresholds, pairs, the shortcut, dates, and the answer and check questions it asks',()=>{
  // 23 people for an even chance of any match; 254 for someone matching one person, who then has 253 others.
  assert.equal(evenOdds('any'),23);assert.equal(evenOdds('one'),254);
  assert.ok(birthdayChance(22,'any')<.5&&birthdayChance(23,'any')>=.5);
  assert.ok(birthdayChance(253,'one')<.5&&birthdayChance(254,'one')>=.5);
  assert.equal(pairCount(23),253);
  for(let n=1;n<=60;n++){
    let pairs=0;for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)pairs++;
    assert.equal(pairCount(n),pairs);
    // The shortcut is exact for comparisons against one fixed birthday.
    close(pairShortcut(n-1),birthdayChance(n,'one'));
  }
  assert.equal(explainerMeta(BirthdayParadox, 'scenes/explainers/birthday-paradox').answer,`A room of ${evenOdds('any')} people gives a better than even chance that two share a birthday, because ${evenOdds('any')} people make ${pairCount(evenOdds('any'))} pairs, each a chance to match`);
  // Dates of a 365-day year, checked against the calendar of a non-leap year.
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for(let day=1;day<=365;day++){
    const d=new Date(Date.UTC(2023,0,day));
    assert.equal(dateOf(day),`${d.getUTCDate()} ${months[d.getUTCMonth()]}`);
  }
  assert.throws(()=>dateOf(366));
  const room=birthdayStory(23);
  assert.deepEqual(room.shared,[{day:116,date:'26 Apr',people:2},{day:31,date:'31 Jan',people:2}]);
  assert.equal((100*room.shortcut).toFixed(2),'50.05');assert.equal((100*room.chance).toFixed(2),'50.73');
  assert.deepEqual(birthdayStory(10).shared,[]);
  // The pairs step draws the room's matched pairs: one pair per repeated date in the rooms of 23 and 40, none in the room of 10.
  for(const n of [10,23,40]){
    const story=birthdayStory(n);
    assert.equal(story.matchedPairs.length,story.shared.reduce((sum,d)=>sum+pairCount(d.people),0));
    for(const [i,j] of story.matchedPairs) assert.ok(i<j&&story.sample.first[i]===story.sample.first[j]);
    // The estimate step says the pair shortcut is within a percentage point of the exact chance.
    assert.ok(story.chance-story.shortcut>0&&story.chance-story.shortcut<.01);
    // It also says the shortcut is the chance of sharing one birthday with as many other people as the room has pairs.
    close(story.shortcut,birthdayChance(story.pairs+1,'one'));
  }
  assert.equal(room.matchedPairs.length,2);
  // Transfer exercises: two rooms of 23 merged, and a 100-day year.
  assert.equal(pairCount(46),1035);assert.equal(pairCount(46)-2*pairCount(23),23*23);assert.ok(23*23>2*pairCount(23));
  assert.equal(evenOdds('any',100),13);assert.equal(pairCount(13),78);
  assert.equal((100*birthdayChance(13,'any',100)).toFixed(1),'55.7');assert.equal((100*birthdayChance(12,'any',100)).toFixed(1),'49.7');
  assert.equal(evenOdds('one',100)-1,69);close(pairShortcut(69,100),birthdayChance(70,'one',100));
  assert.equal((100*birthdayChance(70,'one',100)).toFixed(1),'50.0');assert.equal((100*birthdayChance(69,'one',100)).toFixed(1),'49.5');
  const [merged,calendar]=explainerMeta(BirthdayParadox, 'scenes/explainers/birthday-paradox').checks!;
  assert.match(merged!.answer, /529 new pairs/);
  assert.match(merged!.answer, /1,035 pairs, compared with 506/);
  assert.match(calendar!.answer, /13 people suffice/);
  assert.match(calendar!.answer, /55.7%/);
  assert.match(calendar!.answer, /12 people.*49.7%/);

});
