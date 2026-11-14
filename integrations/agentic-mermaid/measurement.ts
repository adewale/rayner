// The identity of a natural diagram's font measurements, apart from capture: a scene whose natural
// diagrams are pinned in scene.snapshots/ checks that they were measured with its fonts by this alone,
// so check and build replay them without the diagram add-on (Agentic Mermaid) or Chromium.
import { createHash } from 'node:crypto';
import { SANS, MONO, FALLBACK } from '../../src/internal.ts';
import type { TextShaping } from '../../src/index.ts';
import { RENDERER } from '../../explain/internal.ts';

export interface NaturalMeasurementOptions { shaping?: TextShaping; measurementHash?: string; styles?: readonly string[] }
export function naturalMeasurementIdentity({ measurementHash, styles = [] }: NaturalMeasurementOptions = {}) {
  // What decides a natural label's measured width: the identity's format (raise the version when
  // what it covers changes), the renderer release, the embedded faces' bytes and the measured faces
  // (measurementHash, which for requested lettering covers the shaper too). Rayner's own code is not
  // hashed here; CI recaptures every committed snapshot and compares (test/snapshot-capture.test.ts).
  const metrics = createHash('sha256').update(JSON.stringify([
    'rayner-natural-labels-v2', RENDERER,
    createHash('sha256').update(JSON.stringify([SANS, MONO, FALLBACK])).digest('hex'),
    measurementHash,
    styles,
  ])).digest('hex');
  return { id: 'rayner:shaped:' + metrics, version: '1.0.0' };
}
