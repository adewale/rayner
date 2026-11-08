#!/usr/bin/env node
// Compare a deployed collection with the reviewed export, not a remote manifest's claims.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir, realpath, lstat, mkdir, rm, writeFile} from 'node:fs/promises';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {parseArgs} from 'node:util';
import { byCodeUnit, posixPath, sha256 } from '../lib/hash.ts';

type FilePin = {path: string; sha256: string; bytes: number};
const mediaTypes: Record<string, string[]> = {
  '.html': ['text/html'], '.js': ['text/javascript', 'application/javascript'],
  '.json': ['application/json'], '.png': ['image/png'], '.css': ['text/css'],
  '.svg': ['image/svg+xml'], '.txt': ['text/plain'],
};

function loaderRevalidates(cache: string): boolean {
  const directives = new Map<string, string | undefined>();
  for (const raw of cache.split(',')) {
    const match = raw.trim().match(/^([a-zA-Z][a-zA-Z0-9_-]*)(?:\s*=\s*(?:"([^"]*)"|([^\s,"]+)))?$/);
    assert.ok(match, 'loader cache-control has an invalid directive');
    const name = match[1]!.toLowerCase();
    assert.ok(!directives.has(name), `loader cache-control has a duplicate ${name} directive`);
    directives.set(name, match[2] ?? match[3]);
  }
  const seconds = (name: string): number | undefined => {
    if (!directives.has(name)) return undefined;
    const value = directives.get(name);
    assert.ok(value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)), `loader cache-control has invalid ${name} seconds`);
    return Number(value);
  };
  const maxAge = seconds('max-age'), sharedAge = seconds('s-maxage'), stale = seconds('stale-while-revalidate');
  const flag = (name: string) => directives.has(name) && directives.get(name) === undefined;
  return (flag('no-cache') || flag('no-store') || maxAge === 0 && flag('must-revalidate')) && !directives.has('immutable') && !(sharedAge && sharedAge > 0) && !(stale && stale > 0);
}

function exactHeaders(source: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      assert.ok(!rules.has(line), `duplicate header rule: ${line}`);
      current = new Map(); rules.set(line, current);
    } else if (line.trimStart().startsWith('!')) {
      current?.delete(line.trim().slice(1).trim().toLowerCase());
    } else {
      const at = line.indexOf(':');
      assert.ok(current && at >= 0, 'invalid response-header recipe');
      const name = line.slice(0, at).trim().toLowerCase();
      assert.ok(!current.has(name), `duplicate response header: ${name}`);
      current.set(name, line.slice(at + 1).trim());
    }
  }
  return rules;
}

