import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { CORPUS } from './fixtures/motion-corpus/corpus.ts';
import { againstBaseline, authoredRefusal, guardRefusal, type EntryResult, type Found } from '../tools/repo/motion-corpus-lib.ts';
import { recall, runCorpus, workerResult } from '../tools/repo/motion-corpus.ts';

const observation = (segment: string, path: string, t: number): Found => ({
  scenario: '{}',
  line: `${segment}: flicker: part “title” (${path}) at ${t} s went away and came back`,
});

function result(id: string, findings: Found[] = []): EntryResult {
  return { id, caught: findings.length > 0, findings, fresh: findings, ms: 0, status: 'complete' };
}

test('reader context wrappers retain typed duration refusals without crediting lookalike errors', () => {
  const entry = CORPUS.find(e => e.id === 'conversations-turn-over-seat-name')!;
  const message = 'machine.send("ask"): authored transition lasts 2.000 s but the event allows 1.800 s; increase the machine runTime';
  const refusal = new RangeError(message);
  assert.equal(guardRefusal(entry, new Error('Machine 1 at step "close"', {cause: refusal}))?.line, 'duration guard: ' + message);
  assert.equal(guardRefusal(entry, new Error(message)), undefined);
  assert.equal(guardRefusal(entry, new Error('wrapper', {cause: new TypeError(message)})), undefined);
  assert.equal(guardRefusal(entry, new Error('wrapper', {cause: new RangeError('unrelated range failure')})), undefined);
  const cycle = new Error('cycle'); cycle.cause = cycle;
  assert.equal(guardRefusal(entry, cycle), undefined);
});

test('the Sessions pacing refusal credits only its declared historical budget violation', () => {
  const entry = CORPUS.find(e => e.id === 'sessions-too-long')!;
  const reasons = [
    "Sessions tamper pacing: 3.100 s exceeds this ticket-check sequence's 2.850 s budget",
    "Sessions tamper pacing: 4.350 s exceeds this key-transfer sequence's 3.900 s budget",
  ];
  for (const reason of reasons) {
    assert.equal(authoredRefusal(entry, new Error(reason))?.line, 'authored pacing guard: ' + reason);
    assert.equal(authoredRefusal(entry, new TypeError(reason)), undefined, 'a wrong exception type is not this refusal');
    assert.equal(authoredRefusal({...entry, expectedRefusal: undefined}, new Error(reason)), undefined);
    assert.equal(authoredRefusal(entry, new Error('unrelated failure: ' + reason)), undefined);
  }
  for (const reason of [
    'missing mutation anchor',
    "Sessions tamper pacing: 3.100 s exceeds this ticket-check sequence's 1.000 s budget",
    "Sessions tamper pacing: 9.000 s exceeds this key-transfer sequence's 3.900 s budget",
  ]) assert.equal(authoredRefusal(entry, new Error(reason)), undefined);
  const base = result('base-poppy-sessions', [authoredRefusal(entry, new Error(reasons[0]!))!]);
  assert.match(againstBaseline(result(entry.id, [observation('check', 'stamp', 0.2)]), base).error!, /base-poppy-sessions/);
  const warning = result(entry.id, [observation('check', 'stamp', 0.2)]);
  assert.equal(againstBaseline(warning, result('base'), entry.expectedFinding, entry.expectedRefusal).caught, false);
  assert.equal(recall([entry], [warning]).caught, 0, 'an unrelated rejection cannot satisfy a declared refusal');
  const expected = authoredRefusal(entry, new Error(reasons[0]!))!;
  const matched = againstBaseline(result(entry.id, [expected]), result('base'), entry.expectedFinding, entry.expectedRefusal);
  assert.equal(recall([entry], [matched]).caught, 1);
  assert.equal(recall([entry], [matched]).evidence.declaredRefusals, 1);
  const lookalike = {...expected, observation: undefined};
  assert.equal(recall([entry], [result(entry.id, [lookalike])]).caught, 0, 'exception prose alone does not prove its type');
});

