import type { DiagramSnapshot } from '../../explain/diagram-snapshot.ts';
/** Diagnostic only, not a Mermaid parser: recognize common explicit node-label forms.
 * Keep a source-to-paint guard even when the pinned renderer fixes known label-loss bugs. */
export function lostLabelWarnings(snapshot: DiagramSnapshot): string[] {
  if (snapshot.family !== 'flowchart') return [];
  const warnings = new Set<string>();
  const definitions =
    /\b([A-Za-z_][\w.-]*)\s*(?:\[\[?|\(\(?|\{\{?)(["']?)([^()[\]{}\n]+?)\2(?:\]\]?|\)\)?|\}\}?)/g;
  for (const match of snapshot.spec.source.matchAll(definitions)) {
    const id = match[1]!,
      label = match[3]!.trim();
    if (label === id) continue;
    const part = snapshot.parts.find((p) => p.id === id && p.role === 'node');
    if (part?.shapes.some((s) => s.text === id))
      warnings.add(
        `Node ${id} rendered its bare id although the source defines “${label}”. Check the source and recapture the diagram.`,
      );
  }
  return [...warnings];
}
