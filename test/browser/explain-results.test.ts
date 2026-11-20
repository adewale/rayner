import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectProject, ROOT} from '../../tools/lib/explain-project.ts';
import {buildExplainer, buildLoader} from '../../tools/lib/explain-build.ts';
import {serve} from '../../tools/lib/explain-serve.ts';
import {launch} from '../../tools/lib/browser.ts';
import {embedSizeProblems} from '../../tools/lib/explain-embed-size.ts';

test('transient responses replay through live links and Reset without changing durable state', {skip:!process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for response replay'}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-responses-'));
  let server: Awaited<ReturnType<typeof serve>> | undefined, browser: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    await writeFile(join(dir,'scene.ts'), `import{Scene,Text,Group,keyed}from'rayner';import{Machine,stage,view}from'rayner/explain';
export default class Responses extends Scene{static meta={id:'responses'};state={ready:true};shown={guide:'keep'};async construct(){const s=stage(this,{heading:false,style:'blueprint'});await this.step('try',{title:'Send a request',caption:'The response is shown after each request.'});const v=view(this,(st,sh)=>new Group(keyed(new Text(sh.result?.message??'Ready',{fontSize:.65}),'response')));await s.enter(v,{describe:()=>this.shown.result?.message??'Ready'});const m=new Machine(this,{start:{ready:true},events:['ok','denied','clear'],next:st=>({...st}),result:({event})=>event==='clear'?undefined:{message:event==='ok'?'200 success':'403 denied'},views:[v],runTime:.2});await m.send('clear');}}`);
    const project = await collectProject(dir,{write:false});
    await buildExplainer(project,join(dir,'scene.html'));
    await buildLoader(join(dir,'loader.js'));
    server = await serve(dir,0,'scene.html');browser = await launch();
    const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}), fresh = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const landed = async (p: typeof page, log: string) => p.waitForFunction(log=>document.querySelector<HTMLElement>('.live')?.dataset.drawn===log&&!document.querySelector('.stage[aria-busy]')&&!document.querySelector('svg.leaving'),log);
    const picture = (p: typeof page)=>p.locator('.stage svg:not(.leaving)').evaluate(e=>e.outerHTML);
    await page.goto(server.url+'/scene.html?step=try');await page.waitForSelector('#content[data-ready=true]');await landed(page,'');
    const initial = await picture(page);
    const chrome=[];
    for(const theme of ['light','dark']){await fresh.goto(server.url+'/scene.html?step=try&theme='+theme);await fresh.waitForSelector('#content[data-ready=true]');await landed(fresh,'');assert.equal(await fresh.locator('.stage svg:not(.leaving)').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(18, 58, 99)');chrome.push(await fresh.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor));}
    assert.notEqual(chrome[0],chrome[1],'chrome changes while the opaque stage retains its palette');
    for(const [event, log, response] of [['ok','ok','200 success'],['denied','ok,denied','403 denied']] as const){
      await page.locator(`.live-events button[data-event="${event}"]`).click();await landed(page,log);
      assert.match(await page.locator('#picture-summary').textContent()??'',new RegExp(response));
      await fresh.goto(page.url());await fresh.waitForSelector('#content[data-ready=true]');await landed(fresh,log);
      assert.equal(await picture(fresh),await picture(page),'a deep link replays the same transient result');
    }
    await page.locator('.live-tools button').last().click();await landed(page,'');
    assert.equal(await picture(page),initial);
    assert.match(await page.locator('#picture-summary').textContent()??'',/Ready/);
    execFileSync(process.execPath,[join(ROOT,'tools/explain.ts'),'build',dir,'--embed-sizes','--out',join(dir,'sized.html')],{encoding:'utf8'});
    assert.deepEqual(embedSizeProblems(JSON.parse(await readFile(join(dir,'sized.embed.json'),'utf8'))),[]);
    const receipt=JSON.parse(await readFile(join(dir,'sized.html.receipt.json'),'utf8'));
    assert.ok(receipt.components.embeddedFaceBytes>0 && receipt.components.embeddedFaceBytes<receipt.components.scriptBytes);
  } finally {await browser?.close();server?.close();await rm(dir,{recursive:true,force:true});}
});
