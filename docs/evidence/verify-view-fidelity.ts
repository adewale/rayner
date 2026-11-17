// Verification experiment for review-2026-11-17.md, not a regression gate that requires the gaps
// to remain. Run: node docs/evidence/verify-view-fidelity.ts. A future stronger check may reject
// more probes. Each probe must still change the SVG; the clean and position controls must work.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { checkProject } from '../../tools/lib/explain-check.ts';
import { NullSink } from '../../src/timeline.ts';

const root = await mkdtemp(join(tmpdir(), 'rayner-view-fidelity-'));
const changes = {
  none: '',
  fill: "shape.style.fill='#00ff00';",
  stroke: "shape.style.stroke='#00ff00';",
  path: 'shape.setPolygon([[-1,-1],[1,-1],[-1,1]]);',
  clip: 'shape.clipBox=[-1,-1,0,1];',
  drawFraction: 'shape.style.drawFraction=0.3;',
  position: 'shape.shift([0.25,0]);',
};
const results: { damage: string; status: string; svgChanged: boolean; viewsChecked?: number; message?: string }[] = [];
for (const [damage, change] of Object.entries(changes)) {
  const folder = join(root, damage.toLowerCase());
  await mkdir(folder);
  await writeFile(join(folder, 'scene.ts'), `import {Scene,Group,Text,Polygon,toSvgString} from 'rayner';
import {view,stage} from 'rayner/explain';
export default class Example extends Scene {
  state={n:1};
  async construct(){
    stage(this,{heading:false});
    await this.step('one',{caption:'The count is one.'});
    const v=view(this, st=>new Group(
      new Text('Count '+st.n,{fontSize:0.8}).shift([0,2]),
      new Polygon([[-1,-1],[1,-1],[1,1],[-1,1]],{fill:'#ff0000',stroke:'#000000',strokeWidth:0.05})
    ),{place:false});
    this.add(v);
    const shape=v.current.children[1];
    const correct=toSvgString(this);
    ${change}
    this.correctSvg=correct;
    this.actualSvg=toSvgString(this);
    this.svgChanged=correct!==this.actualSvg;
    await this.wait(0.1);
  }
}`);
  const project = await collectProject(folder, { write: false });
  const actual = await new project.Scene(new NullSink()).run();
  const evidence = actual as typeof actual & { svgChanged: boolean; correctSvg: string; actualSvg: string };
  const svgChanged = evidence.svgChanged;
  assert.equal(svgChanged, damage !== 'none', `${damage}: damage must change the SVG`);
  await writeFile(join(folder, 'expected.svg'), evidence.correctSvg);
  await writeFile(join(folder, 'actual.svg'), evidence.actualSvg);
  try {
    const report = await checkProject(project, join(folder, 'checks'));
    results.push({ damage, status: 'passed', svgChanged, viewsChecked: report.scenarios[0]!.viewsChecked });
  } catch (error) {
    results.push({ damage, status: 'rejected', svgChanged, message: String(error) });
  }
}
assert.equal(results[0]!.status, 'passed', 'clean control');
assert.match(results.at(-1)!.message ?? '', /Views/, 'position control must fail the view comparison');
await writeFile(join(root, 'results.json'), JSON.stringify(results, null, 2) + '\n');
for (const result of results) console.log(JSON.stringify(result));
console.log(`Scenes, check reports and results: ${root}`);
