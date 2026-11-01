// Agentic Mermaid 0.4.1's style colours, copied so the page needs no Agentic Mermaid;
// test/browser/explain-capture.test.ts checks them against the installed styles.
import type { Palette } from '../integrations/agentic-mermaid/snapshot.ts';
export const PALETTES: Record<string, Palette> = {
  'hand-drawn': {
    paper: '#f7f5ef',
    ink: '#1a1a1e',
    accent: '#26262b',
    muted: '#1a1a1e',
  },
  nord: {
    paper: '#2e3440',
    ink: '#d8dee9',
    accent: '#88c0d0',
    muted: '#616e88',
  },
  blueprint: {
    paper: '#123a63',
    ink: '#eaf2fb',
    accent: '#ffffff',
    muted: '#b8cfe6',
  },
  'github-light': {
    paper: '#ffffff',
    ink: '#1f2328',
    accent: '#0969da',
    muted: '#59636e',
  },
  'tokyo-night': {
    paper: '#1a1b26',
    ink: '#a9b1d6',
    accent: '#7aa2f7',
    muted: '#565f89',
  },
  excalidraw: {
    paper: '#ffffff',
    ink: '#1e1e1e',
    accent: '#4263eb',
    muted: '#1e1e1e',
  },
  dracula: {
    paper: '#282a36',
    ink: '#f8f8f2',
    accent: '#bd93f9',
    muted: '#6272a4',
  },
  'github-dark': {
    paper: '#0d1117',
    ink: '#e6edf3',
    accent: '#4493f8',
    muted: '#9198a1',
  },
  dusk: {
    paper: '#2A2521',
    ink: '#E9DFCC',
    accent: '#CC8A57',
    muted: '#E9DFCC',
  },
  'catppuccin-mocha': {
    paper: '#1e1e2e',
    ink: '#cdd6f4',
    accent: '#cba6f7',
    muted: '#6c7086',
  },
  chalkboard: {
    paper: '#17362f',
    ink: '#f5f1df',
    accent: '#ffe08a',
    muted: '#c7d2c4',
  },
  'one-dark': {
    paper: '#282c34',
    ink: '#abb2bf',
    accent: '#c678dd',
    muted: '#5c6370',
  },
  'pen-and-ink': {
    paper: '#faf6ec',
    ink: '#241f1a',
    accent: '#2b241d',
    muted: '#241f1a',
  },
};
export function palette(name: string): Palette {
  const p = Object.hasOwn(PALETTES, name) ? PALETTES[name] : undefined;
  if (!p) throw new Error(`Unknown style ${name}. Styles: ${Object.keys(PALETTES).join(', ')}`);
  return { ...p };
}