async function main() {
  const {values, positionals} = parseArgs({allowPositionals: true, options: {
    origin: {type: 'string'}, path: {type: 'string', default: '/projects/rayner'},
    out: {type: 'string'}, 'clean-urls': {type: 'boolean'},
    concurrency: {type: 'string', default: '8'}, timeout: {type: 'string', default: '30000'},
  }});
  assert.ok(positionals.length === 1 && values.origin, 'usage: node tools/repo/verify-live-site.ts <site-root> --origin https://your.site [--path /projects/rayner] [--clean-urls] [--out report.json]');
  const origin = new URL(values.origin);
  assert.ok(['http:', 'https:'].includes(origin.protocol) && !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash, '--origin must be an HTTP(S) origin without credentials, path, query or fragment');
  const prefix = values.path.replace(/\/$/, '');
  assert.match(prefix, /^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/, '--path must be an absolute collection path without dot segments');
  const concurrency = Number(values.concurrency), timeout = Number(values.timeout);
  assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 16, '--concurrency must be an integer from 1 to 16');
  assert.ok(Number.isInteger(timeout) && timeout >= 1 && timeout <= 120000, '--timeout must be from 1 to 120000 milliseconds');
  const root = await realpath(resolve(positionals[0]!));
  const output = values.out && resolve(values.out);
  if (output) {
    let ancestor = dirname(output), canonicalParent: string;
    for (;;) {
      try { canonicalParent = await realpath(ancestor); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error; ancestor = dirname(ancestor); }
    }
    const canonicalOutput = resolve(canonicalParent, relative(ancestor, output));
    assert.ok(canonicalOutput !== root && !canonicalOutput.startsWith(root + sep), '--out must be outside the reviewed site tree');
  }
  if (output) await rm(output, {force: true}); // A failed attempt must not leave an old success receipt.
  const manifestPath = prefix + '/deployment.json';
  const manifestBytes = await readFile(join(root, '.' + manifestPath));
  const manifest = JSON.parse(manifestBytes.toString()) as {version: number; files: {path: string; sha256: string}[]};
  assert.ok(manifest.version === 1 && Array.isArray(manifest.files) && manifest.files.length, 'invalid deployment manifest');
  const pins = new Map<string, FilePin>();
  for (const entry of manifest.files) {
    assert.ok(entry && typeof entry.path === 'string' && /^\/[a-zA-Z0-9_.\/-]+$/.test(entry.path) && !entry.path.split('/').some(part => part === '..' || part === '.') && !entry.path.includes('//') && !entry.path.endsWith('/'), 'invalid manifest path');
    assert.ok(entry.path === '/_headers' || entry.path === prefix + '.html' || entry.path.startsWith(prefix + '/'), `manifest path is outside the collection: ${entry.path}`);
    assert.ok(entry.path !== manifestPath && !pins.has(entry.path), `duplicate or self-referencing manifest path: ${entry.path}`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, `invalid digest: ${entry.path}`);
    const local = join(root, '.' + entry.path), canonical = await realpath(local);
    assert.ok(canonical.startsWith(root + sep) && (await lstat(local)).isFile(), `manifest file must be a regular file inside the site: ${entry.path}`);
    const bytes = await readFile(local);
    assert.equal(sha256(bytes), entry.sha256, `${entry.path}: local bytes differ from reviewed manifest`);
    pins.set(entry.path, {...entry, bytes: bytes.length});
  }
  for (const entry of await readdir(join(root, prefix), {recursive: true, withFileTypes: true})) {
    assert.ok(!entry.isSymbolicLink(), 'reviewed collection must not contain symlinks');
    if (!entry.isFile()) continue;
    const path = '/' + posixPath(join(entry.parentPath, entry.name).slice(root.length + 1));
    assert.ok(path === manifestPath || pins.has(path), `unlisted local collection file: ${path}`);
  }
  assert.ok(pins.has('/_headers') && pins.has(prefix + '/catalog.json') && pins.has(prefix + '/loader.js'), 'manifest must include headers, catalog and loader');
  const catalog = JSON.parse(await readFile(join(root, prefix, 'catalog.json'), 'utf8')) as {version: number; totals: {explainers: number; scenarios: number}; scenes: {id: string; scenarios: number}[]};
  assert.ok(catalog.version === 2 && Array.isArray(catalog.scenes) && catalog.scenes.length, 'invalid catalog');
  const ids = new Set<string>();
  for (const scene of catalog.scenes) {
    assert.match(scene.id, /^[a-z0-9-]+$/, 'invalid catalog id');
    assert.ok(!ids.has(scene.id) && Number.isSafeInteger(scene.scenarios) && scene.scenarios > 0, 'duplicate catalog id or invalid scenario count');
    assert.ok(pins.has(`${prefix}/${scene.id}.html`), `missing reviewed reader: ${scene.id}`);
    ids.add(scene.id);
  }
  assert.equal(catalog.totals.explainers, ids.size, 'catalog explainer count differs');
  assert.equal(catalog.totals.scenarios, catalog.scenes.reduce((n, scene) => n + scene.scenarios, 0), 'catalog scenario count differs');
  const rules = exactHeaders(await readFile(join(root, '_headers'), 'utf8'));
  const expectedHeaders = new Map<string, Map<string, string>>();
  for (const id of ids) for (const path of [`${prefix}/${id}.html`, ...(values['clean-urls'] ? [`${prefix}/${id}`] : [])]) {
    const recipe = rules.get(path);
    assert.ok(recipe && recipe.has('content-security-policy') && recipe.has('cache-control'), `${path}: missing exact reader response-header recipe`);
    expectedHeaders.set(path, recipe);
  }
  const controller = new AbortController();
  const request = async (path: string, expected: {sha256: string; bytes: number}) => {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]);
    let url = new URL(path, origin);
    try {
      for (let hop = 0; hop <= 5; hop++) {
        const response = await fetch(url, {redirect: 'manual', credentials: 'omit', signal});
        const redirected = [301, 302, 303, 307, 308].includes(response.status);
        if (path === prefix + '/loader.js' && (redirected || response.status === 200)) {
          const cache = response.headers.get('cache-control') ?? '';
          assert.ok(cache && loaderRevalidates(cache), `${path}: stable loader URL must revalidate`);
        }
        if (redirected) {
          await response.body?.cancel();
          assert.ok(hop < 5 && response.headers.has('location'), `${path}: too many or invalid redirects`);
          url = new URL(response.headers.get('location')!, url);
          assert.equal(url.origin, origin.origin, `${path}: redirect leaves the reviewed origin`);
          assert.ok(!url.username && !url.password, `${path}: redirect contains credentials`);
          continue;
        }
        assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
        const extension = expectedHeaders.has(path) ? '.html' : extname(path);
        const allowedTypes = mediaTypes[extension];
        assert.ok(allowedTypes, `${path}: unsupported public asset type ${extension}`);
        const contentType = response.headers.get('content-type');
        const mediaType = contentType?.split(';')[0]?.trim().toLowerCase();
        assert.ok(mediaType && allowedTypes.includes(mediaType), `${path}: content-type must be ${allowedTypes.join(' or ')}`);
        if (mediaType.startsWith('text/') || ['.js', '.json', '.svg'].includes(extension)) {
          const charsets = contentType!.split(';').slice(1).map(parameter => parameter.trim()).filter(parameter => /^charset\s*=/i.test(parameter));
          assert.ok(charsets.length <= 1 && charsets.every(parameter => /^charset\s*=\s*(?:"(?:utf-8|utf8)"|utf-8|utf8)$/i.test(parameter)), `${path}: content-type charset must preserve UTF-8`);
        }
        if (['.html', '.js', '.css'].includes(extension)) {
          const disposition = response.headers.get('content-disposition')?.split(';')[0]?.trim().toLowerCase();
          assert.ok(!disposition || disposition === 'inline', `${path}: content-disposition must allow inline rendering`);
        }
        const hash = createHash('sha256'), reader = response.body?.getReader();
        let bytes = 0;
        if (reader) for (;;) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > expected.bytes) { await reader.cancel(); throw new Error(`${path}: response exceeds reviewed length`); }
          hash.update(part.value);
        }
        assert.equal(bytes, expected.bytes, `${path}: response length differs from reviewed file`);
        assert.equal(hash.digest('hex'), expected.sha256, `${path}: deployed bytes differ from reviewed file`);
        const recipe = expectedHeaders.get(path);
        if (recipe) {
          for (const [name, value] of recipe) assert.equal(response.headers.get(name), value, `${path}: ${name} differs from recipe`);
          assert.equal(response.headers.get('x-frame-options'), recipe.get('x-frame-options') ?? null, `${path}: unexpected framing restriction`);
        }
        return {path, sha256: expected.sha256, bytes, status: response.status, mediaType};
      }
      throw new Error(`${path}: redirect limit exceeded`);
    } catch (error) {
      if (signal.reason?.name === 'TimeoutError') throw new Error(`${path}: request exceeded ${timeout}ms`);
      throw error;
    }
  };
  const files = [...pins.values()].filter(file => file.path !== '/_headers');
  if (values['clean-urls']) for (const id of ids) files.push({...pins.get(`${prefix}/${id}.html`)!, path: `${prefix}/${id}`});
  let next = 0;
  const results: Awaited<ReturnType<typeof request>>[] = [];
  try {
    await request(manifestPath, {sha256: sha256(manifestBytes), bytes: manifestBytes.length});
    await Promise.all(Array.from({length: Math.min(concurrency, files.length)}, async () => {
      while (next < files.length) {
        const file = files[next++]!;
        results.push(await request(file.path, file));
      }
    }));
  } finally { controller.abort(); }
  assert.equal(results.length, files.length);
  const report = {version: 1, origin: origin.origin, path: prefix, checkedAt: new Date().toISOString(), manifestSha256: sha256(manifestBytes), publicFiles: pins.size - 1, cleanReaderRoutes: values['clean-urls'] ? ids.size : 0, privateFiles: ['/_headers: checked through actual reader response headers'], results: results.sort((a, b) => byCodeUnit(a.path, b.path))};
  if (output) { await mkdir(dirname(output), {recursive: true}); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
  console.log(`Verified ${report.publicFiles} public files and ${report.cleanReaderRoutes} clean reader routes against the reviewed export; media types, reader headers and loader revalidation passed. Browser interaction requires its separate review.`);
}

await main().catch(error => {console.error(`rayner verify-site: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1;});
