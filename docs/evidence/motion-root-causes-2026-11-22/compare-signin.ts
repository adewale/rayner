import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderAsync} from '@resvg/resvg-js';
const root = resolve(process.argv[2] ?? 'out/signin-stable-comparison');
const current = resolve(process.argv[3] ?? 'out/root-causes-native-d5845507/supplemental');
const sha = (x: Uint8Array) => createHash('sha256').update(x).digest('hex');
for (const flow of ['device', 'direct']) {
  const before = join(root, 'before/witnesses/signin-'+flow+'-grant');
  const after = join(current, 'sign-in-collect-people-slide--stable-'+flow, 'baseline');
  const afterRevision = JSON.parse(await readFile(join(after, '../case.json'), 'utf8')).revision;
  const beforeReceipt = await readFile(join(before, 'receipt.json')), afterReceipt = await readFile(join(after, 'receipt.json'));
  const a = JSON.parse(beforeReceipt.toString()), b = JSON.parse(afterReceipt.toString());
  assert.equal(a.settings.flow, flow); assert.equal(b.provenance.settings.flow, flow);
  assert.deepEqual(a.log, ['ask','approve-read','collect']); assert.deepEqual(b.reader.requestedLog, a.log);
  const samples = [0, 30, 45, 60, 90, 120, 135], rows = []; let body = '';
  for (const [i, frame] of samples.entries()) for (const [column, side] of ['before', 'after'].entries()) {
    const record = side === 'before' ? a.frames.find((r: {offset: number}) => r.offset === frame) : b.frames.findLast((r: {frame: number}) => r.frame === frame);
    if (!record) throw new Error('Missing actual native '+side+' offset '+frame);
    const path = side === 'before' ? join(before, String(frame).padStart(4, '0')+'.png') : join(after, record.asset+'.png');
    const png = await readFile(path), x = column*400, y = i*249;
    body += `<rect x="${x}" y="${y}" width="400" height="249" fill="white"/><text x="${x+8}" y="${y+16}" font-family="sans-serif" font-size="12">${side} ${side==='before'?'5bff60e0':afterRevision.slice(0,8)} ${flow} +${(frame/30).toFixed(3)} s</text><image x="${x}" y="${y+24}" width="400" height="225" href="data:image/png;base64,${png.toString('base64')}"/>`;
    rows.push({side, frame, seconds: frame/30, nativeRecord: record, path, sha256: sha(png)});
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${samples.length*249}">${body}</svg>`;
  const image = await renderAsync(svg, {font:{loadSystemFonts:true}});
  await writeFile(join(root, flow+'.png'), image.asPng());
  await writeFile(join(root, flow+'.json'), JSON.stringify({policy:'Archived actual before PNGs and current actual after PNGs; equal native offsets and 30 fps, no time normalization. Source revisions differ explicitly. Sparse visual comparison, not every-frame human inspection.',
    beforeRevision:'5bff60e0aa5660c2b944fb59fbfe0b59e703db93', afterRevision, flow, log:['ask','approve-read','collect'],
    beforeReceiptSha256:sha(beforeReceipt), afterReceiptSha256:sha(afterReceipt), beforeBase:a.base, afterReader:b.reader, rows}, null, 2)+'\n');
}
