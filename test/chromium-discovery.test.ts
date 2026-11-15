// Which Chromium launch() uses (tools/lib/browser.ts), against a fake filesystem and a fake launcher:
// no browser runs here. test/browser/explain-review-scene.test.ts checks the real launch and receipt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Browser } from 'playwright-core';
import {
  MAJOR_WINDOW,
  candidates,
  choose,
  describeChromium,
  pinnedChromium,
  playwrightFolders,
  systemBrowsers,
  withinWindow,
} from '../tools/lib/browser.ts';
import type { Candidate, Host, Pinned, Probe } from '../tools/lib/browser.ts';

const PINNED: Pinned = { revision: 1248, version: '156.0.8078.4' };
const SHELL = 'chrome-headless-shell-linux64/chrome-headless-shell';
const FULL = 'chrome-linux64/chrome';

/** A machine holding exactly `files`; folders are whatever those paths imply. */
function host(files: string[], env: Record<string, string> = {}, platform: NodeJS.Platform = 'linux'): Host {
  const set = new Set(files);
  return {
    env: { PATH: '/usr/local/bin:/usr/bin', ...env },
    platform,
    home: '/home/a',
    playwrightCore: '/repo/node_modules/playwright-core',
    isFile: (path) => set.has(path),
    list: (dir) => [...new Set(files.filter((f) => f.startsWith(dir + '/')).map((f) => f.slice(dir.length + 1).split('/')[0]!))],
  };
}
/** A complete Playwright install of `dir` (chromium-N or chromium_headless_shell-N) under `base`. */
const build = (base: string, dir: string) => [
  `${base}/${dir}/INSTALLATION_COMPLETE`,
  `${base}/${dir}/${dir.includes('headless_shell') ? SHELL : FULL}`,
];
const CACHE = '/home/a/.cache/ms-playwright';

test('the pinned build comes from playwright-core, as its install command downloads it', () => {
  const pinned = pinnedChromium();
  assert.ok(Number.isSafeInteger(pinned.revision) && pinned.revision > 1000);
  assert.match(pinned.version, /^\d+\.\d+\.\d+\.\d+$/);
});

test('discovery order: pinned revision, other Playwright builds newest first (shell first), then system installs', () => {
  const files = [
    ...build(CACHE, 'chromium-1193'),
    ...build(CACHE, 'chromium-1243'),
    ...build(CACHE, 'chromium_headless_shell-1243'),
    ...build(CACHE, 'chromium-1248'),
    ...build(CACHE, 'chromium_headless_shell-1248'),
    ...build(CACHE, 'chromium_headless_shell-1250'),
    `${CACHE}/chromium_headless_shell-1260/${SHELL}`, // no INSTALLATION_COMPLETE: an interrupted download
    `${CACHE}/firefox-1555/INSTALLATION_COMPLETE`,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/local/bin/chromium', // earlier on PATH than /usr/bin/chromium
  ];
  assert.deepEqual(candidates(host(files), PINNED), [
    { path: `${CACHE}/chromium_headless_shell-1248/${SHELL}`, revision: 1248, source: 'pinned' },
    { path: `${CACHE}/chromium-1248/${FULL}`, revision: 1248, source: 'pinned' },
    { path: `${CACHE}/chromium_headless_shell-1250/${SHELL}`, revision: 1250, source: 'installed' },
    { path: `${CACHE}/chromium_headless_shell-1243/${SHELL}`, revision: 1243, source: 'installed' },
    { path: `${CACHE}/chromium-1243/${FULL}`, revision: 1243, source: 'installed' },
    { path: `${CACHE}/chromium-1193/${FULL}`, revision: 1193, source: 'installed' },
    { path: '/usr/bin/google-chrome', source: 'system' },
    { path: '/usr/local/bin/chromium', source: 'system' },
  ]);
});

test('CHROMIUM_EXECUTABLE_PATH is the only candidate when set', () => {
  const files = [...build(CACHE, 'chromium_headless_shell-1248'), '/usr/bin/google-chrome'];
  assert.deepEqual(candidates(host(files, { CHROMIUM_EXECUTABLE_PATH: '/opt/chrome' }), PINNED), [
    { path: '/opt/chrome', source: 'CHROMIUM_EXECUTABLE_PATH' },
  ]);
});

