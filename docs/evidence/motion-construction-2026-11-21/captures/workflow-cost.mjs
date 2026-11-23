import {writeFile,readFile} from 'node:fs/promises';
import {Scene} from '../../src/index.ts';
import {Machine} from '../../explain/machine.ts';
import {exploreMachines} from '../../tools/lib/explain-check.ts';
async function cost(states, withResult) {
  let resultCalls=0, nextCalls=0;
  class Chain extends Scene {
    state = {n:0};
    async construct() {
      const machine = new Machine(this, {
        start:this.state, events:['step'], views:[], limit:states,
        next: st => {nextCalls++; return st.n+1<states ? {n:st.n+1} : undefined;},
        ...(withResult && {result: ({after}) => {resultCalls++; return {number:after.n};}}),
      });
      await this.step('offer');
      machine.offer();
    }
  }
  const source = await new Chain({async frame(){}}).run();
  // Independent inventory: n durable states, n-1 accepted edges. Set layouts explicitly
  // and skip downstream animation checking to isolate just context construction.
  const t=performance.now();
  const [walk] = await exploreMachines(source,Chain,new Map(),{events:[]});
  return {states:walk.states,sampled:walk.sampled,edges:states-1,resultCalls,nextCalls,elapsedMs:Math.round(performance.now()-t)};
}

const before=JSON.parse(await readFile(new URL('../adversarial-astra/causal/paint-and-cost.json',import.meta.url),'utf8')).cost;
const after=[];for(const n of [32,64,128,256])after.push({plain:await cost(n,false),responses:await cost(n,true)});
const report={inputs:'Same cost() function and state counts as the archived adversarial probe. No outgoing animations selected.',before,after};
await writeFile(new URL('./workflow-cost.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
