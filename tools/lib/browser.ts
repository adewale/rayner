// Chromium for diagram capture and browser review, via the included playwright-core dependency.
// Nothing else loads this module: check, build, describe, see, contact-sheet and init run without a browser.
//
// playwright-core looks only for the one Chromium revision it pins (browsers.json), so a machine
// holding any other build fails until the author downloads the pinned one. launch() looks wider,
// in this order, and uses the first candidate that launches and opens a page:
//   1. CHROMIUM_EXECUTABLE_PATH, alone: an explicit choice is used or reported, never passed over.
//   2. Playwright's pinned revision in PLAYWRIGHT_BROWSERS_PATH, or Playwright's cache when unset.
//   3. Other Playwright Chromium builds there, newest revision first.
//   4. Chrome or Chromium installed on the system (PATH; the macOS application folders), unless
//      RAYNER_SYSTEM_CHROMIUM=0.
// Playwright drives Chromium over CDP, which changes slowly, so a build a few major versions from
// the pinned one works; a build far from it may launch and then fail mid-run. It did: Chromium 140
// (revision 1193) crashed its renderer in the player test once Accessibility.getPartialAXTree had
// run, under a playwright-core pinned to 156 (test/browser/explain-embed.test.ts, verify()). So a
// candidate from steps 2 to 4 must launch, report a major version within MAJOR_WINDOW of the
// pinned build's, and render a page before it is used; otherwise the next candidate is tried.
import { chromium } from 'playwright-core';
import type { Browser, LaunchOptions } from 'playwright-core';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Every layout Playwright has used, headless shell first: CI installs only the shell
// (`playwright-core install --only-shell chromium`). Since revision 1200 the builds sit in
// chrome-mac-arm64, chrome-linux64 and chrome-headless-shell-*; a list without those skips
// every current build and runs whatever old one is left.
const layouts = [
  'chrome-headless-shell-linux64/chrome-headless-shell',
  'chrome-headless-shell-linux-arm64/chrome-headless-shell',
  'chrome-headless-shell-mac-arm64/chrome-headless-shell',
  'chrome-headless-shell-mac-x64/chrome-headless-shell',
  'chrome-headless-shell-win64/chrome-headless-shell.exe',
  'chrome-linux/headless_shell',
  'chrome-mac/headless_shell',
  'chrome-linux64/chrome',
  'chrome-linux-arm64/chrome',
  'chrome-linux/chrome',
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-win64/chrome.exe',
  'chrome-win/chrome.exe',
];

/**
 * How many major versions a candidate may be from the pinned build, either way. Playwright supports
 * the stable Chrome channel, which trails its pinned (dev channel) build by about two majors when a
 * playwright-core version ships; Chrome ships a major every four weeks, so four either way covers the
 * stable channel for some months after that, and rejects builds like the Chromium 140 above.
 */
export const MAJOR_WINDOW = 4;

/** The Chromium build playwright-core pins: what `npx playwright-core install chromium` downloads. */
export interface Pinned {
  revision: number;
  version: string;
}

export type Source = 'CHROMIUM_EXECUTABLE_PATH' | 'pinned' | 'installed' | 'system';

export interface Candidate {
  path: string;
  source: Source;
  /** Playwright's revision number, for a build in Playwright's folder. */
  revision?: number;
}

/** The Chromium a launch used, and the candidates passed over before it. */
export interface ChromiumUsed {
  path: string;
  version: string;
  source: Source;
  revision?: number;
  pinned: Pinned;
  /** Whether a build of the pinned revision was among the candidates. */
  pinnedInstalled: boolean;
  skipped: { path: string; reason: string }[];
}

/** What discovery reads from the machine; a test passes a fake one. */
export interface Host {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  home: string;
  /** The playwright-core package folder, for PLAYWRIGHT_BROWSERS_PATH=0. */
  playwrightCore: string;
  /** A file (or a symbolic link to one) exists here. */
  isFile(path: string): boolean;
  /** A folder's entry names; empty when there is no such folder. */
  list(dir: string): string[];
}

const require = createRequire(import.meta.url);
const playwrightCore = () => dirname(require.resolve('playwright-core/package.json'));

export function pinnedChromium(core = playwrightCore()): Pinned {
  const { browsers } = JSON.parse(readFileSync(join(core, 'browsers.json'), 'utf8')) as {
    browsers: { name: string; revision: string; browserVersion?: string }[];
  };
  const entry = browsers.find((b) => b.name === 'chromium-headless-shell') ?? browsers.find((b) => b.name === 'chromium');
  if (!entry?.browserVersion) throw new Error(`${core}/browsers.json names no Chromium build`);
  return { revision: Number(entry.revision), version: entry.browserVersion };
}