test('PLAYWRIGHT_BROWSERS_PATH replaces the cache, as Playwright reads it; RAYNER_SYSTEM_CHROMIUM=0 skips system installs', () => {
  const files = [...build(CACHE, 'chromium_headless_shell-1248'), ...build('/pw', 'chromium_headless_shell-1243'), '/usr/bin/google-chrome'];
  assert.deepEqual(candidates(host(files, { PLAYWRIGHT_BROWSERS_PATH: '/pw', RAYNER_SYSTEM_CHROMIUM: '0' }), PINNED), [
    { path: `/pw/chromium_headless_shell-1243/${SHELL}`, revision: 1243, source: 'installed' },
  ]);
  assert.deepEqual(playwrightFolders(host([], { PLAYWRIGHT_BROWSERS_PATH: '0' })), ['/repo/node_modules/playwright-core/.local-browsers']);
  assert.deepEqual(playwrightFolders(host([], { XDG_CACHE_HOME: '/xdg' })), ['/xdg/ms-playwright']);
  assert.deepEqual(playwrightFolders(host([], {}, 'darwin')), ['/home/a/Library/Caches/ms-playwright']);
  assert.deepEqual(candidates(host([], { PLAYWRIGHT_BROWSERS_PATH: '/nowhere', RAYNER_SYSTEM_CHROMIUM: '0' }), PINNED), []);
});

test('macOS system installs: PATH, then the application folders', () => {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromium = '/home/a/Applications/Chromium.app/Contents/MacOS/Chromium';
  assert.deepEqual(systemBrowsers(host([chromium, chrome, '/usr/local/bin/chromium'], {}, 'darwin')), ['/usr/local/bin/chromium', chrome, chromium]);
});

test('the compatibility window is MAJOR_WINDOW major versions either side of the pinned build', () => {
  assert.equal(withinWindow('153.0.8010.12', PINNED), true);
  assert.equal(withinWindow(`${156 - MAJOR_WINDOW}.0.1.2`, PINNED), true);
  assert.equal(withinWindow(`${156 + MAJOR_WINDOW}.0.1.2`, PINNED), true);
  assert.equal(withinWindow(`${156 - MAJOR_WINDOW - 1}.0.1.2`, PINNED), false);
  assert.equal(withinWindow(`${156 + MAJOR_WINDOW + 1}.0.1.2`, PINNED), false);
  assert.equal(withinWindow('140.0.7339.16', PINNED), false, 'the build whose renderer crashed under this playwright-core');
  assert.equal(withinWindow('not a version', PINNED), false);
});

/** A launcher that fails, or starts a fake browser of a version, per path; it records what ran and what closed. */
function launcher(outcomes: Record<string, string | Error>) {
  const tried: string[] = [], closed: string[] = [];
  const probe: Probe = async (c) => {
    tried.push(c.path);
    const outcome = outcomes[c.path];
    if (outcome === undefined) throw new Error(`browserType.launch: Executable doesn't exist at ${c.path}`);
    if (outcome instanceof Error) throw outcome;
    const browser = { close: async () => void closed.push(c.path), path: c.path } as unknown as Browser;
    return { browser, version: outcome };
  };
  return { probe, tried, closed };
}
const shell1248: Candidate = { path: '/pw/chromium_headless_shell-1248/shell', revision: 1248, source: 'pinned' };
const shell1243: Candidate = { path: '/pw/chromium_headless_shell-1243/shell', revision: 1243, source: 'installed' };
const old1193: Candidate = { path: '/pw/chromium-1193/chrome', revision: 1193, source: 'installed' };
const system: Candidate = { path: '/usr/bin/google-chrome', source: 'system' };

test('the first candidate that launches and renders is used; nothing after it is tried', async () => {
  const { probe, tried } = launcher({ [shell1248.path]: '156.0.8078.4', [shell1243.path]: '153.0.8010.12' });
  const { used } = await choose([shell1248, shell1243], probe, PINNED);
  assert.deepEqual(tried, [shell1248.path]);
  assert.deepEqual(used, { path: shell1248.path, version: '156.0.8078.4', source: 'pinned', revision: 1248, pinned: PINNED, pinnedInstalled: true, skipped: [] });
  assert.equal(describeChromium(used), `Chromium 156.0.8078.4: ${shell1248.path} (playwright-core's pinned revision 1248)`);
});