test('baseline subtraction preserves a different covered victim, label or foreground mask', () => {
  const covered = (text: string, victim: string, mask = 'ticket'): Found => ({scenario: '{}',
    line: `send: covers: part “${mask}” at 0.2 s travels over “${text}” (part “${victim}”), covering 40% of it, for 0.2 s before it lands; fix: a route`});
  const original = covered('API', 'lane:api');
  const other = [covered('Chat', 'lane:chat'), covered('API', 'other:api'), covered('API', 'lane:api', 'parcel')];
  const difference = againstBaseline(result('variant', [original, ...other]), result('base', [original]));
  assert.deepEqual(difference.fresh, other);
});

test('corpus scoring derives evidence rather than trusting caught, and separates rejection from exact targets', () => {
  const entry = CORPUS.find(e => !e.expectedFinding && !e.expectedRefusal)!;
  assert.equal(recall([entry], [{...result(entry.id), caught: true}]).caught, 0);
  const score = recall([entry], [{...result(entry.id, [observation('send', 'word', 0.4)]), caught: false}]);
  assert.equal(score.caught, 1);
  assert.equal(score.evidence.rejected, 1);
  assert.equal(score.evidence.unattributedWarnings, 1);
  assert.equal(score.evidence.exactMatches, 0);
});

test('worker completion requires a successful process and a complete typed result with its expected identity', () => {
  const row = result('probe', [observation('send', 'word', 0.4)]);
  const bytes = JSON.stringify(row);
  for (const code of [0, 17]) {
    const child = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', `process.stdout.write(${JSON.stringify(bytes)},()=>process.exit(${code}))`], {encoding: 'utf8', timeout: 10_000});
    assert.equal(child.status, code);
    const read = workerResult('probe', child.stdout, child.status, child.signal, child.stderr);
    if (code === 0) assert.deepEqual(read, row);
    else {
      assert.match(read.error!, /exit 17/);
      assert.deepEqual(read.findings, row.findings, 'failed workers retain partial observations without credit');
      assert.equal(read.caught, false);
      assert.deepEqual(read.fresh, []);
    }
  }
  for (const damaged of [
    {...row, id: 'another'}, {...row, status: undefined}, {...row, status: 'refused'},
    {...row, findings: [{}]}, {...row, fresh: [observation('other', 'word', 1)]}, {...row, ms: -1},
  ]) assert.match(workerResult('probe', JSON.stringify(damaged), 0, null).error!, /worker probe:/);
  assert.match(workerResult('probe', bytes, null, 'SIGTERM').error!, /SIGTERM/);
  // Exercise the actual runInChild boundary in an isolated parent. Its spawn is redirected
  // to a real child with controlled stdout/exit, so reverting its exit handling breaks this.
  const runner = new URL('../tools/repo/motion-corpus.ts', import.meta.url).href;
  const parent = `import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
const spawn=cp.spawn;cp.spawn=(exe,args,options)=>spawn(exe,['-e',${JSON.stringify(`process.stdout.write(${JSON.stringify(bytes)},()=>process.exit(17))`)}],options);
syncBuiltinESMExports();const{runInChild}=await import(${JSON.stringify(runner)});process.stdout.write(JSON.stringify(await runInChild('probe')));`;
  const processResult = spawnSync(process.execPath, ['--max-old-space-size=512', '--input-type=module', '-e', parent], {encoding: 'utf8', timeout: 15_000});
  assert.equal(processResult.status, 0, processResult.stderr);
  const failed = JSON.parse(processResult.stdout) as EntryResult;
  assert.match(failed.error!, /exit 17/);
  assert.deepEqual(failed.findings, row.findings);
  assert.deepEqual(failed.fresh, []);
});

