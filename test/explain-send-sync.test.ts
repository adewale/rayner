// The send-sync explainer's evaluator, held to the Rust standard library's impl lines and to rustc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fc, params } from './lib/pbt.ts';
import { RULES, INNERS, WRAPS, SINGLES, CHECK_TYPES, OPENING, OPENING_TYPE, OPENING_ERROR, t, isSend, isSync, nameOf, build, threads, quadrantOf } from '../scenes/explainers/lib/send-sync.ts';
import type { Ctor, Inner, Needs, RustType, Wrapper } from '../scenes/explainers/lib/send-sync.ts';

// Copied verbatim from rust-lang/rust at tag 1.99.1 (commit 213cfbe66a6da4e4b41bde365643286371af6e5a),
// https://github.com/rust-lang/rust/tree/1.99.1/library, with file and line.
const SOURCE = [
  ['alloc/src/sync.rs:284', 'unsafe impl<T: ?Sized + Sync + Send, A: Allocator + Send> Send for Arc<T, A> {}'],
  ['alloc/src/sync.rs:286', 'unsafe impl<T: ?Sized + Sync + Send, A: Allocator + Sync> Sync for Arc<T, A> {}'],
  ['alloc/src/rc.rs:334', 'impl<T: ?Sized, A: Allocator> !Send for Rc<T, A> {}'],
  ['alloc/src/rc.rs:342', 'impl<T: ?Sized, A: Allocator> !Sync for Rc<T, A> {}'],
  ['core/src/cell.rs:320', 'unsafe impl<T: ?Sized> Send for Cell<T> where T: Send {}'],
  ['core/src/cell.rs:328', 'impl<T: ?Sized> !Sync for Cell<T> {}'],
  ['std/src/sync/poison/mutex.rs:238', 'unsafe impl<T: ?Sized + Send> Send for Mutex<T> {}'],
  ['std/src/sync/poison/mutex.rs:257', 'unsafe impl<T: ?Sized + Send> Sync for Mutex<T> {}'],
  ['std/src/sync/poison/mutex.rs:289', "impl<T: ?Sized> !Send for MutexGuard<'_, T> {}"],
  ['std/src/sync/poison/mutex.rs:294', "unsafe impl<T: ?Sized + Sync> Sync for MutexGuard<'_, T> {}"],
  ['core/src/marker.rs:105', 'unsafe impl<T: Sync + PointeeSized> Send for &T {}'],
] as const;

/** What one impl line says a type needs of T for one trait. Allocator bounds are left out: the default, Global, is Send and Sync. */
function readImpl(line: string): { ctor: Ctor; trait: 'send' | 'sync'; needs: Needs } {
  const m = /^(?:unsafe )?impl<(.*?)> (!?)(Send|Sync) for (&T|\w+)(?:<.*?>)?(?: where (.*?))? \{\}$/.exec(line);
  assert.ok(m, line);
  const [, generics, negative, trait, self, where] = m;
  const bounds = [generics!, where ?? '']
    .flatMap((g) => g.split(/,\s*(?=[A-Z]:)/))
    .filter((b) => /^T:/.test(b.trim()))
    .flatMap((b) => b.replace(/^\s*T:/, '').split('+').map((x) => x.trim()));
  const send = bounds.includes('Send'),
    sync = bounds.includes('Sync');
  return {
    ctor: (self === '&T' ? '&' : self) as Ctor,
    trait: trait!.toLowerCase() as 'send' | 'sync',
    needs: negative ? 'never' : send && sync ? 'send+sync' : send ? 'send' : sync ? 'sync' : 'always',
  };
}

test('the rule table is the standard library’s impl lines, read mechanically', () => {
  for (const [where, line] of SOURCE) {
    const { ctor, trait, needs } = readImpl(line);
    assert.equal(RULES[ctor][trait], needs, `${where}: ${line}`);
  }
  // Every rule the scene uses comes from a line above, except i32 (an auto trait with no impl line,
  // checked against rustc below) and Sync for &T, which the evaluator does not use.
  const read = new Set(SOURCE.map(([, line]) => `${readImpl(line).ctor}.${readImpl(line).trait}`));
  for (const ctor of Object.keys(RULES) as Ctor[])
    for (const trait of ['send', 'sync'] as const)
      if (ctor !== 'i32' && !(ctor === '&' && trait === 'sync')) assert.ok(read.has(`${ctor}.${trait}`), `${ctor}.${trait} has no source line`);
});

