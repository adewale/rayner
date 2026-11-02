// Chromium for diagram capture and browser review, via the included playwright-core dependency.
import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';

// Every layout Playwright has used, headless shell first: CI installs only the shell
// (`playwright-core install --only-shell chromium`). Since revision 1200 the builds sit in
// chrome-mac-arm64, chrome-linux64 and chrome-headless-shell-*; a list without those skips
// every current build and runs whatever old one is left. It did: local runs got Chromium 140
// (revision 1193) while CI ran 156, and 140's renderer crashes in the player test once
// Accessibility.getPartialAXTree has run (test/browser/explain-embed.test.ts, verify()).
const layouts = [
  'chrome-headless-shell-linux64/chrome-headless-shell',
  'chrome-headless-shell-linux-arm64/chrome-headless-shell',
  'chrome-headless-shell-mac-arm64/chrome-headless-shell',
  'chrome-headless-shell-mac-x64/chrome-headless-shell',
  'chrome-linux/headless_shell',
  'chrome-mac/headless_shell',
  'chrome-linux64/chrome',
  'chrome-linux-arm64/chrome',
  'chrome-linux/chrome',
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
];

/** Installed Chromium builds, best first: Playwright's own revision, then the newest; a shell before a full build. */
function installed(): { revision: number; path: string }[] {
  const bases = process.env.PLAYWRIGHT_BROWSERS_PATH
    ? [process.env.PLAYWRIGHT_BROWSERS_PATH]
    : [`${process.env.HOME}/.cache/ms-playwright`, `${process.env.HOME}/Library/Caches/ms-playwright`];
  const pinned = Number(chromium.executablePath().match(/chromium-(\d+)/)?.[1] ?? NaN);
  const found: { revision: number; rank: number; path: string }[] = [];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base)) {
      const m = /^chromium(?:_headless_shell)?-(\d+)$/.exec(dir);
      if (!m || !existsSync(`${base}/${dir}/INSTALLATION_COMPLETE`)) continue;
      const rank = layouts.findIndex((l) => existsSync(`${base}/${dir}/${l}`));
      if (rank >= 0) found.push({ revision: Number(m[1]), rank, path: `${base}/${dir}/${layouts[rank]}` });
    }
  }
  const key = (b: { revision: number }) => (b.revision === pinned ? Infinity : b.revision);
  return found.sort((a, b) => key(b) - key(a) || a.rank - b.rank).map(({ revision, path }) => ({ revision, path }));
}

function executable(): string | undefined {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH;
  return installed()[0]?.path; // none found: let Playwright find its own
}

export const launch = (): Promise<Browser> => chromium.launch({ executablePath: executable() });
