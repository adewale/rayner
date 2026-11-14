import assert from 'node:assert/strict';
import test from 'node:test';
import { galleryTile } from '../tools/repo/lib/explain-gallery.ts';
import { EXPLAINERS, PRODUCT } from '../scenes/explainers/catalog.ts';

test('catalog tiles open the beginning of every lesson without changing curated posters', () => {
  for (const item of EXPLAINERS) {
    const tile = galleryTile({ id: item.id, title: item.id, lang: 'en' });
    assert.match(tile, new RegExp(`href="${item.id}\\.html"`), item.id);
    assert.ok(!tile.includes('?step='), `${item.id}: the poster step ${item.step} must not become the entry step`);
    assert.match(tile, new RegExp(`src="${item.id}\\.png"`), item.id);
  }
  assert.match(galleryTile({ id: 'quotient-familial', title: 'Le quotient familial', lang: 'fr' }, true), /hreflang="fr".*loading="eager".*lang="fr"/);
});

test('gallery entries and subset cards come from the selected catalog', async () => {
  const {galleryPage}=await import('../tools/repo/lib/explain-gallery.ts');
  const catalog={product:{entry:{id:'other',step:'question',settings:{case:'two'},label:'Start here'}},scenes:[
    {id:'featured',title:'Featured',lang:'en',group:'topic' as const,tier:'showcase' as const},
    {id:'other',title:'Other',lang:'en',group:'topic' as const,tier:'showcase' as const},
    {id:'recipe',title:'Recipe',lang:'en',group:'toolchain' as const,tier:'gallery' as const},
    {id:'engine',title:'Engine',lang:'en',group:'toolchain' as const,tier:'showcase' as const},
    {id:'probe',title:'Probe',lang:'en',group:'topic' as const,tier:'coverage' as const},
  ]};
  const full=galleryPage(catalog,'');
  assert.ok(full.includes('other.html?case=two&amp;step=question'));
  assert.ok(full.indexOf('src="other.png"')<full.indexOf('src="featured.png"'));
  assert.ok(full.includes('src="recipe.png"'),'the gallery tier is listed');
  const lead=full.slice(0,full.indexOf('<details'));
  assert.ok(lead.includes('src="engine.png"')&&!lead.includes('src="recipe.png"'),'a showcase toolchain lesson leads with the subjects; the rest stay behind their own summary');
  assert.equal((full.match(/src="engine\.png"/g)??[]).length,1,'a featured lesson is not listed twice');
  assert.ok(!full.includes('probe.png')&&!full.includes('probe.html'),'a coverage scene gets no card');
  const subset=galleryPage({...catalog,scenes:[catalog.scenes[1]!]},'',false);
  assert.equal((subset.match(/<li/g)??[]).length,2,'one selected card and the evidence link');
  assert.ok(!subset.includes('featured.png')&&!subset.includes('recipe.png'));
  assert.ok(!subset.includes('<details')&&!subset.includes('embed-lab.html'));
});


test('the product entry is a showcase subject, and the showcase stays mostly subjects', () => {
  const entry = EXPLAINERS.find(scene => scene.id === PRODUCT.entry.id)!;
  assert.equal(entry.group, 'topic');
  assert.equal(entry.tier, 'showcase');
  const showcase = EXPLAINERS.filter(scene => scene.tier === 'showcase');
  assert.ok(showcase.filter(scene => scene.group === 'toolchain').length * 4 <= showcase.length, 'toolchain lessons are at most a quarter of the showcase');
});

test('every showcase explainer was checked against the real system, run live or recorded, and the first after the entry ran it live', async () => {
  const { readFileSync } = await import('node:fs');
  const { intentMeta, parseIntent } = await import('../explain/intent.ts');
  const grade = (id: string) => {
    const file = `scenes/explainers/${id}/script.md`;
    return intentMeta(parseIntent(readFileSync(file, 'utf8'), file)!).grounding?.grade;
  };
  const showcase = EXPLAINERS.filter(scene => scene.tier === 'showcase').map(scene => scene.id);
  const weak = showcase.filter(id => grade(id) !== 'live' && grade(id) !== 'recorded');
  assert.deepEqual(weak, [], 'a showcase explainer graded read or none belongs in the gallery tier');
  assert.equal(grade(showcase.find(id => id !== PRODUCT.entry.id)!), 'live');
});