const realHost = (): Host => ({
  env: process.env,
  platform: process.platform,
  home: process.env.HOME ?? process.env.USERPROFILE ?? '',
  playwrightCore: playwrightCore(),
  isFile: (path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  },
  list: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
});

/** Where Playwright keeps browsers: PLAYWRIGHT_BROWSERS_PATH when set, as Playwright reads it, else its cache. */
export function playwrightFolders(host: Host): string[] {
  const set = host.env.PLAYWRIGHT_BROWSERS_PATH;
  if (set) return [set === '0' ? join(host.playwrightCore, '.local-browsers') : set];
  if (host.platform === 'darwin') return [join(host.home, 'Library/Caches/ms-playwright')];
  if (host.platform === 'win32') return host.env.LOCALAPPDATA ? [join(host.env.LOCALAPPDATA, 'ms-playwright')] : [];
  return [join(host.env.XDG_CACHE_HOME || join(host.home, '.cache'), 'ms-playwright')];
}

/** Chrome and Chromium installed outside Playwright, in the order they are tried. */
export function systemBrowsers(host: Host): string[] {
  if (host.env.RAYNER_SYSTEM_CHROMIUM === '0') return [];
  const names =
    host.platform === 'win32' ? ['chrome.exe'] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  const dirs = (host.env.PATH ?? '').split(host.platform === 'win32' ? ';' : ':').filter(Boolean);
  const found: string[] = [];
  for (const name of names) {
    const hit = dirs.map((dir) => join(dir, name)).find((path) => host.isFile(path));
    if (hit) found.push(hit);
  }
  if (host.platform === 'darwin')
    for (const app of ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Chromium.app/Contents/MacOS/Chromium'])
      for (const root of ['/Applications', join(host.home, 'Applications')])
        if (host.isFile(join(root, app))) found.push(join(root, app));
  return found;
}

/** Every Chromium launch() may try, best first (the order above). */
export function candidates(host: Host, pinned: Pinned): Candidate[] {
  const chosen = host.env.CHROMIUM_EXECUTABLE_PATH;
  if (chosen) return [{ path: chosen, source: 'CHROMIUM_EXECUTABLE_PATH' }];
  const builds: { revision: number; shell: boolean; rank: number; path: string }[] = [];
  for (const base of playwrightFolders(host))
    for (const dir of host.list(base)) {
      const m = /^chromium(_headless_shell)?-(\d+)$/.exec(dir);
      if (!m || !host.isFile(join(base, dir, 'INSTALLATION_COMPLETE'))) continue;
      const rank = layouts.findIndex((l) => host.isFile(join(base, dir, l)));
      if (rank >= 0) builds.push({ revision: Number(m[2]), shell: !!m[1], rank, path: join(base, dir, layouts[rank]!) });
    }
  const key = (b: { revision: number }) => (b.revision === pinned.revision ? Infinity : b.revision);
  builds.sort((a, b) => key(b) - key(a) || Number(b.shell) - Number(a.shell) || a.rank - b.rank);
  const list: Candidate[] = builds.map(({ revision, path }) => ({
    path,
    revision,
    source: revision === pinned.revision ? 'pinned' : 'installed',
  }));
  for (const path of systemBrowsers(host)) list.push({ path, source: 'system' });
  return list.filter((c, i) => list.findIndex((d) => d.path === c.path) === i);
}

const major = (version: string) => Number(/^(\d+)\./.exec(version)?.[1] ?? NaN);

/** Whether a launched build's version is close enough to the pinned one to drive. */
export function withinWindow(version: string, pinned: Pinned): boolean {
  return Math.abs(major(version) - major(pinned.version)) <= MAJOR_WINDOW;
}

/** Launch a candidate and prove it renders a page; reject (closing it) otherwise. */
export type Probe = (candidate: Candidate) => Promise<{ browser: Browser; version: string }>;

const installAdvice =
  'Install it once with npx playwright-core install chromium, ' +
  'or set CHROMIUM_EXECUTABLE_PATH to a Chromium or Chrome executable. ' +
  'Writing, checking and building a scene without new diagrams needs no browser.';

const firstLine = (error: unknown) => String((error as Error)?.message ?? error).split('\n')[0]!.trim();

/** Try each candidate in order and return the first that launches, is in the window and renders. */
export async function choose(
  list: Candidate[],
  probe: Probe,
  pinned: Pinned,
  purpose = 'This command',
): Promise<{ browser: Browser; used: ChromiumUsed }> {
  const skipped: ChromiumUsed['skipped'] = [];
  const pinnedInstalled = list.some((c) => c.source === 'pinned');
  for (const candidate of list) {
    let launched: { browser: Browser; version: string };
    try {
      launched = await probe(candidate);
    } catch (error) {
      if (candidate.source === 'CHROMIUM_EXECUTABLE_PATH') {
        if (!/executable doesn't exist|ENOENT/i.test(firstLine(error))) throw error;
        throw new Error(
          `${purpose} needs Chromium, and none was found at CHROMIUM_EXECUTABLE_PATH (${candidate.path}). ${installAdvice}`,
          { cause: error },
        );
      }
      skipped.push({ path: candidate.path, reason: firstLine(error) });
      continue;
    }
    if (candidate.source !== 'CHROMIUM_EXECUTABLE_PATH' && !withinWindow(launched.version, pinned)) {
      await launched.browser.close().catch(() => {});
      skipped.push({
        path: candidate.path,
        reason: `Chromium ${launched.version} is more than ${MAJOR_WINDOW} major versions from the pinned ${pinned.version}`,
      });
      continue;
    }
    const { path, source, revision } = candidate;
    return {
      browser: launched.browser,
      used: { path, version: launched.version, source, ...(revision === undefined ? {} : { revision }), pinned, pinnedInstalled, skipped },
    };
  }
  if (!skipped.length) throw new Error(`${purpose} needs Chromium, and none was found. ${installAdvice}`);
  throw new Error(
    `${purpose} needs Chromium, and none of the ${skipped.length} found could be used (` +
      skipped.map((s) => `${s.path}: ${s.reason}`).join('; ') +
      `). ${installAdvice}`,
  );
}

/** One line naming the Chromium a launch used and why that one. */
export function describeChromium(used: ChromiumUsed): string {
  const pinned = `playwright-core's pinned revision ${used.pinned.revision}`;
  const missing = used.pinnedInstalled ? `${pinned} could not be used` : `${pinned} is not installed`;
  const why =
    used.source === 'CHROMIUM_EXECUTABLE_PATH'
      ? 'CHROMIUM_EXECUTABLE_PATH'
      : used.source === 'pinned'
        ? pinned
        : used.source === 'installed'
          ? `Playwright revision ${used.revision}; ${missing}`
          : `system install; ${missing}`;
  const passed = used.skipped.length ? `; passed over ${used.skipped.length} that could not be used` : '';
  return `Chromium ${used.version}: ${used.path} (${why}${passed})`;
}

function realProbe(options: LaunchOptions): Probe {
  return async (candidate) => {
    const browser = await chromium.launch({ timeout: 60_000, ...options, executablePath: candidate.path });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(30_000);
      await page.setContent('<p id="probe">rendered</p>');
      const text = await page.evaluate(() => document.getElementById('probe')?.textContent);
      await page.close();
      if (text !== 'rendered') throw new Error('the probe page did not render');
      return { browser, version: browser.version() };
    } catch (error) {
      await browser.close().catch(() => {});
      throw error;
    }
  };
}

const usedBy = new WeakMap<Browser, ChromiumUsed>();
let remembered: ChromiumUsed | undefined;

/** The Chromium that `launch()` started for this browser. */
export function chromiumUsed(browser: Browser): ChromiumUsed | undefined {
  return usedBy.get(browser);
}

/**
 * Start headless Chromium, for `rayner review`, diagram capture and the repository's browser checks:
 * every Chromium launch goes through here. `purpose` names the work in the error when no Chromium can
 * be used; `options` pass through to Playwright (its executablePath is chosen here).
 */
export async function launch(purpose = 'This command', options: LaunchOptions = {}): Promise<Browser> {
  const pinned = pinnedChromium();
  let list = candidates(realHost(), pinned);
  // A process launches many times (each test file, each capture); start with the build that worked.
  // What was passed over the first time is still the reason for the choice.
  const known = list.findIndex((c) => c.path === remembered?.path);
  if (known > 0) list = [list[known]!, ...list.slice(0, known), ...list.slice(known + 1)];
  let { browser, used } = await choose(list, realProbe(options), pinned, purpose);
  if (used.path === remembered?.path && !used.skipped.length) used = { ...used, skipped: remembered.skipped };
  remembered = used;
  usedBy.set(browser, used);
  return browser;
}
