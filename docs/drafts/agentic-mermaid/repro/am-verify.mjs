import { D } from './diagrams.mjs';
const m = await import(process.argv[2] + '/node_modules/agentic-mermaid/dist/agent.js');
for (const [name, src] of Object.entries(D)) {
  const p = m.parseRegisteredMermaid(src);
  const v = p.ok ? m.verifyMermaid(p.value) : null;
  const facts = p.ok ? (m.describeMermaidFacts?.(p.value) ?? []) : [];
  console.log('agentic-mermaid', name, p.ok ? 'parses' : 'PARSE FAIL', v ? (v.ok ? 'verifies' : 'warnings ' + JSON.stringify(v.warnings).slice(0,120)) : '', '|', (Array.isArray(facts) ? facts : facts.facts ?? []).map(String).join('; ').slice(0, 160));
}
