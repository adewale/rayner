import { describeMermaidFacts, mutate, parseRegisteredMermaid, serializeMermaid } from 'agentic-mermaid/agent';
import type { AnyMutationOp } from 'agentic-mermaid/agent';
import type { DiagramSpec } from '../../integrations/agentic-mermaid/snapshot.ts';
import { replayMorph } from '../../integrations/agentic-mermaid/build/index.ts';

// Kept out of integrations/agentic-mermaid/build/ on purpose: every .ts file there is part of the diagram-snapshot
// fingerprint (IMPORTER in tools/lib/explain-project.ts), so a change there invalidates every committed snapshot.

/**
 * `replayMorph`, with its failure saying why the edits do not reproduce the next diagram, so
 * the author can fix the edits or the next diagram's source. Other failures pass through.
 */
export function replayMorphExplained(before: DiagramSpec, after: DiagramSpec, ops: readonly Readonly<Record<string, unknown>>[]): void {
  try {
    replayMorph(before, after, ops);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Morph ops do not produce the next diagram') throw error;
    const start = parseRegisteredMermaid(before.source),
      target = parseRegisteredMermaid(after.source);
    if (!start.ok || !target.ok) throw error;
    let model = start.value;
    for (const op of ops) {
      const result = mutate(model, op as unknown as AnyMutationOp);
      if (!result.ok) throw error;
      model = result.value;
    }
    throw new Error(`${error.message}: ${morphDifference(model, target.value, serializeMermaid(model), serializeMermaid(target.value))}`);
  }
}

type Diagram = Parameters<typeof describeMermaidFacts>[0];
/**
 * Why an edit result is not the next diagram. Facts (states, transitions, nodes, edges)
 * present in one and not the other come first. A state the edits leave behind (removing its
 * last transition keeps it declared) needs `remove_state`, and the message says so. When the
 * facts agree, the two differ only in order, which changes the layout, so the first
 * differing line is named.
 */
export function morphDifference(edited: Diagram, wanted: Diagram, editedSource: string, wantedSource: string): string {
  const have = new Set(describeMermaidFacts(edited)),
    want = new Set(describeMermaidFacts(wanted));
  const extra = [...have].filter((f) => !want.has(f)),
    missing = [...want].filter((f) => !have.has(f));
  const list = (facts: string[]) => facts.slice(0, 6).join('; ') + (facts.length > 6 ? `; and ${facts.length - 6} more` : '');
  if (extra.length || missing.length) {
    const parts = [
      ...(extra.length ? [`the edits leave ${list(extra)}, which the next diagram does not have`] : []),
      ...(missing.length ? [`the next diagram has ${list(missing)}, which the edits do not make`] : []),
    ];
    const leftover = extra.filter((f) => /^state \S+$/.test(f) && !missing.some((m) => m.startsWith(f + ' ')));
    if (leftover.length)
      parts.push(`add remove_state for ${leftover.map((f) => f.slice(6)).join(', ')} to delete ${leftover.length > 1 ? 'them' : 'it'} too`);
    return parts.join('; ') + '.';
  }
  const a = editedSource.split('\n'),
    b = wantedSource.split('\n'),
    line = a.findIndex((l, i) => l !== b[i]);
  const at = line < 0 ? Math.min(a.length, b.length) : line;
  return `the same facts in a different order, which changes the layout; line ${at + 1} of the edit result is ${JSON.stringify((a[at] ?? '').trim())} where the next diagram has ${JSON.stringify((b[at] ?? '').trim())}. Move the declaration in the next diagram's source to where the edits put it.`;
}