test('worker pipes preserve split UTF-8 observations and diagnostics without crediting failed workers', () => {
  const row = result('probe', [observation('send', 'word 🧭', 0.4)]), bytes = JSON.stringify(row);
  const fresh = bytes.indexOf('"fresh":');
  const split = Buffer.byteLength(bytes.slice(0, bytes.indexOf('“', fresh))) + 1;
  assert.equal(Buffer.from(bytes)[split - 1], 0xe2, 'split a three-byte quote inside the fresh copy');
  const diagnostic = 'worker “diagnostic” 🧭';
  const errorSplit = Buffer.byteLength(diagnostic.slice(0, diagnostic.indexOf('“'))) + 1;
  const runner = new URL('../tools/repo/motion-corpus.ts', import.meta.url).href;
  for (const code of [0, 17]) {
    const childSource = `const out=Buffer.from(${JSON.stringify(Buffer.from(bytes).toString('base64'))},'base64');
const err=Buffer.from(${JSON.stringify(Buffer.from(diagnostic).toString('base64'))},'base64');
process.stdin.once('data',()=>{let pending=2;const done=()=>{if(!--pending)process.exit(${code})};
process.stdout.write(out.subarray(${split}),done);process.stderr.write(err.subarray(${errorSplit}),done)});
process.stderr.write(err.subarray(0,${errorSplit}));process.stdout.write(out.subarray(0,${split}));`;
    // The child waits until its first stdout chunk has reached the real parent pipe.
    // This handshake forces the byte boundary without timing or scheduler assumptions.
    const parent = `import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
const spawn=cp.spawn;cp.spawn=(exe,args,options)=>{const child=spawn(exe,['--max-old-space-size=128','-e',${JSON.stringify(childSource)}],{...options,stdio:['pipe','pipe','pipe']});
child.stdout.once('data',()=>child.stdin.end('continue'));return child};
syncBuiltinESMExports();const{runInChild}=await import(${JSON.stringify(runner)});process.stdout.write(JSON.stringify(await runInChild('probe')));`;
    const run = spawnSync(process.execPath, ['--max-old-space-size=512', '--input-type=module', '-e', parent], {encoding: 'utf8', timeout: 15_000});
    assert.equal(run.status, 0, run.stderr);
    const read = JSON.parse(run.stdout) as EntryResult;
    if (code === 0) assert.deepEqual(read, row);
    else {
      assert.match(read.error!, /exit 17/);
      assert.ok(read.error!.includes(diagnostic), 'stderr keeps its split Unicode diagnostic');
      assert.deepEqual(read.findings, row.findings);
      assert.deepEqual(read.fresh, []);
      assert.equal(read.caught, false);
    }
  }
});

test('the baseline removes a shifted finding on the same part and retains findings in another transition or part', () => {
  const before = observation('press: open: gate', 'ledger (old)/title', 0.4);
  const shifted = observation('press: open: gate', 'ledger (old)/title', 0.6);
  const elsewhere = observation('press: open: gate', 'panel/title', 0.6);
  const later = observation('step "open", play 2', 'ledger/title', 0.6);
  const baseline = result('base-chapter', [before]);
  const variant = result('variant', [shifted, elsewhere, later]);
  assert.deepEqual(againstBaseline(variant, baseline).fresh, [elsewhere, later]);
  assert.equal(againstBaseline(result('variant', [shifted]), baseline).caught, false);
});

test('a failed baseline or variant preserves its observations and cannot produce a score', () => {
  const entry = CORPUS[0]!;
  const variant = result(entry.id, [observation('send', 'ledger/title', 0.4)]);
  for (const failed of [
    againstBaseline(variant, { ...result('base-chapter'), error: 'font could not load' }),
    againstBaseline(variant, result('base-chapter', [{ scenario: 'during authored replay', line: 'duration guard: machine.send("send"): authored transition lasts 3.000 s' }])),
    againstBaseline({ ...variant, error: 'replay interrupted' }, result('base-chapter')),
  ]) {
    assert.equal(failed.caught, false);
    assert.deepEqual(failed.fresh, []);
    assert.deepEqual(failed.findings, variant.findings);
    assert.throws(() => recall([entry], [failed]), /cannot score corpus/);
  }
});

