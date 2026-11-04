import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type ServerResponse} from 'node:http';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);
const script = new URL('../tools/verify-live-site.ts', import.meta.url).pathname;
const prefix = '/projects/example';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const csp = "default-src 'none'; script-src 'self'";
const cache = 'public, max-age=0, must-revalidate';
type Alter = (path: string, response: ServerResponse, bytes: Buffer) => boolean | void;

async function fixture(exercise: (f: {root: string; report: string; files: Map<string, Buffer>; requests: string[]; verify: (alter?: Alter, args?: string[]) => Promise<{code: number; stderr: string; stdout: string}>}) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-live-site-'));
  const root = join(folder, 'site'), report = join(folder, 'report.json');
  const files = new Map<string, Buffer>([
    ['/_headers', Buffer.from(`${prefix}/sample.html\n  Content-Security-Policy: ${csp}\n  Cache-Control: ${cache}\n${prefix}/sample\n  Content-Security-Policy: ${csp}\n  Cache-Control: ${cache}\n`)],
    [`${prefix}/catalog.json`, Buffer.from(JSON.stringify({version: 1, totals: {explainers: 1, scenarios: 2}, scenes: [{id: 'sample', scenarios: 2}]}))],
    [`${prefix}/sample.html`, Buffer.from('<!doctype html><title>A model</title><p>Two scenarios</p>')],
    [`${prefix}/sample.png`, Buffer.from('a reviewed picture')],
    [`${prefix}/loader.js`, Buffer.from('console.log("load")')],
    [`${prefix}/index.html`, Buffer.from('<h1>Examples</h1>')],
  ]);
  files.set(`${prefix}/deployment.json`, Buffer.from(JSON.stringify({version: 1, files: [...files].map(([path, bytes]) => ({path, sha256: digest(bytes)}))})));
  for (const [path, bytes] of files) { await mkdir(join(root, '.' + path, '..'), {recursive: true}); await writeFile(join(root, '.' + path), bytes); }
  const requests: string[] = [];
  let alteration: Alter = () => {};
  const server = createServer((request, response) => {
    const path = request.url!; requests.push(path);
    const bytes = files.get(path === `${prefix}/sample` ? `${prefix}/sample.html` : [`${prefix}/loader-hop.js`, `${prefix}/loader-v1.js`].includes(path) ? `${prefix}/loader.js` : path);
    if (path === '/_headers' || !bytes) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', path.endsWith('.json') ? 'application/json; charset=utf-8' : path.endsWith('.png') ? 'image/png' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (path === `${prefix}/sample.html` || path === `${prefix}/sample`) { response.setHeader('Content-Security-Policy', csp); response.setHeader('Cache-Control', cache); }
    if (path === `${prefix}/loader.js`) response.setHeader('Cache-Control', cache);
    if (!alteration(path, response, bytes)) response.end(bytes);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  try {
    await exercise({root, report, files, requests, verify: async (alter = () => {}, args = []) => {
      alteration = alter;
      try { const result = await run(process.execPath, [script, root, '--origin', origin, '--path', prefix, '--out', report, '--concurrency', '2', ...args], {timeout: 30000}); return {code: 0, ...result}; }
      catch (error) { const result = error as {code: number; stderr: string; stdout: string; message: string}; return {...result, stderr: result.stderr || result.message}; }
    }});
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(folder, {recursive: true, force: true}); }
}

test('live verification binds every public byte and actual reader headers to the reviewed local export, including clean routes', async () => {
  await fixture(async f => {
    const result = await f.verify((path, response) => {
      if (path === `${prefix}/sample.html`) { response.writeHead(302, {location: `${prefix}/sample`}).end(); return true; }
    }, ['--clean-urls']);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(await readFile(f.report, 'utf8'));
    assert.equal(report.publicFiles, 5); assert.equal(report.cleanReaderRoutes, 1);
    assert.deepEqual(report.results.map((r: {path: string}) => r.path).sort(), [...f.files.keys()].filter(p => p !== '/_headers' && !p.endsWith('/deployment.json')).concat(`${prefix}/sample`).sort());
    assert.equal(report.manifestSha256, digest(f.files.get(`${prefix}/deployment.json`)!));
    assert.equal(f.requests.includes('/_headers'), false, 'private host recipe is checked through actual response headers');
  });
});

test('live verification rejects wrong or absent media types and downloads even when reviewed bytes and nosniff match', async () => {
  await fixture(async f => {
    const cases = [
      {path: 'sample.html', header: 'Content-Type', value: 'text/plain', error: /content-type must be text\/html/},
      {path: 'sample.html', header: 'Content-Type', value: undefined, error: /content-type must be text\/html/},
      {path: 'sample.html', header: 'Content-Type', value: 'text/html; charset=utf-16', error: /content-type charset must preserve UTF-8/},
      {path: 'loader.js', header: 'Content-Type', value: 'application/octet-stream', error: /content-type must be text\/javascript or application\/javascript/},
      {path: 'loader.js', header: 'Content-Type', value: 'application/javascript; charset=iso-8859-1', error: /content-type charset must preserve UTF-8/},
      {path: 'catalog.json', header: 'Content-Type', value: undefined, error: /content-type must be application\/json/},
      {path: 'sample.png', header: 'Content-Type', value: 'application/octet-stream', error: /content-type must be image\/png/},
      {path: 'sample.html', header: 'Content-Disposition', value: 'attachment; filename="reader.html"', error: /content-disposition must allow inline rendering/},
      {path: 'loader.js', header: 'Content-Disposition', value: 'attachment', error: /content-disposition must allow inline rendering/},
    ];
    for (const input of cases) {
      const result = await f.verify((path, response) => {
        if (path === `${prefix}/${input.path}`) { if (input.value) response.setHeader(input.header, input.value); else response.removeHeader(input.header); }
      });
      assert.notEqual(result.code, 0, JSON.stringify(input)); assert.match(result.stderr, input.error);
      await assert.rejects(readFile(f.report), {code: 'ENOENT'});
    }
    const inline = await f.verify((path, response) => {if (path.endsWith('.js')) response.setHeader('Content-Type', 'Application/JavaScript; charset=UTF-8'); response.setHeader('Content-Disposition', 'inline');});
    assert.equal(inline.code, 0, inline.stderr);
  });
});

test('loader revalidation parses numeric cache directives and refuses duplicate or field-limited instructions', async () => {
  await fixture(async f => {
    for (const value of ['public,max-age=0,must-revalidate,s-maxage=003600', 'public,max-age=0,must-revalidate,s-maxage="003600"', 'max-age=0,must-revalidate,stale-while-revalidate="001"', 'max-age=0,must-revalidate,max-age=3600', 'no-cache="Set-Cookie"']) {
      const result = await f.verify((path, response) => {if (path.endsWith('/loader.js')) response.setHeader('Cache-Control', value);});
      assert.notEqual(result.code, 0, value); assert.match(result.stderr, /stable loader URL must revalidate|duplicate max-age directive/);
    }
    for (const value of ['no-cache', 'no-store', 'public,max-age="000",must-revalidate,s-maxage="000",stale-while-revalidate=000']) {
      const result = await f.verify((path, response) => {if (path.endsWith('/loader.js')) response.setHeader('Cache-Control', value);});
      assert.equal(result.code, 0, result.stderr);
    }
  });
});

test('stable loader redirects must revalidate at every hop as well as their final response', async () => {
  await fixture(async f => {
    const serve = (first: string | undefined, middle?: string): Alter => (path, response) => {
      if (path === `${prefix}/loader.js`) {
        if (first) response.setHeader('Cache-Control', first); else response.removeHeader('Cache-Control');
        response.writeHead(301, {location: `${prefix}/${middle ? 'loader-hop' : 'loader-v1'}.js`}).end(); return true;
      }
      if (path === `${prefix}/loader-hop.js`) {response.writeHead(307, {location: `${prefix}/loader-v1.js`, 'Cache-Control': middle!}).end(); return true;}
      if (path === `${prefix}/loader-v1.js`) response.setHeader('Cache-Control', cache);
    };
    for (const alter of [serve('public,max-age=31536000,immutable'), serve(undefined), serve('no-cache', 'public,max-age=0,must-revalidate,s-maxage="003600"')]) {
      const result = await f.verify(alter); assert.notEqual(result.code, 0); assert.match(result.stderr, /stable loader URL must revalidate/);
      await assert.rejects(readFile(f.report), {code: 'ENOENT'});
    }
    for (const alter of [serve('no-cache'), serve(cache, 'no-store')]) {
      const result = await f.verify(alter); assert.equal(result.code, 0, result.stderr);
    }
  });
});

test('live verification rejects stale/corrupt/error responses, framing restrictions and loader caches and removes stale success evidence', async () => {
  await fixture(async f => {
    const cases: {name: string; path: string; alter: Alter; error: RegExp}[] = [
      {name: 'stale manifest', path: 'deployment.json', alter: (_p, r, bytes) => {r.end(Buffer.from(bytes.toString().replace('version', 'versioN'))); return true;}, error: /deployed bytes differ/},
      {name: 'corrupt reader', path: 'sample.html', alter: (_p, r, bytes) => {r.end(Buffer.alloc(bytes.length, 33)); return true;}, error: /deployed bytes differ/},
      {name: 'missing resource', path: 'sample.png', alter: (_p, r) => {r.writeHead(404).end(); return true;}, error: /HTTP 404/},
      {name: 'server error', path: 'sample.png', alter: (_p, r) => {r.writeHead(503).end(); return true;}, error: /HTTP 503/},
      {name: 'oversize body', path: 'sample.png', alter: (_p, r, bytes) => {r.end(Buffer.concat([bytes, Buffer.from('extra')])); return true;}, error: /exceeds reviewed length/},
      {name: 'missing CSP', path: 'sample.html', alter: (_p, r) => {r.removeHeader('Content-Security-Policy');}, error: /content-security-policy differs/},
      {name: 'wrong reader cache', path: 'sample.html', alter: (_p, r) => {r.setHeader('Cache-Control', 'max-age=999');}, error: /cache-control differs/},
      {name: 'host blocks framing', path: 'sample.html', alter: (_p, r) => {r.setHeader('X-Frame-Options', 'DENY');}, error: /unexpected framing restriction/},
      {name: 'immutable loader', path: 'loader.js', alter: (_p, r) => {r.setHeader('Cache-Control', 'public,max-age=31536000,immutable');}, error: /stable loader URL must revalidate/},
      {name: 'missing loader cache', path: 'loader.js', alter: (_p, r) => {r.removeHeader('Cache-Control');}, error: /stable loader URL must revalidate/},
    ];
    for (const input of cases) {
      await writeFile(f.report, 'stale success');
      const result = await f.verify((path, response, bytes) => path === `${prefix}/${input.path}` ? input.alter(path, response, bytes) : undefined);
      assert.notEqual(result.code, 0, input.name); assert.match(result.stderr, input.error, input.name);
      await assert.rejects(readFile(f.report), {code: 'ENOENT'});
    }
  });
});

test('live transport bounds redirects, origins and stalled requests', async () => {
  await fixture(async f => {
    const targetRequests: string[] = [];
    const target = createServer((request, response) => {targetRequests.push(request.url!); response.setHeader('Content-Type', 'image/png'); response.end(f.files.get(`${prefix}/sample.png`));});
    await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
    try {
      const crossOrigin = await f.verify((path, response) => {
        if (path === `${prefix}/sample.png`) {response.writeHead(302, {location: `http://127.0.0.1:${(target.address() as {port: number}).port}/image`}).end(); return true;}
      });
      assert.notEqual(crossOrigin.code, 0); assert.match(crossOrigin.stderr, /redirect leaves the reviewed origin/); assert.deepEqual(targetRequests, []);
    } finally {target.closeAllConnections(); await new Promise<void>(resolve => target.close(() => resolve()));}
    const loop = await f.verify((path, response) => {if (path === `${prefix}/sample.png`) {response.writeHead(302, {location: path}).end(); return true;}});
    assert.notEqual(loop.code, 0); assert.match(loop.stderr, /too many or invalid redirects/);
    const stall = await f.verify((path) => path === `${prefix}/sample.png` ? true : undefined, ['--timeout', '100']);
    assert.notEqual(stall.code, 0); assert.match(stall.stderr, /request exceeded 100ms/);
  });
});

test('local byte and inventory failures refuse before HTTP, and receipts cannot overwrite reviewed files', async () => {
  await fixture(async f => {
    const image = join(f.root, '.' + prefix, 'sample.png');
    await writeFile(image, 'changed local bytes');
    const corrupt = await f.verify(); assert.notEqual(corrupt.code, 0); assert.match(corrupt.stderr, /local bytes differ/); assert.deepEqual(f.requests, []);
    await writeFile(image, f.files.get(`${prefix}/sample.png`)!);
    const extra = join(f.root, '.' + prefix, 'unreviewed.html'); await writeFile(extra, 'extra');
    const unlisted = await f.verify(); assert.notEqual(unlisted.code, 0); assert.match(unlisted.stderr, /unlisted local collection file/); assert.deepEqual(f.requests, []);
    await rm(extra);
    const manifestPath = join(f.root, '.' + prefix, 'deployment.json');
    const manifestBytes = f.files.get(`${prefix}/deployment.json`)!;
    const manifest = JSON.parse(manifestBytes.toString());
    await writeFile(manifestPath, JSON.stringify({...manifest, files: [...manifest.files, manifest.files[0]]}));
    const duplicate = await f.verify(); assert.notEqual(duplicate.code, 0); assert.match(duplicate.stderr, /duplicate or self-referencing manifest path/); assert.deepEqual(f.requests, []);
    await writeFile(manifestPath, JSON.stringify({...manifest, files: [{path: '/projects/example/../outside', sha256: '0'.repeat(64)}, ...manifest.files]}));
    const traversal = await f.verify(); assert.notEqual(traversal.code, 0); assert.match(traversal.stderr, /invalid manifest path/); assert.deepEqual(f.requests, []);
    await writeFile(manifestPath, manifestBytes);
    const overwrite = await f.verify(undefined, ['--out', image]); assert.notEqual(overwrite.code, 0); assert.match(overwrite.stderr, /--out must be outside/);
    assert.equal(await readFile(image, 'utf8'), f.files.get(`${prefix}/sample.png`)!.toString());
    const alias = join(f.root, '..', 'site-alias'); await symlink(f.root, alias, 'dir');
    const aliased = await f.verify(undefined, ['--out', join(alias, '.' + prefix, 'nested/report.json')]);
    assert.notEqual(aliased.code, 0); assert.match(aliased.stderr, /--out must be outside/); assert.deepEqual(f.requests, []);
    await writeFile(f.report, 'previous receipt');
    const invalid = await f.verify(undefined, ['--timeout', '0']); assert.notEqual(invalid.code, 0); assert.match(invalid.stderr, /--timeout must be/);
    assert.equal(await readFile(f.report, 'utf8'), 'previous receipt', 'invalid arguments do not remove an existing file');
  });
});
