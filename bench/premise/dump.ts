// Prints every scenario's steps (title and caption) and check answers of a method-only page, for the
// fact-check: node bench/premise/dump.ts <topic>. Steps repeated word for word from an earlier scenario
// are printed once.
const topic = process.argv[2];
const page = await import(`./${topic}/method/page.ts`);
const scenarios: Record<string, () => { id: string; title: string; caption: string }[]> = {};
if (topic === 'ext4-space') for (const s of ['1g', '1t', '20t']) for (const m of [5, 1, 0]) scenarios[`${s} -m ${m}`] = () => page.steps(s, m);
if (topic === 'cert-renewal') for (const k of ['90d', '64d', '45d', '160h']) for (const r of ['fraction', 'fixed30']) scenarios[`${k} ${r}`] = () => page.steps(k, r);
if (topic === 'isdigit') for (const c of ['arabic', 'super', 'half', 'roman', 'han']) for (const g of ['isdecimal', 'isdigit', 'isnumeric']) scenarios[`${c} ${g}`] = () => page.steps(c, g);
if (topic === 'poppy-browser') for (const k of page.SETTING_KEYS) scenarios[k] = () => page.steps(k);
const seen = new Set<string>();
for (const [name, f] of Object.entries(scenarios)) {
  console.log(`\n## ${name}`);
  for (const s of f()) {
    const key = `${s.id}|${s.title}|${s.caption}`;
    if (seen.has(key)) {
      console.log(`  [same] ${s.id}`);
      continue;
    }
    seen.add(key);
    console.log(`  ${s.id} | ${s.title}\n     ${s.caption}`);
  }
}
console.log('\n## checks');
for (const c of page.CHECKS) console.log(`Q ${c.q}\nA ${c.a}`);
