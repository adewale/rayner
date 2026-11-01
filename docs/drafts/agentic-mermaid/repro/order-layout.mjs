const dir = process.argv[2];
const am = await import(dir + '/node_modules/agentic-mermaid/dist/index.js');
const render = am.renderMermaidSVG ?? am.renderMermaid;
const a = await render('stateDiagram-v2\n  off\n  idle --> busy'), b = await render('stateDiagram-v2\n  idle --> busy\n  off');
const svg = (r) => typeof r === 'string' ? r : r.svg ?? r.value?.svg ?? JSON.stringify(r).slice(0, 100);
const pos = (s, label) => { const m = new RegExp(`<text[^>]*x="([\\d.]+)"[^>]*y="([\\d.]+)"[^>]*>(?:<[^>]+>)*${label}<`).exec(s); return m ? `${m[1]},${m[2]}` : '?'; };
const A = svg(a), B = svg(b);
console.log('identical SVG:', A === B, '| off at', pos(A, 'off'), 'vs', pos(B, 'off'), '| idle at', pos(A, 'idle'), 'vs', pos(B, 'idle'));