test('credit for the device poll requires fresh observed occlusion of the company name by that poll in a collect transition', () => {
  const entry = CORPUS.find(e => e.id === 'sign-in-poll-over-card')!;
  assert.ok(entry.expectedFinding);
  const scenario = '{"flow":"device"}';
  const label = '“Example Company” stays readable by opacity but “poll”, an opaque foreground shape, hides 2 glyphs for 0.10 s';
  const story = `step "ask", play 1, event 2: occluded words: part “card” at 0.900 s ${label}; fix: move the foreground`;
  const press = story.replace('step "ask", play 1, event 2', 'after ask, collect');
  const baseline = result('base-chapter', [{ scenario, line: press.replace('“poll”', '“receipt”') }]);
  const matching = [{ scenario, line: story }, { scenario, line: press }];
  const unrelated = [
    { scenario, line: 'duration guard: machine.send("collect"): authored transition lasts 3.000 s' },
    { scenario, line: press.replace('occluded words', 'flicker') },
    { scenario, line: press.replace('after ask, collect', 'after collect, ask') },
    { scenario, line: press.replace('part “card”', 'part “receipt”') },
    { scenario, line: press.replace('“Example Company”', '“another name”') },
    { scenario, line: press.replace('“poll”', '“tag”') + ' “poll”' }, // A suggested fix cannot earn credit.
    { scenario: '{"flow":"direct"}', line: press },
  ];
  const raw = result(entry.id, unrelated);
  assert.equal(recall([entry], [raw]).caught, 0, 'an unrelated rejection cannot inflate the score');
  const missed = againstBaseline(raw, baseline, entry.expectedFinding);
  assert.equal(missed.caught, false);
  assert.deepEqual(missed.fresh, unrelated);
  assert.deepEqual(missed.attributed, []);
  const caught = againstBaseline(result(entry.id, [...unrelated, ...matching]), baseline, entry.expectedFinding);
  assert.deepEqual(caught.attributed, matching);
  assert.equal(recall([entry], [caught]).caught, 1);
  const seen = againstBaseline(result(entry.id, matching), result('base-chapter', matching), entry.expectedFinding);
  assert.equal(recall([entry], [seen]).caught, 0);
});

test('a report counts the requested identities and rejects missing, duplicate or unexpected rows', () => {
  const first = CORPUS[0]!, second = CORPUS.find(e => e.kind !== first.kind && !e.expectedFinding)!;
  const missed = result(first.id), caught = result(second.id, [observation('send', 'ledger/title', 0.4)]);
  const score = recall([first, second], [caught, missed]);
  assert.equal(score.caught, 1);
  assert.equal(score.of, 2);
  assert.deepEqual(score.byKind[first.kind], { caught: 0, of: 1 });
  assert.deepEqual(score.byKind[second.kind], { caught: 1, of: 1 });
  for (const invalid of [[missed], [missed, missed], [missed, result('outside-corpus')]])
    assert.throws(() => recall([first, second], invalid), /cannot score corpus/);
  assert.throws(() => recall([first, first], [missed, missed]), /cannot score corpus/);
});

test('the reconstructed people slide earns credit for its observed tag crossing in the reask step', () => {
  const entry = CORPUS.find(e => e.id === 'sign-in-ask-people-slide')!;
  assert.ok(entry.expectedFinding);
  const scenario = '{"flow":"direct"}';
  const line = 'step "reask", play 1, event 1: occluded words: part “page:orders:write:line” at 3.100 s ' +
    '“Exchange items” stays readable by opacity but “tag”, an opaque foreground shape, covers at least 90% of 6 glyph boxes for 0.43 s';
  const match = { scenario, line };
  const unrelated = [
    { scenario, line: line.replace('occluded words', 'jump') },
    { scenario, line: line.replace('“tag”', '“agent:station”') },
    { scenario, line: line.replace('“Exchange items”', '“password”') },
    { scenario, line: line.replace('play 1, event 1', 'play 1, event 2') },
    { scenario, line: line.replace('page:orders:write:line', 'page:hint') },
    { scenario: '{"flow":"device"}', line },
    { scenario, line: 'duration guard: machine.send("ask"): authored transition lasts 4.800 s' },
  ];
  const wrong = result(entry.id, unrelated);
  assert.equal(recall([entry], [wrong]).caught, 0);
  assert.equal(againstBaseline(wrong, result('base-chapter'), entry.expectedFinding).caught, false);
  const caught = againstBaseline(result(entry.id, [...unrelated, match]), result('base-chapter'), entry.expectedFinding);
  assert.deepEqual(caught.attributed, [match]);
  assert.equal(recall([entry], [caught]).caught, 1);
  assert.equal(againstBaseline(caught, result('base-chapter', [match]), entry.expectedFinding).caught, false);
});

