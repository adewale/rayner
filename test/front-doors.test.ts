// One description of Rayner, PRODUCT in scenes/explainers/catalog.ts, behind every front door: the
// README's opening, the gallery page and catalog.json; and install lines that are true for what npm
// actually has.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXPLAINERS, PRODUCT } from '../scenes/explainers/catalog.ts';
import { galleryPage } from '../tools/repo/lib/explain-gallery.ts';
import { catalog } from '../tools/lib/explain-artifacts.ts';

const ROOT = join(import.meta.dirname, '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const version = (JSON.parse(read('package.json')) as { version: string }).version;
const unescape = (html: string) => html.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

test('the README opens with PRODUCT’s summary and audience, then its description', () => {
  const [opening, second] = read('README.md').split('\n\n').slice(1, 3);
  assert.equal(opening, `${PRODUCT.summary} ${PRODUCT.audience}`);
  assert.equal(second, PRODUCT.description);
});

test('the gallery opens with the same words, and catalog.json carries them with the install line', () => {
  const scenes = EXPLAINERS.map(({ id, group, tier }) => ({ id, title: id, lang: 'en', group, tier, scenarios: 1 }));
  const page = galleryPage({ product: PRODUCT, scenes }, '');
  const intro = [...page.matchAll(/<p class="intro">(.*?)<\/p>/g)].map((m) => unescape(m[1]!));
  assert.equal(intro[0], `${PRODUCT.summary} ${PRODUCT.audience}`);
  assert.equal(intro[1], PRODUCT.description);
  assert.ok(intro[2]!.includes(`${PRODUCT.install} <a href="${PRODUCT.installGuide}">Quick start</a>`), intro[2]);
  const totals = { explainers: 0, scenarios: 0, diagrams: 0, styles: 0, families: 0 };
  assert.equal(catalog({ version: 2, product: PRODUCT, totals, scenes }).product.install, PRODUCT.install);
  assert.throws(() => catalog({ version: 2, product: { ...PRODUCT, install: 7 }, totals, scenes }), /version 2 format/);
});

test('PRODUCT’s install line names the version this checkout describes, so a release revisits it', () => {
  assert.ok(PRODUCT.install.includes(version), `PRODUCT.install says nothing about ${version}`);
  assert.match(PRODUCT.installGuide, /#quick-start$/);
});

test('the quick start builds and installs the archives of the version this checkout describes', () => {
  const readme = read('README.md'), start = readme.indexOf('## Quick start\n');
  const section = readme.slice(start, readme.indexOf('\n## ', start + 1));
  const block = /```sh\n([\s\S]*?)```/.exec(section)![1]!;
  assert.match(block, /npm ci && npm pack && cd cli && npm pack --pack-destination \.\./);
  assert.ok(block.includes(`npm install --save-dev ../rayner/rayner-${version}.tgz ../rayner/rayner-cli-${version}.tgz`), block);
});

/** The guides a reader installs from: the README, the command's README, docs/, the FAQ and the skill. */
const guides = ['README.md', 'cli/README.md', 'FAQ.md', 'skills/rayner-explainers/SKILL.md', ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];

test('every install of rayner or rayner-cli from npm says where to get a version npm does not have yet', () => {
  const unsaid: string[] = [];
  for (const file of guides) {
    // Each section, from one heading to the next, with its heading taken off.
    for (const section of read(file).split(/\n(?=#{1,4} )/)) {
      const body = section.replace(/^#{1,4} .*\n/, '');
      for (const line of body.split('\n'))
        if (/\bnpm (?:install|i)\b(?:(?!\.tgz).)*?\s(?:rayner|rayner-cli)(?:@[\w.-]+)?(?=[\s`]|$)/.test(line) && !/quick start|from a clone|built in a clone/i.test(body))
          unsaid.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(unsaid, [], 'point a registry install at the quick start, which builds the packages from a clone until npm lists the version');
});
