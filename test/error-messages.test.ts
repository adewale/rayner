// The convention for error messages an author can see (docs/ENGINE.md, "Error messages"), held
// mechanically over the library: every `new Error(`, `new TypeError(` and `new RangeError(` in
// src/, explain/, the player (app/) and diagram replay. A message starts with the API the author called and a colon,
// ends without a full stop, and never names a mobject by its internal id. A prefix the code
// computes, such as the call an action was made by or the file a script was read from, is allowed
// only where ALLOWED lists that expression and says what it holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');
const SCANNED = ['src', 'explain', 'app', 'integrations/agentic-mermaid/snapshot.ts', 'integrations/agentic-mermaid/text.ts'];

/**
 * The static prefixes: a call, `card()`, `s.card()`, `keyedParts().add()`; a constructor,
 * `new NumberLine()`; a declaration, `meta.watch`, `static settings`, `m.clipBox`; or a file the
 * scene keeps beside it, `scene.snapshots`, `scene.lettering.json`.
 */
const PREFIX = /^(new [A-Z]\w*\(\)|static (meta|settings)|scene\.(snapshots|lettering\.json)|[a-z_$][\w$]*(\(\))?(\.[a-zA-Z_$][\w$]*(\(\))?)*): \S/;

/** Computed prefixes, by file and the expression that opens the message: what each one holds. */
const ALLOWED: Record<string, Record<string, string>> = {
  'src/json.ts': { api: 'the call cloneJson was given by its caller' },
  'src/animation.ts': {
    api: "the call that took the animations or the time, 'this.play()', 'new Succession()' or 'new FadeIn()'",
    'this.call': "the call what is made at its turn belongs to, 's.card()' or 'machine.send(\"UP\")'",
  },
  'src/scene.ts': {
    api: "the scene's call that found another running, 'this.play()', 'this.wait()', 'this.step()' or 'this.construct()'; or the registration of a listener that left a play running, 'this.onStep()' or 'this.onStepEnd()'",
    call: "the call that made or began animations at their turn in a play, 's.card()', 'machine.send(\"UP\")' or 'new Succession()'",
  },
  'src/shapes.ts': { api: "the constructor boxOf's caller names" },
  'src/fonts.ts': { label: "decodeFont's subject, which its caller names with a prefix ('loadFonts(): the embedded sans face')" },
  'src/mobject.ts': { 'm.${name}': 'the method of every mobject that was assigned to, m.box', api: "the call that changes the children, 'm.add()', 'm.insert()' or 'm.replaceChild()'" },
  'explain/action.ts': {
    action: "the action's call, 's.card()'",
    'this.name': "the action's call, 's.card()'",
    "names.join(', ')": "the calls of the actions never played, 's.card(), d.walk()'",
  },
  'explain/diagrams.ts': { api: "the diagram method called, 'd.get()'", name: "the diagram action, 'd.reveal()'" },
  'explain/intent.ts': { where: "the script's file, 'script.md' or its path" },
  'explain/look.ts': { api: "the kit function given something other than a stage, 'card()' or 'code()'" },
  'explain/project.ts': { api: "the call that collected a scenario's steps, 'loadProject()', or the scene's file when the rayner command collects them" },
  'explain/panels.ts': { api: "'card()' or 'code()', or 's.card()' or 's.code()' when the stage builds it", 'this.api': 'the same, kept on the panel' },
  'explain/seen-from.ts': { api: "the geo function called, 'seenFrom()', 'project()' or 'depthOrder()'" },
  'explain/settings.ts': { where: "the declaration, 'static meta' or 'meta.player'" },
  'integrations/agentic-mermaid/snapshot.ts': { api: "the call that needed the scene's snapshots, 'diagramResolverOf()', 's.show()' or 'd.morph()'" },
};

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
            if (static_ && PREFIX.test(static_ + '…')) { /* a static prefix before the first substitution */ }
            else if (!ALLOWED[file]?.[computed]) problems.push(`its prefix is computed from ${computed}, which ALLOWED does not list for ${file}`);
            else if (!static_ && !/^(:| cannot be decoded)/.test(first.literal.text) && !(computed.startsWith('m.') && first.literal.text.startsWith(':')))
              problems.push(`its computed prefix ${computed} is not followed by a colon`);
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

test('every computed prefix ALLOWED lists is still used', () => {
  for (const [file, expressions] of Object.entries(ALLOWED)) {
    const sf = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const used = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isTemplateExpression(node)) used.add(`${node.head.text}\${${node.templateSpans[0]!.expression.getText(sf)}}`.replace(/^\$\{(.*)\}$/, '$1'));
      node.forEachChild(visit);
    };
    visit(sf);
    for (const expression of Object.keys(expressions)) assert.ok(used.has(expression), `${file}: ALLOWED lists ${expression}, which no message opens with`);
  }
});

test('the check rejects a message without a prefix, a full stop, an internal id and an unlisted computed prefix', () => {
  const cases: [string, RegExp][] = [
    ["throw new Error('Card row is not unique');", /does not start with the API/],
    ["throw new Error('card(): the row is not unique.');", /full stop/],
    ['throw new Error(`view(): draw() returned ${m.constructor.name}#${m.id}`);', /internal id/],
    ['throw new Error(`${who}: no such row`);', /ALLOWED does not list/],
    ['throw new TypeError(message);', /not written where it is thrown/],
    ["throw new RangeError(n ? 'card(): too many' : 'Too few');", /does not start with the API/],
  ];
  for (const [source, problem] of cases) {
    const found = check('explain/example.ts', source);
    assert.equal(found.length, 1, source);
    assert.match(found[0]!.problems.join('; '), problem, source);
  }
  // A prefix the code computes passes where ALLOWED lists it for that file, followed by a colon.
  assert.deepEqual(check('explain/panels.ts', 'throw new Error(`${api}: a card with columns needs at least one column`);'), []);
  assert.deepEqual(check('explain/panels.ts', 'throw new Error(`${api} needs a column`);').length, 1);
  assert.deepEqual(check('src/text.ts', "throw new RangeError('code.span(): there is no line 3; the code has 2, from 0');"), []);
});
