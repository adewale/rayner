import { D } from './diagrams.mjs';
const pele = await import(process.argv[2] + '/node_modules/pele/dist/pele.js');
for (const [name, src] of Object.entries(D)) {
  try {
    const r = await pele.render(src);
    const svg = typeof r === 'string' ? r : r.svg;
    const words = [...new Set([...svg.matchAll(/>([a-z]+)</g)].map((m) => m[1]))].sort().join(',');
    console.log('pele', name, 'OK', svg.length, 'bytes; labels:', words, '; dashed:', /stroke-dasharray/.test(svg));
  } catch (e) { console.log('pele', name, 'FAIL', String(e.message ?? e).slice(0, 200)); }
}