// rustc 1.99.1 (58cf8f9c3 2026-10-13), Docker image rust:1.99.1-slim
// (sha256:1a939748a7cbab172de91a014e3804a97af1394a8c844faa67fce9401c4e40fb), run once on 2026-10-25.
// Each answer is one file compiled with `rustc --edition 2024` after
//   use std::{cell::Cell, rc::Rc, sync::{Arc, Mutex, MutexGuard}, thread};
//   fn assert_send<T: Send>() {}  fn assert_sync<T: Sync>() {}
// Trait columns: `fn main() { assert_send::<TYPE>(); }` (and assert_sync). spawn:
// `let x: TYPE = VALUE; thread::spawn(move || drop(x)).join().unwrap();`. scope:
// `let x: TYPE = VALUE; thread::scope(|s| { let r = &x; s.spawn(move || { std::hint::black_box(r); });
// s.spawn(move || { std::hint::black_box(r); }); });`, the guard from `static M: Mutex<i32>`, `M.lock().unwrap()`.
// true: it compiled; false: it failed with error E0277 and no other error.
// This table keeps the claims checked where rustc is absent; 'rustc, run now, gives the model’s
// answers and this table’s' below asks the compiler again whenever one is on PATH (or in $RUSTC).
const RUSTC: readonly [string, send: boolean, sync: boolean, spawn: boolean, scope: boolean][] = [
  ['i32', true, true, true, true],
  ['Cell<i32>', true, false, true, false],
  ['Rc<i32>', false, false, false, false],
  ["MutexGuard<'static, i32>", false, true, false, true],
  ['Arc<i32>', true, true, true, true],
  ['Arc<Cell<i32>>', false, false, false, false],
  ['Arc<Rc<i32>>', false, false, false, false],
  ['Mutex<i32>', true, true, true, true],
  ['Mutex<Cell<i32>>', true, true, true, true],
  ['Mutex<Rc<i32>>', false, false, false, false],
  ['Arc<Mutex<i32>>', true, true, true, true],
  ['Arc<Mutex<Cell<i32>>>', true, true, true, true],
  ['Arc<Mutex<Rc<i32>>>', false, false, false, false],
];
function parse(rust: string): RustType {
  const s = rust.replace(/'static, /, '');
  if (s === 'i32') return t('i32');
  const m = /^(\w+)<(.*)>$/.exec(s);
  assert.ok(m, rust);
  return t(m[1] as Ctor, parse(m[2]!));
}

test('the evaluator gives rustc’s answers for every type the scene shows', () => {
  for (const [rust, send, sync, spawn, scope] of RUSTC) {
    const type = parse(rust);
    assert.equal(isSend(type), send, `${rust}: Send`);
    assert.equal(isSync(type), sync, `${rust}: Sync`);
    // Owning x in a move closure needs Send; two closures holding &x need &T: Send.
    assert.equal(isSend(type), spawn, `${rust}: thread::spawn`);
    assert.equal(isSend(t('&', type)), scope, `${rust}: thread::scope`);
  }
});

test('the nine scenarios, built inside out, end where rustc puts them', () => {
  const expected: Record<string, [string, boolean, boolean]> = {
    'arc/i32': ['Arc<i32>', true, true],
    'arc/cell': ['Arc<Cell<i32>>', false, false],
    'arc/rc': ['Arc<Rc<i32>>', false, false],
    'mutex/i32': ['Mutex<i32>', true, true],
    'mutex/cell': ['Mutex<Cell<i32>>', true, true],
    'mutex/rc': ['Mutex<Rc<i32>>', false, false],
    'arc-mutex/i32': ['Arc<Mutex<i32>>', true, true],
    'arc-mutex/cell': ['Arc<Mutex<Cell<i32>>>', true, true],
    'arc-mutex/rc': ['Arc<Mutex<Rc<i32>>>', false, false],
  };
  for (const [key, [name, send, sync]] of Object.entries(expected)) {
    const [w, i] = key.split('/') as [Parameters<typeof build>[0], Parameters<typeof build>[1]];
    const last = build(w, i).at(-1)!;
    assert.deepEqual([last.name, last.send, last.sync], [name, send, sync], key);
    assert.deepEqual(threads(w, i), { name, spawnMove: send, scopeBorrow: sync }, key);
    // The rustc table above holds every one of these.
    assert.ok(RUSTC.some(([r, s, y]) => r === name && s === send && y === sync), name);
  }
  // Mutex<Cell<i32>> moves from Send only to both; the inner type of a build is the first layer.
  assert.deepEqual(
    build('mutex', 'cell').map((l) => [l.name, l.quadrant]),
    [
      ['Cell<i32>', 4],
      ['Mutex<Cell<i32>>', 1],
    ],
  );
});

// ---- the live check: the model's claims, written out as Rust and compiled by rustc now.
type Check = 'send' | 'sync' | 'spawn' | 'scope';
const CHECKS: readonly Check[] = ['send', 'sync', 'spawn', 'scope'];
interface Claim {
  rust: string;
  check: Check;
  holds: boolean;
}

/** A type as Rust source spells it; the model leaves out the guard's lifetime. */
const rustName = (type: RustType): string =>
  type.ctor === 'i32' ? 'i32' : type.ctor === 'MutexGuard' ? `MutexGuard<'static, ${rustName(type.of!)}>` : `${type.ctor}<${rustName(type.of!)}>`;

/**
 * Every claim the scene makes, read from the functions the scene calls: Send and Sync for the four
 * single types and for each layer of the nine builds, and what thread::spawn and thread::scope accept
 * for the nine built types. The single and inner types get spawn and scope answers too, from the
 * same two rules threads() uses, so the frozen table's thirteen rows are covered in full.
 */
function modelClaims(): Claim[] {
  const claims = new Map<string, Claim>();
  const claim = (rust: string, check: Check, holds: boolean) => {
    const key = `${rust}: ${check}`;
    const had = claims.get(key);
    assert.ok(!had || had.holds === holds, `the model gives two answers for ${key}`);
    claims.set(key, { rust, check, holds });
  };
  const own = (type: RustType) => {
    claim(rustName(type), 'send', isSend(type));
    claim(rustName(type), 'sync', isSync(type));
    claim(rustName(type), 'spawn', isSend(type));
    claim(rustName(type), 'scope', isSend(t('&', type)));
  };
  SINGLES.forEach(own);
  for (const wrapper of Object.keys(WRAPS) as Wrapper[])
    for (const inner of Object.keys(INNERS) as Inner[]) {
      let type: RustType = INNERS[inner];
      const layers = build(wrapper, inner);
      own(type);
      WRAPS[wrapper].forEach((ctor, n) => {
        type = t(ctor, type);
        own(type);
        const layer = layers[n + 1]!;
        assert.equal(layer.name, nameOf(type));
        claim(rustName(type), 'send', layer.send);
        claim(rustName(type), 'sync', layer.sync);
      });
      const run = threads(wrapper, inner);
      claim(rustName(type), 'spawn', run.spawnMove);
      claim(rustName(type), 'scope', run.scopeBorrow);
    }
  return [...claims.values()];
}

// One claim per line, so rustc's error spans say which claim failed. The spawn and scope bodies
// are the frozen table's, with x a parameter instead of a constructed value.
const RUST_HEAD = [
  '#![allow(dead_code, unused_imports)]',
  'use std::{cell::Cell, hint::black_box, rc::Rc, sync::{Arc, Mutex, MutexGuard}, thread};',
  'fn assert_send<T: Send>() {}',
  'fn assert_sync<T: Sync>() {}',
];
const RUST_BODY: Record<Check, (type: string, n: number) => string> = {
  send: (type, n) => `fn c${n}() { assert_send::<${type}>(); }`,
  sync: (type, n) => `fn c${n}() { assert_sync::<${type}>(); }`,
  spawn: (type, n) => `fn c${n}(x: ${type}) { thread::spawn(move || drop(x)).join().unwrap(); }`,
  scope: (type, n) =>
    `fn c${n}(x: ${type}) { thread::scope(|s| { let r = &x; s.spawn(move || { black_box(r); }); s.spawn(move || { black_box(r); }); }); }`,
};
/** The trait whose absence makes each kind of claim fail: a borrow crosses threads when &T is Send, that is when T is Sync. */
const TRAIT: Record<Check, 'Send' | 'Sync'> = { send: 'Send', sync: 'Sync', spawn: 'Send', scope: 'Sync' };

interface Diagnostic {
  level: string;
  code: { code: string } | null;
  spans: { is_primary: boolean; line_start: number }[];
  rendered: string;
}
/** Type-checks one crate (`--emit=metadata`, what cargo check runs) and returns its errors. */
function compile(rustc: string, dir: string, name: string, source: string): Diagnostic[] {
  const file = join(dir, `${name}.rs`);
  writeFileSync(file, source);
  const args = ['--edition', '2024', '--crate-type', 'lib', '--crate-name', name, '--emit=metadata', '--error-format=json', '-o', join(dir, `${name}.rmeta`), file];
  const run = spawnSync(rustc, args, { encoding: 'utf8' });
  assert.equal(run.error, undefined, String(run.error));
  const errors = run.stderr
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Diagnostic)
    .filter((d) => d.level === 'error' && d.spans.length > 0);
  assert.equal(run.status === 0, errors.length === 0, run.stderr);
  return errors;
}

