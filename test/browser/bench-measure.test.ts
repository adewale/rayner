import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { launch } from '../../tools/lib/browser.ts';
import { measure } from '../../tools/lib/bench-measure.ts';

for (const corrupt of [false, true])
  for (const disclosures of [0, 1, 2])
    test(
      `${corrupt ? 'benchmark refuses corrupt observer data' : 'benchmark observes click blocking, stage writes and rests'}; ${disclosures} source disclosures`,
      { skip: !process.env.EXPLAIN_BROWSER },
      async () => {
        const mainSteps =
          '<div class="steps"><button data-step="one">one</button><button data-step="two">two</button>' +
          (disclosures ? '' : '<button data-step="three">three</button>') +
          '</div>';
        const references = disclosures
          ? '<details class="supporting"><summary>Details and sources</summary><div class="steps supporting-steps"><button data-step="three">three</button></div></details>'
          : '';
        // A plain main step can use its segment without opening the closed rail.
        // Nested references require both the rail and the supporting disclosure.
        const rail =
          disclosures === 1
            ? mainSteps + references
            : '<details class="rail"><summary>All steps</summary>' + mainSteps + references + '</details>';
        const html =
          '<!doctype html><div class="stage"><span>one</span></div><div class="stepper"><button class="primary">Next</button>' +
          '<ol class="step-bar"><button data-step="one"></button><button data-step="two"></button>' +
          (disclosures ? '' : '<button data-step="three"></button>') +
          '</ol></div>' +
          rail +
          '<script>' +
          'const finish=n=>requestAnimationFrame(()=>setTimeout(()=>document.dispatchEvent(new CustomEvent("rayner:step",{detail:{step:n}})),0));' +
          'document.querySelector(".primary").onclick=()=>{const start=performance.now();while(performance.now()-start<120){}document.querySelector(".stage span").textContent="two";finish("two")};' +
          'for(const button of document.querySelectorAll("[data-step=three]"))button.onclick=()=>{document.querySelector(".stage span").textContent="three";' +
          (corrupt ? 'window.__bench.shifts.push([NaN,1]);' : '') +
          'finish("three")};' +
          'for(const summary of document.querySelectorAll("summary"))summary.onclick=()=>{const start=performance.now();while(performance.now()-start<100){}};' +
          // The caller's requested viewport must reach the actual browser context.
          'if(innerWidth!==512)window.__bench.shifts.push([NaN,1]);' +
          'requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.dataset.ready="true"));</script>';
        const server = createServer((_, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const browser = await launch();
        try {
          const address = server.address();
          assert.ok(address && typeof address === 'object');
          const options = { cpu: 1, readMs: 0, viewport: { width: 512, height: 768 } };
          if (corrupt) {
            await assert.rejects(
              measure(browser, 'http://127.0.0.1:' + address.port, options),
              /invalid trace observation/,
            );
            return;
          }
          const sample = await measure(browser, 'http://127.0.0.1:' + address.port, options);
          assert.equal(sample.trace.clicks.length, 2 + disclosures, 'include each real disclosure click');
          assert.deepEqual(
            sample.trace.steps.map(([name]) => name),
            ['two', 'three'],
          );
          assert.ok(sample.ready > 0);
          assert.ok(sample.motion >= 100, JSON.stringify(sample));
          assert.ok(sample.rest >= sample.motion);
          // A frame gap is clipped to the click→rest window, so the 120 ms busy loop
          // need not leave an 80 ms gap when its first/last frames straddle that window.
          assert.ok(sample.gap > 50, JSON.stringify(sample));
          assert.ok(sample.blocking >= 40, JSON.stringify(sample));
          assert.ok(sample.blocking <= sample.rest + sample.jump);
          if (disclosures) {
            assert.ok(sample.jump >= disclosures * 100, 'jump starts with opening the first disclosure');
            const [next, jump] = sample.trace.clicks;
            const rested = sample.trace.steps.find(([name]) => name === 'two')![1];
            const jumped = sample.trace.steps.find(([name]) => name === 'three')![1];
            // Blocking excludes each task's first 50 ms, then clips to the action window.
            const clipped = (from: number, until: number) =>
              sample.trace.tasks.reduce(
                (sum, [at, duration]) => sum + Math.max(0, Math.min(until, at + duration) - Math.max(from, at + 50)),
                0,
              );
            assert.ok(clipped(jump!, jumped) >= disclosures * 40, 'each disclosure contributes measured blocking');
            assert.ok(
              Math.abs(sample.blocking - clipped(next!, rested) - clipped(jump!, jumped)) < 1e-6,
              'reported blocking includes both navigation windows, starting with the first disclosure',
            );
          }
          assert.equal(sample.shift, 0);
        } finally {
          await browser.close();
          await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
      },
    );
