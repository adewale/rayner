import assert from 'node:assert/strict';
import test from 'node:test';
import { galleryTile } from '../tools/lib/explain-gallery.ts';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';

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
  const {galleryPage}=await import('../tools/lib/explain-gallery.ts');
  const catalog={product:{entry:{id:'other',step:'question',settings:{case:'two'},label:'Start here'}},scenes:[
    {id:'featured',title:'Featured',lang:'en',group:'topic' as const,showcase:true},
    {id:'other',title:'Other',lang:'en',group:'topic' as const,showcase:false},
    {id:'recipe',title:'Recipe',lang:'en',group:'toolchain' as const,showcase:false},
  ]};
  const full=galleryPage(catalog,'');
  assert.ok(full.includes('other.html?case=two&amp;step=question'));
  assert.ok(full.indexOf('src="other.png"')<full.indexOf('src="featured.png"'));
  const subset=galleryPage({...catalog,scenes:[catalog.scenes[1]!]},'',false);
  assert.equal((subset.match(/<li/g)??[]).length,2,'one selected card and the evidence link');
  assert.ok(!subset.includes('featured.png')&&!subset.includes('recipe.png'));
  assert.ok(!subset.includes('<details')&&!subset.includes('embed-lab.html'));
});
