const dir = process.argv[2];
const m = await import(dir + '/node_modules/agentic-mermaid/dist/agent.js');
const v = (await import(dir + '/node_modules/agentic-mermaid/package.json', { with: { type: 'json' } })).default.version;
function run(name, source, ops) {
  const p = m.parseRegisteredMermaid(source);
  if (!p.ok) return console.log(v, name, 'PARSE FAIL', JSON.stringify(p.error).slice(0, 200));
  let d = m.asState(p.value);
  for (const op of ops) {
    const r = m.mutate(d, op);
    if (!r.ok) return console.log(v, name, 'FAIL at', op.kind, '->', (r.error?.message ?? JSON.stringify(r.error)).slice(0, 220));
    d = r.value;
  }
  const out = m.serializeMermaid(d);
  console.log(v, name, 'OK ->', out.replace(/\n/g, ' | '));
}
// Bug 1: make_composite after remove_transition in the same edit list.
run('remove-then-composite', 'stateDiagram-v2\n a --> b\n a --> c', [
  { kind: 'remove_transition', from: 'a', to: 'c' },
  { kind: 'make_composite', id: 'g', members: ['a', 'b'] },
]);
run('composite-then-remove (control)', 'stateDiagram-v2\n a --> b\n a --> c', [
  { kind: 'make_composite', id: 'g', members: ['a', 'b'] },
  { kind: 'remove_transition', from: 'a', to: 'c' },
]);
// Bug 2: no edit adds a concurrency region to a composite.
run('add-state-in-region-1', 'stateDiagram-v2\n state on {\n  idle --> busy\n }', [
  { kind: 'add_state', id: 'still', parent: 'on', region: 1 },
]);
run('add-transition-in-region-1', 'stateDiagram-v2\n state on {\n  idle --> busy\n }', [
  { kind: 'add_transition', from: 'still', to: 'frothing', parent: 'on', region: 1 },
]);
run('region-1-exists (control)', 'stateDiagram-v2\n state on {\n  idle --> busy\n  --\n  still --> frothing\n }', [
  { kind: 'add_state', id: 'x', parent: 'on', region: 1 },
]);