test('the fast variant-only run identifies that it omitted comparison scenes', async () => {
  assert.equal((await runCorpus([], { bases: false })).comparison, 'variants-only');
  assert.equal((await runCorpus([])).comparison, 'baseline-subtracted');
  await assert.rejects(runCorpus([], { jobs: 0 }), /jobs must be a positive integer/);
});

test('each new semantic gain requires its observed event, trip, subject and requirement', () => {
  const rows = [
    ['poppy-last-object-lingers', '{"approve":"read-write"}', 'step "lanes", event "browse"', 'ticket:flight', 'exhibit:mark', 'absent'],
    ['sessions-key-to-wax-after-check', '{"company":"remembers"}', 'step "signer", event "published"', 'ticket:flight', 'chain:ring:on-wax', 'present'],
    ['sessions-key-in-two-places', '{"company":"remembers"}', 'step "signer", event "published"', 'chain:ring:on-wax:flight', 'chain:ring', 'absent'],
    ['browser-record-after-halves', '{"signin":"signed-in"}', 'step "load", event "load"', 'page:stub:flight', 'row:Vn3q:stub', 'present'],
    ['browser-message-lingers', '{"signin":"signed-in"}', 'after load, authorize, submit, phish, forge', 'forged', 'message', 'absent'],
    ['conversations-table-block-blinks', '{}', 'step "read", event "read"', 'turn:flight', 'written:title:0', 'present'],
    ['refusals-lanes-gone-in-flight', '{}', 'step "one-door", event "mcp"', 'ticket:flight', 'lane:mcp-mcp:line', 'present'],
    ['sign-in-pages-overlap', '{"flow":"device"}', 'step "ask", event "ask"', 'request', 'window:frame', 'absent'],
    ['sign-in-password-hand-and-flight', '{"flow":"direct"}', 'step "approve", event "approve-read"', 'page:password:flight', 'you:password', 'absent'],
  ] as const;
  assert.equal(rows.length, 9);
  for (const [id, scenario, event, trip, subject, requirement] of rows) {
    const entry = CORPUS.find(e => e.id === id)!;
    assert.ok(entry.expectedFinding);
    const line = `${event}: motion contract: during "${trip}", subject "${subject}" must be ${requirement} at +0.700 s`;
    const observed = {scenario, line};
    const unrelated = [
      {scenario: '{"unrelated":"scenario"}', line},
      {scenario, line: line.replace(event, 'an unrelated event')},
      {scenario, line: line.replace(`during "${trip}"`, 'during "another-trip"')},
      {scenario, line: line.replace(`subject "${subject}"`, 'subject "another-subject"')},
      {scenario, line: line.replace(`must be ${requirement}`, `must be ${requirement === 'present' ? 'absent' : 'present'}`)},
      {scenario, line: `${event}: motion contract: during "${trip}", the declared travel was never constructed`},
      {scenario, line: 'duration guard: machine.send("send"): authored transition lasts 3.000 s'},
    ];
    assert.equal(recall([entry], [result(id, unrelated)]).caught, 0, id);
    const matched = againstBaseline(result(id, [...unrelated, observed]), result('base'), entry.expectedFinding);
    assert.deepEqual(matched.attributed, [observed], id);
    assert.equal(recall([entry], [matched]).caught, 1, id);
    const shifted = {...observed, line: line.replace('+0.700', '+0.900')};
    const known = againstBaseline(result(id, [shifted]), result('base', [observed]), entry.expectedFinding);
    assert.deepEqual(known.fresh, [], 'a shifted baseline warning earns no new credit');
    assert.equal(recall([entry], [known]).caught, 0, id);
  }
});
