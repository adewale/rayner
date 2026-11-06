import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query, result } from './answers.ts';
import { find, closeness, distance, run, ITEMS } from './model.ts';

test('the first check’s query matches no title and suggests none', () => {
  assert.equal(query, 'cloud key');
  assert.equal(result.matches.length, 0);
  assert.ok(!result.suggestions);
});

// Expected values are the assertions in 2password's test/find.test.ts, which uses the same three items.
test('2password find port gives upstream test answers', () => {
  assert.deepEqual(find(['database', 'cloud api', 'cloud']).matches, [
    {
      ref: 'op://Personal/Cloud API/credential',
      title: 'Cloud API',
      kind: 'api-credential',
      queries: ['cloud api', 'cloud'],
    },
    { ref: 'op://Work/Cloud Login/password', title: 'Cloud Login', kind: 'login', queries: ['cloud'] },
    { ref: 'op://Work/Database/password', title: 'Database', kind: 'database', queries: ['database'] },
  ]);
  const miss = find(['databse', 'nothing like this']);
  assert.deepEqual(miss.fetched, ['Database']);
  assert.deepEqual(miss.matches, []);
  assert.deepEqual(miss.suggestions, [
    { query: 'databse', ref: 'op://Work/Database/password', title: 'Database', kind: 'database' },
  ]);
  assert.deepEqual(find(['database']).matches, [
    { ref: 'op://Work/Database/password', title: 'Database', kind: 'database' },
  ]);
  // By hand: one insertion turns databse into database (1 − 1/8); Cloud API's best word, api, is 6 edits away (1 − 6/7).
  assert.equal(distance('databse', 'database'), 1);
  assert.equal(closeness(['databse'], 'Database'), 0.875);
  assert.equal(closeness(['databse'], 'Cloud API'), 1 - 6 / 7);
  assert.equal(closeness(['databse'], 'Cloud Login'), 0);
  assert.equal(closeness(['opnai', 'key'], 'OpenAI API Key'), (1 - 1 / 6 + 1) / 2);
  assert.ok(!JSON.stringify(find(['cloud', 'databse'])).includes('secret-'));
});

test('2password find returns references and no field value, and compares queries with titles alone', () => {
  const queries = [['cloud api', 'databse'], ['cloud'], ['cloud key'], ['clod api'], ['database', 'nothing like this']];
  const values = ITEMS.flatMap((i) => i.fields.map((f) => f.value));
  // Every value the vault holds is absent from every answer find prints.
  for (const q of queries) {
    const printed = JSON.stringify(find(q));
    for (const v of values) assert.ok(!printed.includes(v), `${q.join(', ')} printed ${v}`);
  }
  // Changing every secret changes no answer: only titles decide what comes back.
  const changed = ITEMS.map((i) => ({ ...i, fields: i.fields.map((f) => ({ ...f, value: `${i.title} other secret` })) }));
  for (const q of queries) assert.deepEqual(find(q, changed), find(q));
});

test('2password run strips the service token only when op holds one', () => {
  const ref = { API_KEY: 'op://Personal/Cloud API/credential' };
  const service = run('service', ref, ['app']),
    desktop = run('desktop', ref, ['app']);
  assert.deepEqual(service.argv, ['op', 'run', '--', 'env', '-u', 'OP_SERVICE_ACCOUNT_TOKEN', 'app']);
  assert.deepEqual(desktop.argv, ['op', 'run', '--', 'app']);
  assert.ok('OP_SERVICE_ACCOUNT_TOKEN' in service.opEnv);
  for (const r of [service, desktop])
    assert.deepEqual(r.childEnv, { PATH: '/usr/bin', API_KEY: 'secret-cloud-api' });
});
