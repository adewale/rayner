// node tools/repo/motion-native-review-packet.ts <capture-dir> <packet-dir> <run>
// Assemble source-bound native inputs for independent review, without reading
// detector output or assigning a visual verdict. Original captures stay in place.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { routes } from './motion-audit-routes.ts';
import { digest, type BoundArtifact, type CaseReview } from './motion-semantic.ts';

const input = resolve(process.argv[2]!), output = resolve(process.argv[3]!), run = process.argv[4]!;
assert.ok(run?.trim(), 'explicit capture run'); await mkdir(output, {recursive: true});
const provenanceBytes = await readFile(join(input, 'provenance.json'));
const provenance = JSON.parse(provenanceBytes.toString()), index = JSON.parse(await readFile(join(input, 'index.json'), 'utf8'));
assert.match(provenance.revision, /^[a-f0-9]{40}$/); assert.equal(index.revision, provenance.revision);
assert.equal(index.expected, 59); assert.equal(index.uniqueIds, 59); assert.equal(index.completed, 59);
assert.deepEqual(index.cases.map((c: {id: string}) => c.id), CORPUS.map(c => c.id));
const assets = new Set<string>(), cases = [], template: CaseReview[] = [];
async function artifact(file: string): Promise<BoundArtifact> {
  const bytes = await readFile(file); return {path: relative(output, file), sha256: digest(bytes)};
}
for (const entry of CORPUS) {
  const directory = join(input, entry.id), bytes = await readFile(join(directory, 'case.json')), capture = JSON.parse(bytes.toString());
  assert.equal(capture.id, entry.id); assert.equal(capture.revision, provenance.revision);
  assert.ok(['complete','typed-refusal','history-inadmissible'].includes(capture.status), `${entry.id}: completed or explicit prevention/blocker`);
  assert.deepEqual(capture.route, JSON.parse(JSON.stringify(routes[entry.id])));
  const sides = [];
  const caseAssets = new Set<string>();
  for (const side of ['baseline', 'variant']) {
    const receiptBytes = await readFile(join(directory, side, 'receipt.json')), receipt = JSON.parse(receiptBytes.toString());
    assert.equal(receipt.side, side); assert.equal(receipt.width, 800); assert.equal(receipt.height, 450); assert.equal(receipt.fps, 30);
    assert.equal(receipt.frameCount, receipt.frames.length); assert.ok(receipt.frameCount > 0 && !receipt.error);
    const seen = new Set<string>();
    for (const [sequence, frame] of receipt.frames.entries()) {
      assert.equal(frame.sequence, sequence); assert.equal(frame.asset, frame.svg);
      if (seen.has(frame.asset)) continue; seen.add(frame.asset);
      const svg = gunzipSync(await readFile(join(directory, side, frame.asset + '.svg.gz')));
      assert.equal(digest(svg), frame.svg, 'native SVG snapshot stays immutable');
      const png = await readFile(join(directory, side, frame.asset + '.png'));
      assert.equal(png.subarray(1, 4).toString(), 'PNG'); assert.equal(png.readUInt32BE(16), 800); assert.equal(png.readUInt32BE(20), 450);
      assets.add(digest(png)); caseAssets.add(digest(png));
    }
    assert.equal(receipt.uniqueAssets, seen.size);
    sides.push({side, status: receipt.status, receipt: await artifact(join(directory, side, 'receipt.json')),
      mark: receipt.mark, reader: receipt.reader, provenance: receipt.provenance, frameCount: receipt.frameCount});
  }
  const contact = await artifact(join(directory, 'contacts/whole-stage.png')); assets.add(contact.sha256); caseAssets.add(contact.sha256);
  cases.push({id: entry.id, source: entry.what, route: capture.route, status: capture.status,
    caseReceipt: {path: relative(output, join(directory, 'case.json')), sha256: digest(bytes)}, sides, contact, nativeAssets: [...caseAssets]});
  template.push({id: entry.id, disposition: 'unresolved', note: 'Template only; no independent visual judgment supplied.',
    nativeWitnesses: [contact], blocker: 'Independent current-source native clause review is pending.'});
}
const capture = {schema: 1, sourceRevision: provenance.revision, run, provenance: {path: relative(output, join(input, 'provenance.json')), sha256: digest(provenanceBytes)},
  policy: 'Actual native captures, sampled contacts and full frame ledgers. No detector conclusions or human every-frame review are inferred.', nativeAssets: [...assets], cases};
await Promise.all([
  writeFile(join(output, 'capture.json'), JSON.stringify(capture, null, 2) + '\n'),
  writeFile(join(output, 'review-template.json'), JSON.stringify({sourceRevision: provenance.revision, run, reviewer: '', cases: template, observations: []}, null, 2) + '\n'),
]);
console.log(JSON.stringify({output, sourceRevision: provenance.revision, run, cases: cases.length, nativeAssets: assets.size}));
