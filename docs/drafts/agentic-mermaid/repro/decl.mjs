const dir = process.argv[2];
const m = await import(dir + '/node_modules/agentic-mermaid/dist/agent.js');
const v = (await import(dir + '/node_modules/agentic-mermaid/package.json', { with: { type: 'json' } })).default.version;
const canon = (src) => { const p = m.parseRegisteredMermaid(src); return p.ok ? m.serializeMermaid(p.value) : 'PARSE FAIL'; };
const facts = (src) => { const p = m.parseRegisteredMermaid(src); return p.ok ? [...(m.describeMermaidFacts(p.value) ?? [])].map(String).sort().join('; ') : 'PARSE FAIL'; };
const show = (s) => s.replace(/\n/g, ' | ');
// Remove the only transition that mentions `off`.
const before = 'stateDiagram-v2\n  idle --> busy\n  busy --> off';
let d = m.asState(m.parseRegisteredMermaid(before).value);
const r = m.mutate(d, { kind: 'remove_transition', from: 'busy', to: 'off' });
const edited = m.serializeMermaid(r.value);
console.log(v, 'edit result:      ', show(edited));
for (const [label, target] of [
  ['target without off', 'stateDiagram-v2\n  idle --> busy'],
  ['target, off first ', 'stateDiagram-v2\n  off\n  idle --> busy'],
  ['target, off last  ', 'stateDiagram-v2\n  idle --> busy\n  off'],
]) {
  console.log(v, label, '| canonical equal:', canon(target) === edited, '| facts equal:', facts(target) === facts(edited), '| canonical:', show(canon(target)));
}
// A state that only ever appeared in transitions: is it kept or dropped by remove_state-free edits?
console.log(v, 'facts of edit:', facts(edited));
