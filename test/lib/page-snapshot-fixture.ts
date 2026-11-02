import type { SnapshotStore } from '../../integrations/agentic-mermaid/snapshot.ts';
import { RENDERER } from '../../integrations/agentic-mermaid/snapshot.ts';

export const fixture = (points: number[]): SnapshotStore => ({
  diagram: {version: 1, renderer: RENDERER, spec: {source: 'graph LR\nA[Example]'}, family: 'flowchart', width: 123.4567890123, height: 100,
    palette: {paper: '#ffffff', ink: '#000000', accent: '#ff0000', muted: '#808080'},
    parts: [{id: 'A', role: 'node', kind: 'node', shapes: [{subpaths: [points], closed: [false], style: {fill: 'none', stroke: '#000000', strokeWidth: 0.1234567890123}}]}], findings: {ok: true, warnings: []}},
});
