// The convention for error messages an author can see (docs/ENGINE.md, "Error messages"), held
// mechanically over the library and the player: every `new Error(`, `new TypeError(` and
// `new RangeError(` in src/, explain/ and app/. A message starts with the API the author called and
// a colon, ends without a full stop, and never names a mobject by its internal id. A prefix the code
// computes, such as the call an action was made by, is read from a variable with one of a few names
// the whole repository uses for it (CALLERS): whether it holds the right call is for review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');
const SCANNED = ['src', 'explain', 'app'];

/**
 * The static prefixes: a call, `card()`, `s.card()`, `keyedParts().add()`; a constructor,
 * `new NumberLine()`; a declaration, `meta.watch`, `static settings`, `m.clipBox`; or a file the
 * scene keeps beside it, `scene.snapshots`, `scene.lettering.json`.
 */
const PREFIX = /^(new [A-Z]\w*\(\)|static (meta|settings)|scene\.(snapshots|lettering\.json)|[a-z_$][\w$]*(\(\))?(\.[a-zA-Z_$][\w$]*(\(\))?)*): \S/;

/**
 * The names a computed prefix is read from, wherever it is computed: `api`, the call the author made,
 * which a helper was given by its caller; `call` (or `calls`), the call an action or animation was
 * made by; `where`, the declaration or file at fault; and `name` (or `names`), what an action or a
 * diagram action keeps as its call, or the subject a decoder was handed.
 */
const CALLERS = new Set(['api', 'call', 'calls', 'where', 'name', 'names']);

interface Thrown { at: string; kind: string; problems: string[] }

function filesUnder(path: string): string[] {
  const full = join(ROOT, path);
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full).flatMap((f) => filesUnder(join(path, f))).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
}

/** The ways a message can begin: each branch of a conditional, the left of a concatenation. */
function openings(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node)) return openings(node.expression);
  if (ts.isConditionalExpression(node)) return [...openings(node.whenTrue), ...openings(node.whenFalse)];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return openings(node.left);
  return [node];
}
/** The ways a message can end: each branch of a conditional, the right of a concatenation. */
function endings(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node)) return endings(node.expression);
  if (ts.isConditionalExpression(node)) return [...endings(node.whenTrue), ...endings(node.whenFalse)];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return endings(node.right);
  return [node];
}

/** What is wrong with each `new …Error(message)` in `source`, read as the file `file`. */
function check(file: string, source: string): Thrown[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: Thrown[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && /^(Type|Range|)Error$/.test(node.expression.text)) {
      const at = `${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      const problems: string[] = [];
      const message = node.arguments?.[0];
      if (!message) problems.push('it has no message');
      else {
        for (const open of openings(message)) {
          if (ts.isStringLiteral(open) || ts.isNoSubstitutionTemplateLiteral(open)) {
            if (!PREFIX.test(open.text)) problems.push(`it does not start with the API called and a colon: ${JSON.stringify(open.text.slice(0, 60))}`);
          } else if (ts.isTemplateExpression(open)) {
            const first = open.templateSpans[0]!;
            const computed = `${open.head.text}\${${first.expression.getText(sf)}}`.replace(/^\$\{(.*)\}$/, '$1');
            const static_ = open.head.text;
            const names: string[] = [];
            const collect = (n: ts.Node): void => { if (ts.isIdentifier(n)) names.push(n.text); n.forEachChild(collect); };
            collect(first.expression);
            if (static_ && PREFIX.test(static_ + '…')) { /* a static prefix before the first substitution */ }
            else if (!names.some((n) => CALLERS.has(n))) problems.push(`its prefix is computed from ${computed}; read it from a variable named ${[...CALLERS].join(', ')}`);
            else if (!/^(:| cannot be decoded)/.test(first.literal.text)) problems.push(`its computed prefix ${computed} is not followed by a colon`);
          } else problems.push(`its message is not written where it is thrown: ${open.getText(sf).slice(0, 60)}`);
        }
        for (const end of endings(message)) {
          const text = ts.isStringLiteral(end) || ts.isNoSubstitutionTemplateLiteral(end) ? end.text
            : ts.isTemplateExpression(end) ? end.templateSpans.at(-1)!.literal.text : '';
          if (/\.\s*$/.test(text) && !/\.\.\.\]?\s*$|…$/.test(text)) problems.push('it ends with a full stop');
        }
        const text = message.getText(sf);
        if (/#\$\{|\b(m|this|other|target|mobject)\.id\}/.test(text)) problems.push("it names a mobject by its internal id; name it by its key, text or kind (mobjectName)");
      }
      if (problems.length) out.push({ at, kind: node.expression.text, problems });
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

test('every error the library throws names the API called, ends without a full stop and shows no internal id', () => {
  const files = SCANNED.flatMap(filesUnder);
  assert.ok(files.length > 50, `scanned ${files.length} files`);
  let thrown = 0;
  const bad: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    thrown += (source.match(/new (Type|Range|)Error\(/g) ?? []).length;
    for (const t of check(relative(ROOT, join(ROOT, file)), source)) bad.push(`${t.at} (${t.kind}): ${t.problems.join('; ')}`);
  }
  assert.ok(thrown > 150, `found ${thrown} errors`);
  assert.deepEqual(bad, []);
});

test('the check rejects a message without a prefix, a full stop, an internal id and a prefix computed from another name', () => {
  const cases: [string, RegExp][] = [
    ["throw new Error('Card row is not unique');", /does not start with the API/],
    ["throw new Error('card(): the row is not unique.');", /full stop/],
    ['throw new Error(`view(): draw() returned ${m.constructor.name}#${m.id}`);', /internal id/],
    ['throw new Error(`${who}: no such row`);', /read it from a variable named api/],
    ['throw new TypeError(message);', /not written where it is thrown/],
    ["throw new RangeError(n ? 'card(): too many' : 'Too few');", /does not start with the API/],
  ];
  for (const [source, problem] of cases) {
    const found = check('explain/example.ts', source);
    assert.equal(found.length, 1, source);
    assert.match(found[0]!.problems.join('; '), problem, source);
  }
  // A prefix the code computes passes when it is read from one of the names, followed by a colon.
  assert.deepEqual(check('explain/panels.ts', 'throw new Error(`${api}: a card with columns needs at least one column`);'), []);
  assert.deepEqual(check('explain/example.ts', 'throw new Error(`${this.by.call}: it was never played`);'), []);
  assert.deepEqual(check('explain/panels.ts', 'throw new Error(`${api} needs a column`);').length, 1);
  assert.deepEqual(check('src/text.ts', "throw new RangeError('code.span(): there is no line 3; the code has 2, from 0');"), []);
});
