const { chromium } = require('playwright');
(async () => {
  const { D } = await import(process.argv[3] + '/diagrams.mjs');
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<html><body></body></html>');
  await p.addScriptTag({ path: process.argv[2] + '/node_modules/mermaid/dist/mermaid.min.js' });
  await p.evaluate(() => mermaid.initialize({ startOnLoad: false }));
  for (const [name, src] of Object.entries(D)) {
    const r = await p.evaluate(async ([n, s]) => {
      try { const { svg } = await mermaid.render('d' + n.replace(/\W/g, ''), s);
        const el = document.createElement('div'); el.innerHTML = svg; document.body.append(el);
        const words = [...new Set([...el.querySelectorAll('text, span, p')].map((t) => t.textContent.trim()).filter((t) => /^[a-z]+$/.test(t)))].sort().join(',');
        return `OK ${svg.length} bytes; labels: ${words}; divider elements: ${el.querySelectorAll('svg *:not(style)[class*=divider]').length}`;
      } catch (e) { return 'FAIL ' + String(e.message ?? e).slice(0, 200); }
    }, [name, src]);
    console.log('mermaid', name, r);
  }
  await b.close();
})();
