// The query keys a page reads itself, beside its settings, in the one module that names them. The
// player, the host loader, the resize protocol and the share pages all import it; it imports nothing.

/**
 * The step, the events a reader sent at a live step (app/embed-live.ts), the embedding host's
 * origin and the theme. No setting may take one as its id.
 */
export const PAGE_QUERY = { step: 'step', sent: 'sent', parentOrigin: 'parentOrigin', theme: 'theme' } as const;