/** rustc prints std::sync::MutexGuard<'_, i32>; the model's names have neither paths nor lifetimes. */
const plain = (text: string) => text.replace(/\b(?:std|core|alloc)::(?:\w+::)*/g, '').replace(/'(?:_|static), /g, '');

/** rustc's answer to each claim: true if its line compiled, false if every error on it is an E0277 naming the claim's trait. */
function rustcAnswers(rustc: string, claims: readonly Claim[]): Map<Claim, boolean> {
  const dir = mkdtempSync(join(tmpdir(), 'send-sync-'));
  const answers = new Map<Claim, boolean>();
  try {
    // The claims the model says hold go in one crate that must compile; the rest in one that must fail on every line.
    for (const [name, group] of [
      ['holds', claims.filter((c) => c.holds)],
      ['fails', claims.filter((c) => !c.holds)],
    ] as const) {
      const lines = [...RUST_HEAD, ...group.map((c, n) => RUST_BODY[c.check](c.rust, n))];
      const errors = compile(rustc, dir, name, lines.join('\n') + '\n');
      const byLine = new Map<number, Diagnostic[]>();
      for (const e of errors) {
        const line = e.spans.find((s) => s.is_primary)?.line_start ?? e.spans[0]!.line_start;
        assert.ok(line > RUST_HEAD.length && line <= lines.length, `an error outside the claims:\n${e.rendered}`);
        byLine.set(line, [...(byLine.get(line) ?? []), e]);
      }
      group.forEach((c, n) => {
        const found = byLine.get(RUST_HEAD.length + n + 1) ?? [];
        const trait = TRAIT[c.check],
          type = plain(c.rust);
        for (const e of found) {
          assert.equal(e.code?.code, 'E0277', `${c.rust}: ${c.check} failed with another error:\n${e.rendered}`);
          const text = plain(e.rendered);
          assert.ok(
            text.includes(`the trait \`${trait}\` is not implemented for \`${type}\``) || text.includes(`required for \`${type}\` to implement \`${trait}\``),
            `${c.rust}: ${c.check} failed, but not for want of ${trait} on ${type}:\n${e.rendered}`,
          );
        }
        answers.set(c, found.length === 0);
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return answers;
}

const RUSTC_BIN = process.env.RUSTC || 'rustc';
const rustcVersion = spawnSync(RUSTC_BIN, ['--version'], { encoding: 'utf8' });
const rustcSkip = rustcVersion.status === 0 ? false : `${RUSTC_BIN} is not runnable; put rustc on PATH or set RUSTC to a rustc binary`;

test('rustc, run now, gives the model’s answers and this table’s', { skip: rustcSkip }, (tc) => {
  const start = performance.now();
  const claims = modelClaims();
  const answers = rustcAnswers(RUSTC_BIN, claims);
  const ms = Math.round(performance.now() - start);
  tc.diagnostic(
    `${rustcVersion.stdout.trim()}: ${claims.length} claims, ${claims.filter((c) => c.holds).length} that hold in one crate, ` +
      `${claims.filter((c) => !c.holds).length} that fail in another; two rustc runs, ${ms} ms`,
  );
  const disagree = claims.filter((c) => answers.get(c) !== c.holds).map((c) => `${c.rust}: ${c.check}: the model says ${c.holds}, rustc says ${!c.holds}`);
  assert.deepEqual(disagree, []);
  // The live answers, laid out as the frozen table, are the frozen table.
  const live = new Map(claims.map((c) => [`${c.rust}: ${c.check}`, answers.get(c)!]));
  assert.deepEqual(new Set(claims.map((c) => c.rust)), new Set(RUSTC.map(([rust]) => rust)), 'the model shows the frozen table’s types and no others');
  assert.deepEqual(
    RUSTC.map(([rust]) => [rust, ...CHECKS.map((check) => live.get(`${rust}: ${check}`))]),
    RUSTC.map((row) => [...row]),
  );
});

// The check questions' types are not in the frozen 1.99.1 table: they are checked by the rustc on PATH only.
test('rustc, run now, gives the model’s answers for the check questions’ types', { skip: rustcSkip }, (tc) => {
  const claims = CHECK_TYPES.flatMap((type) => [
    { rust: rustName(type), check: 'send' as const, holds: isSend(type) },
    { rust: rustName(type), check: 'sync' as const, holds: isSync(type) },
    { rust: rustName(type), check: 'spawn' as const, holds: isSend(type) },
    { rust: rustName(type), check: 'scope' as const, holds: isSend(t('&', type)) },
  ]);
  const answers = rustcAnswers(RUSTC_BIN, claims);
  tc.diagnostic(`${rustcVersion.stdout.trim()}: ${claims.length} claims`);
  assert.deepEqual(
    claims.filter((c) => answers.get(c) !== c.holds).map((c) => `${c.rust}: ${c.check}: the model says ${c.holds}`),
    [],
  );
  // Neither type can cross: Rc is never Send, and Arc needs a Send guard.
  assert.deepEqual(CHECK_TYPES.map((x) => [nameOf(x), isSend(x), isSync(x)]), [
    ['Rc<Mutex<i32>>', false, false],
    ['Arc<MutexGuard<i32>>', false, false],
  ]);
});

const anyType: fc.Arbitrary<RustType> = fc.letrec<{ type: RustType }>((tie) => ({
  type: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(t('i32')),
    fc.tuple(fc.constantFrom<Ctor>('Cell', 'Rc', 'Mutex', 'MutexGuard', 'Arc', '&'), tie('type')).map(([c, of]) => t(c, of)),
  ),
})).type;

test('Arc<T> is Send exactly when it is Sync, exactly when T is both: Arc adds neither trait', () => {
  fc.assert(
    fc.property(anyType, (inner) => {
      const arc = t('Arc', inner);
      assert.equal(isSend(arc), isSend(inner) && isSync(inner), nameOf(arc));
      assert.equal(isSync(arc), isSend(arc), nameOf(arc));
    }),
    params(),
  );
});

test('Mutex<T> is Send and Sync exactly when T is Send, so Arc<Mutex<T>> is too', () => {
  fc.assert(
    fc.property(anyType, (inner) => {
      const mutex = t('Mutex', inner),
        shared = t('Arc', mutex);
      assert.equal(isSend(mutex), isSend(inner), nameOf(mutex));
      assert.equal(isSync(mutex), isSend(inner), nameOf(mutex));
      assert.equal(isSend(shared) && isSync(shared), isSend(inner), nameOf(shared));
      assert.equal(quadrantOf(shared), isSend(inner) ? 1 : 3, nameOf(shared));
    }),
    params(),
  );
});

test('T is Sync exactly when &T is Send; Rc is never either; Cell and a MutexGuard each lack one', () => {
  fc.assert(
    fc.property(anyType, (inner) => {
      assert.equal(isSend(t('&', inner)), isSync(inner));
      assert.ok(!isSend(t('Rc', inner)) && !isSync(t('Rc', inner)));
      assert.equal(isSync(t('Cell', inner)), false);
      assert.equal(isSend(t('Cell', inner)), isSend(inner));
      assert.equal(isSend(t('MutexGuard', inner)), false);
      assert.equal(isSync(t('MutexGuard', inner)), isSync(inner));
    }),
    params(),
  );
});

test('rustc refuses the opening program with the error lines the explainer shows', { skip: rustcSkip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'send-sync-opening-'));
  try {
    const source = ['use std::{cell::Cell, sync::Arc, thread};', 'pub fn opening() {', ...OPENING, '}'].join('\n') + '\n';
    const errors = compile(RUSTC_BIN, dir, 'opening', source);
    assert.equal(errors.length, 1, errors.map((e) => e.rendered).join('\n'));
    const [error] = errors as [Diagnostic];
    assert.equal(error.code?.code, 'E0277');
    // The error's primary span is the closure on the spawn line.
    assert.equal(error.spans.find((s) => s.is_primary)!.line_start, 4);
    for (const line of OPENING_ERROR) assert.ok(plain(error.rendered).includes(line), `${line}:\n${error.rendered}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // And the model agrees: the opening's x is neither Send nor Sync.
  assert.equal(nameOf(OPENING_TYPE), 'Arc<Cell<i32>>');
  assert.deepEqual([isSend(OPENING_TYPE), isSync(OPENING_TYPE)], [false, false]);
});

test('the check question’s transfer type, Arc<MutexGuard<i32>>, is neither Send nor Sync', () => {
  const type = t('Arc', t('MutexGuard', INNERS.i32));
  assert.deepEqual([isSend(type), isSync(type), quadrantOf(type)], [false, false, 3]);
});
