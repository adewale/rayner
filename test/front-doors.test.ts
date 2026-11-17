// One description of Rayner, PRODUCT in scenes/explainers/catalog.ts, behind every front door: the
// README's opening, the gallery page and catalog.json; and install lines that are true for what npm
// actually has.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXPLAINERS, PRODUCT } from '../scenes/explainers/catalog.ts';
import { galleryPage } from '../tools/repo/lib/explain-gallery.ts';
import { catalog, catalogFacts } from '../tools/lib/explain-artifacts.ts';

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

test('catalog.json’s facts for a host’s project panel come from PRODUCT and package.json, and the catalog reader checks them', () => {
  const pkg = JSON.parse(read('package.json'));
  const facts = catalogFacts(PRODUCT, pkg);
  assert.deepEqual(facts, {
    name: pkg.name,
    version: pkg.version,
    install: PRODUCT.install,
    installGuide: PRODUCT.installGuide,
    requirements: PRODUCT.requirements,
    publishes: PRODUCT.publishes,
    repository: 'https://github.com/adewale/rayner',
    license: pkg.license,
  });
  assert.equal(pkg.repository.url, `git+${facts.repository}.git`);
  // What it publishes is the description's own last sentence, not new copy.
  assert.ok(PRODUCT.description.endsWith(`The result is ${PRODUCT.publishes[0]!.toLowerCase()}${PRODUCT.publishes.slice(1)}`), PRODUCT.publishes);
  const totals = { explainers: 0, scenarios: 0, diagrams: 0, styles: 0, families: 0 };
  const written = { version: 2, product: PRODUCT, facts, totals, scenes: [] };
  assert.deepEqual(catalog(written).facts, facts);
  // Catalogs from before facts existed still read.
  assert.equal(catalog({ ...written, facts: undefined }).facts, undefined);
  for (const [defect, reason] of [
    [{ license: '' }, /facts have no license/],
    [{ version: 'latest' }, /not a semantic version/],
    [{ repository: 'git+https://github.com/adewale/rayner.git' }, /not an https URL/],
    [{ install: 'npm install rayner' }, /say install differently from the product copy/],
    [{ extra: 'x' }, /unknown field, extra/],
  ] as const)
    assert.throws(() => catalog({ ...written, facts: { ...facts, ...defect } }), reason);
  assert.throws(() => catalogFacts(PRODUCT, { ...pkg, repository: undefined }), /repository/);
});

test('PRODUCT’s install line names the version this checkout describes, so a release revisits it', () => {
  assert.ok(PRODUCT.install.includes(version), `PRODUCT.install says nothing about ${version}`);
  assert.match(PRODUCT.installGuide, /#quick-start$/);
});

test('the quick start builds and installs the one archive of the version this checkout describes', () => {
  const readme = read('README.md'), start = readme.indexOf('## Quick start\n');
  const section = readme.slice(start, readme.indexOf('\n## ', start + 1));
  const block = /```sh\n([\s\S]*?)```/.exec(section)![1]!;
  assert.match(block, /\(cd rayner && npm ci && npm pack\)/);
  assert.ok(block.includes(`npm install --save-dev ../rayner/rayner-${version}.tgz\n`), block);
  assert.equal((block.match(/\.tgz/g) ?? []).length, 1, 'one archive');
});

/** The guides a reader installs from: the README, docs/, the FAQ and the skill. */
const guides = ['README.md', 'FAQ.md', 'skills/rayner-explainers/SKILL.md', ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];

test('no guide, and not PRODUCT, names rayner-cli: 0.2.0 is one package, rayner, with the command', () => {
  assert.deepEqual(guides.filter((file) => read(file).includes('rayner-cli')), []);
  assert.ok(!PRODUCT.install.includes('rayner-cli'), PRODUCT.install);
});

test('every install of rayner from npm says where to get a version npm does not have yet', () => {
  const unsaid: string[] = [];
  for (const file of guides) {
    // Each section, from one heading to the next, with its heading taken off.
    for (const section of read(file).split(/\n(?=#{1,4} )/)) {
      const body = section.replace(/^#{1,4} .*\n/, '');
      for (const line of body.split('\n'))
        if (/\bnpm (?:install|i)\b(?:(?!\.tgz).)*?\srayner(?:@[\w.-]+)?(?=[\s`]|$)/.test(line) && !/quick start|from a clone|built in a clone/i.test(body))
          unsaid.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(unsaid, [], 'point a registry install at the quick start, which builds the package from a clone until npm lists the version');
});