test('a candidate that fails to launch, or launches outside the window, falls through to the next', async () => {
  const crash = new Error('browserType.launch: Target page, context or browser has been closed\nBrowser logs: ...');
  const { probe, tried, closed } = launcher({ [shell1248.path]: crash, [old1193.path]: '140.0.7339.16', [system.path]: '153.0.8010.12' });
  const { browser, used } = await choose([shell1248, old1193, system], probe, PINNED);
  assert.deepEqual(tried, [shell1248.path, old1193.path, system.path]);
  assert.deepEqual(closed, [old1193.path], 'the out-of-window browser is closed, the chosen one is not');
  assert.equal((browser as unknown as { path: string }).path, system.path);
  assert.deepEqual(used.skipped, [
    { path: shell1248.path, reason: 'browserType.launch: Target page, context or browser has been closed' },
    { path: old1193.path, reason: `Chromium 140.0.7339.16 is more than ${MAJOR_WINDOW} major versions from the pinned 156.0.8078.4` },
  ]);
  assert.equal(describeChromium(used), `Chromium 153.0.8010.12: ${system.path} (system install; playwright-core's pinned revision 1248 could not be used; passed over 2 that could not be used)`);
});

test('without the pinned revision, the line says so', async () => {
  const { probe } = launcher({ [shell1243.path]: '153.0.8010.12' });
  const { used } = await choose([shell1243, system], probe, PINNED);
  assert.equal(describeChromium(used), `Chromium 153.0.8010.12: ${shell1243.path} (Playwright revision 1243; playwright-core's pinned revision 1248 is not installed)`);
});

test('CHROMIUM_EXECUTABLE_PATH is used as given, outside the window too, and a missing one is reported, not passed over', async () => {
  const chosen: Candidate = { path: '/opt/chrome', source: 'CHROMIUM_EXECUTABLE_PATH' };
  const { probe } = launcher({ '/opt/chrome': '130.0.1.2' });
  const { used } = await choose([chosen], probe, PINNED);
  assert.equal(describeChromium(used), 'Chromium 130.0.1.2: /opt/chrome (CHROMIUM_EXECUTABLE_PATH)');
  await assert.rejects(choose([{ path: '/missing', source: 'CHROMIUM_EXECUTABLE_PATH' }], launcher({}).probe, PINNED, 'rayner review'), {
    message: 'rayner review needs Chromium, and none was found at CHROMIUM_EXECUTABLE_PATH (/missing). Install it once with npx playwright-core install chromium, or set CHROMIUM_EXECUTABLE_PATH to a Chromium or Chrome executable. Writing, checking and building a scene without new diagrams needs no browser.',
  });
  const other = new Error('Browser closed: missing libnss3.so');
  await assert.rejects(choose([chosen], launcher({ '/opt/chrome': other }).probe, PINNED), other);
});

test('when nothing launches, the error says how to install, and names what was tried', async () => {
  await assert.rejects(choose([], launcher({}).probe, PINNED, 'Capturing a Mermaid diagram'), {
    message: 'Capturing a Mermaid diagram needs Chromium, and none was found. Install it once with npx playwright-core install chromium, or set CHROMIUM_EXECUTABLE_PATH to a Chromium or Chrome executable. Writing, checking and building a scene without new diagrams needs no browser.',
  });
  const { probe, closed } = launcher({ [old1193.path]: '140.0.7339.16', [system.path]: new Error('spawn EACCES') });
  await assert.rejects(choose([old1193, system], probe, PINNED, 'rayner review'), {
    message: `rayner review needs Chromium, and none of the 2 found could be used (${old1193.path}: Chromium 140.0.7339.16 is more than ${MAJOR_WINDOW} major versions from the pinned 156.0.8078.4; ${system.path}: spawn EACCES). Install it once with npx playwright-core install chromium, or set CHROMIUM_EXECUTABLE_PATH to a Chromium or Chrome executable. Writing, checking and building a scene without new diagrams needs no browser.`,
  });
  assert.deepEqual(closed, [old1193.path]);
});
