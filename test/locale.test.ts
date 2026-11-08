// What Rayner writes must not depend on the machine's locale (docs/ENGINE.md, "Locale"): the same
// scene gives the same snapshot, trace, description and page in Node and in any browser, whatever
// LANG says. This holds the rule by reading the code, as test/layers.test.ts holds the layers: no
// `localeCompare` or `toLocale…` call, no Intl formatter (whose separators and order differ
// between engines and their data), and no Intl object made without naming its locale. ALLOWED
// names each exception and why its output is never saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');
/** Everything that writes what a reader, a snapshot or a receipt holds: the library, the player, the command and the scenes. */
const SCANNED = ['src', 'explain', 'app', 'integrations', 'tools', 'scenes', 'recipes'];

/** Calls whose result follows the machine's locale. */
const LOCALE_CALLS = new Set(['localeCompare', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toLocaleUpperCase', 'toLocaleLowerCase']);
/** Intl formatters: their output differs between Node's ICU and a browser's data even for a named locale. */
const FORMATTERS = new Set(['NumberFormat', 'DateTimeFormat', 'Collator', 'RelativeTimeFormat', 'ListFormat', 'DisplayNames', 'PluralRules', 'DurationFormat']);

/** The exceptions, by file and the name used: why each never reaches saved output. */
const ALLOWED: Record<string, Record<string, string>> = {
  'src/perf.ts': { toLocaleString: 'a profile printed for a person at the console, never saved' },
  'scenes/explainers/2password/model.ts': { localeCompare: "a port of upstream's sort of ASCII item titles and references, pinned to 'en'" },
};

/** Each use of a locale-dependent call in `source`, as `name` at `file:line`. */
function localeUses(file: string, source: string): { name: string; at: string }[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: { name: string; at: string }[] = [];
  const at = (n: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (LOCALE_CALLS.has(name) && ts.isCallExpression(node.parent) && node.parent.expression === node) out.push({ name, at: at(node) });
      if (ts.isIdentifier(node.expression) && node.expression.text === 'Intl') {
        if (FORMATTERS.has(name)) out.push({ name: `Intl.${name}`, at: at(node) });
        // Any other Intl object (a Segmenter) must name its locale, or the machine's default decides.
        else if ((ts.isNewExpression(node.parent) || ts.isCallExpression(node.parent)) && node.parent.expression === node) {
          const locale = node.parent.arguments?.[0];
          if (!locale || (ts.isIdentifier(locale) && locale.text === 'undefined')) out.push({ name: `Intl.${name} without a locale`, at: at(node) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const sources = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.name === 'node_modules' || e.name === 'test' ? [] : e.isDirectory() ? sources(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts') ? [join(dir, e.name)] : [],
  );

test('nothing Rayner writes follows the machine\'s locale: no localeCompare or toLocale call, no Intl formatter, no Intl object without its locale', () => {
  const found = SCANNED.flatMap(sources).flatMap((file) => localeUses(file, readFileSync(join(ROOT, file), 'utf8')));
  const unexplained = found.filter(({ name, at }) => !ALLOWED[at.slice(0, at.lastIndexOf(':'))]?.[name]).map(({ name, at }) => `${at}: ${name}`);
  assert.deepEqual(unexplained, [], 'compare strings by code unit (byCodeUnit), write numbers with writeNumber, and name an Intl object\'s locale');
  // Every exception is still in use, so the list cannot outlive the code it excuses.
  for (const [file, names] of Object.entries(ALLOWED))
    for (const name of Object.keys(names)) assert.ok(found.some((f) => f.name === name && f.at.startsWith(file + ':')), `${file}: ${name} is no longer used; drop it from ALLOWED`);
});

test('the rule rejects each seeded locale dependence and allows what names its locale', () => {
  const uses = (code: string) => localeUses('seeded.ts', code).map((u) => u.name);
  assert.deepEqual(uses('keys.sort((a, b) => a.localeCompare(b));'), ['localeCompare']);
  assert.deepEqual(uses('n.toLocaleString();'), ['toLocaleString']);
  assert.deepEqual(uses("new Intl.NumberFormat('fr-FR').format(n);"), ['Intl.NumberFormat']);
  assert.deepEqual(uses('new Intl.Segmenter();'), ['Intl.Segmenter without a locale']);
  assert.deepEqual(uses("new Intl.Segmenter(undefined, { granularity: 'word' });"), ['Intl.Segmenter without a locale']);
  assert.deepEqual(uses("new Intl.Segmenter('en', { granularity: 'grapheme' }); const f: Intl.NumberFormat | undefined = undefined; // a.localeCompare(b)"), []);
});

test('lettering run keys sort the same under any locale, which localeCompare does not', () => {
  // The keys a snapshot stores its runs under: a face, the text and whether it is display maths.
  const keys = ['["sans","z",false]', '["sans","ä",false]', '["sans","Z",false]', '["sans","漢",false]', '["sans","a",false]'];
  const run = (locale: string, code: string) => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, LC_ALL: locale, LANG: locale } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const ours = `import { inKeyOrder } from './tools/lib/lettering.ts'; console.log(Object.keys(inKeyOrder(Object.fromEntries(${JSON.stringify(keys)}.map((k) => [k, 1])))).join(' '));`;
  const theirs = `console.log(${JSON.stringify(keys)}.sort((a, b) => a.localeCompare(b)).join(' '));`;
  const [sv, zh] = ['sv_SE.UTF-8', 'zh_CN.UTF-8'].map((l) => run(l, ours));
  assert.equal(sv, zh);
  assert.equal(sv, [...keys].sort().join(' '));
  // The deliberate defect, where the machine has those locales: localeCompare puts "ä" last in Swedish and Han first in Chinese.
  const [svLocale, zhLocale] = ['sv_SE.UTF-8', 'zh_CN.UTF-8'].map((l) => run(l, theirs));
  if (Intl.Collator.supportedLocalesOf(['sv', 'zh']).length === 2) assert.notEqual(svLocale, zhLocale);
});
