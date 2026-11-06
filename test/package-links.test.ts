// The package ships the skill and guides an agent reads after `npm install rayner`. A relative link
// in a shipped Markdown file that points at a file the package leaves out is dead for that reader:
// the skill would send an agent to docs/REFERENCE.md and find nothing. This test packs the package
// (a dry run: nothing is written) and fails on each such link, naming the file and the target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { ROOT } from '../tools/lib/explain-project.ts';

export function relativeLinks(markdown: string): string[] {
  const links: string[] = [];
  const prose = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const [, target] of prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target!) || target!.startsWith('#')) continue;
    links.push(target!.split('#')[0]!);
  }
  return links;
}

test('relativeLinks finds file links and skips URLs, anchors and code', () => {
  assert.deepEqual(
    relativeLinks('See [a](../docs/A.md#x), [b](https://x.y/B.md), [c](#here), `[d](D.md)`, [e](img.png "t").\n```\n[f](F.md)\n```'),
    ['../docs/A.md', 'img.png'],
  );
});

test('every relative link in a shipped Markdown file points at a shipped file', () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const out = execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const shipped = new Set((JSON.parse(out) as { files: { path: string }[] }[])[0]!.files.map((f) => normalize(f.path)));
  const dead: string[] = [];
  let checked = 0;
  for (const file of [...shipped].filter((f) => f.endsWith('.md')).sort()) {
    for (const link of relativeLinks(readFileSync(join(ROOT, file), 'utf8'))) {
      if (!link) continue;
      checked++;
      const target = normalize(join(dirname(file), decodeURIComponent(link)));
      if (!shipped.has(target) && ![...shipped].some((f) => f.startsWith(target.replace(/\/?$/, '/')))) dead.push(`${file} → ${link}`);
    }
  }
  assert.ok(checked > 20, `checked ${checked} links`);
  assert.deepEqual(dead, [], 'links that are dead in the installed package: ship the target, or link to the repository');
});
