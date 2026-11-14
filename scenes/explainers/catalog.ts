import { HOME } from '../../app/embed-share.ts';

/**
 * The collection, in gallery order. `topic` explainers are about subjects a
 * reader might search for; `toolchain` explainers show how these explanations
 * are made (the engine, the diagrams, the text outlines). `step` chooses
 * the default scenario's poster step; gallery links open at step one instead.
 */
export const PRODUCT = {
  /** The project's home, where every page's footer mark links (app/embed-share.ts). */
  home: HOME,
  /** The one summary and audience: README.md's opening paragraph is `${summary} ${audience}`, and the gallery's (test/explain-gallery.test.ts). */
  summary: 'Rayner makes a verified explanation of what this version of this system really does, with a short receipt the person who commissioned it can review.',
  audience: 'It is for the person who commissions an explainer of a protocol, an algorithm or a data structure, and for the agent or person who writes it.',
  /** README.md's second paragraph, and the gallery's. */
  description:
    'The writer models the system in TypeScript and tests the model against the real system where it can: run live, recorded once, or read from its specification. Every picture on the page is checked against the model’s state, and the receipt says what the model was checked against and how. The result is one HTML page of steps and a transcript, with no runtime network requests.',
  requirements: 'Node 24 or later to write, check and build. Chromium for rayner review and screenshots, and to capture Mermaid diagrams. Authoring targets Ubuntu and macOS.',
  tutorial: 'https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md',
  reference: 'https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md',
  skill: 'https://github.com/adewale/rayner/blob/main/skills/rayner-explainers/SKILL.md',
  /**
   * How to install the version this checkout describes, for the gallery and catalog.json (a host's
   * project page reads it there). It names package.json's version, so a release revisits it
   * (test/explain-gallery.test.ts); say only what npm actually has (`npm view rayner versions`).
   */
  install: 'Rayner 0.2.0, which these guides describe, is not on npm yet: npm has rayner 0.1.0, an earlier single-package release, and no rayner-cli. Build both packages from the repository, as the quick start shows.',
  installGuide: 'https://github.com/adewale/rayner#quick-start',
  entry: {
    id: 'bloom-filter',
    step: 'question',
    settings: { bits: '16' },
    label: 'See why a Bloom filter answers “maybe”',
  },
} as const;

/**
 * Where an explainer is shown. `showcase`: the selected exemplars, leading the gallery;
 * mostly subjects, plus any toolchain lesson that stands on its own, each with a model run against
 * the real system or checked against a recording of it (its script's Grounding is `live` or
 * `recorded`; test/explain-gallery.test.ts). Selection is editorial; it is not evidence of learning or benchmark superiority.
 * `gallery`: worth reading, behind "More". `coverage`: kept because it is
 * the only scene exercising some engine feature, diagram family or check (or until it is rebuilt);
 * its page is built and tested but not listed in the gallery or llms.txt.
 */
export type Tier = 'showcase' | 'gallery' | 'coverage';

export const EXPLAINERS: readonly { id: string; step: string; group: 'topic' | 'toolchain'; tier: Tier }[] = [
  { id: 'python-dict', step: 'marker', group: 'topic', tier: 'showcase' },
  { id: 'bloom-filter', step: 'false-positive', group: 'topic', tier: 'showcase' },
  { id: 'git-branches', step: 'merge', group: 'topic', tier: 'showcase' },
  { id: 'pg-page', step: 'swap', group: 'topic', tier: 'showcase' },
  { id: 'trust-proxy', step: 'read', group: 'topic', tier: 'showcase' },
  { id: 'send-sync', step: 'arc-cell', group: 'topic', tier: 'showcase' },
  { id: 'ext4-space', step: 'reserve', group: 'topic', tier: 'showcase' },
  { id: 'token-bucket', step: 'later', group: 'topic', tier: 'showcase' },
  { id: 'latest-search', step: 'reader-guard', group: 'topic', tier: 'showcase' },
  { id: 'monty-hall', step: 'worlds', group: 'topic', tier: 'gallery' },
  { id: 'birthday-paradox', step: 'chance', group: 'topic', tier: 'gallery' },
  { id: 'melody-rhythm', step: 'bar', group: 'topic', tier: 'gallery' },
  { id: 'seasons', step: 'latitude', group: 'topic', tier: 'gallery' },
  { id: 'henge', step: 'crossings', group: 'topic', tier: 'showcase' },
  { id: 'great-circle', step: 'turn', group: 'topic', tier: 'gallery' },
  { id: 'oauth-pkce', step: 'attack', group: 'topic', tier: 'gallery' },
  { id: 'poppy', step: 'both', group: 'topic', tier: 'gallery' },
  { id: 'poppy-discovery', step: 'handshake', group: 'topic', tier: 'gallery' },
  { id: 'poppy-sessions', step: 'send', group: 'topic', tier: 'gallery' },
  { id: 'poppy-sign-in', step: 'key', group: 'topic', tier: 'gallery' },
  { id: 'poppy-browser', step: 'submit', group: 'topic', tier: 'gallery' },
  { id: 'poppy-refusals', step: 'slip', group: 'topic', tier: 'gallery' },
  { id: 'poppy-conversations', step: 'direct', group: 'topic', tier: 'gallery' },
  { id: 'poppy-coverage', step: 'sort', group: 'topic', tier: 'gallery' },
  { id: 'exgit', step: 'change', group: 'topic', tier: 'gallery' },
  { id: 'mr-cache', step: 'reader-outcome', group: 'topic', tier: 'coverage' },
  { id: 'state-machine', step: 'reader-reject', group: 'topic', tier: 'coverage' },
  { id: 'statecharts', step: 'regions', group: 'topic', tier: 'showcase' },
  { id: 'ring-buffer', step: 'result', group: 'topic', tier: 'gallery' },
  { id: '2password', step: 'reader-boundary', group: 'topic', tier: 'gallery' },
  { id: 'just-bash', step: 'reader-values', group: 'topic', tier: 'coverage' },
  { id: 'cert-renewal', step: 'year', group: 'topic', tier: 'gallery' },
  { id: 'quotient-familial', step: 'multiplie', group: 'topic', tier: 'gallery' },
  { id: 'gtfs', step: 'day', group: 'topic', tier: 'gallery' },
  { id: 'traffic-policy', step: 'shares', group: 'topic', tier: 'gallery' },
  { id: 'isdigit', step: 'outcome', group: 'topic', tier: 'showcase' },
  { id: 'periodic-groups', step: 'stack', group: 'topic', tier: 'showcase' },
  { id: 'ical-recurrence', step: 'copy', group: 'topic', tier: 'gallery' },
  { id: 'tailwind-gamut', step: 'reader-display', group: 'topic', tier: 'gallery' },
  { id: 'gnome-files', step: 'reader-sample', group: 'topic', tier: 'coverage' },
  { id: 'wcag-map', step: 'reader-levels', group: 'topic', tier: 'coverage' },
  { id: 'feature-tour', step: 'result', group: 'toolchain', tier: 'gallery' },
  { id: 'lantern', step: 'seek', group: 'toolchain', tier: 'showcase' },
  { id: 'fork', step: 'untested', group: 'toolchain', tier: 'gallery' },
  { id: 'agentic-mermaid', step: 'meaning', group: 'toolchain', tier: 'gallery' },
  { id: 'glyph', step: 'letterforms', group: 'toolchain', tier: 'gallery' },
  { id: 'font-metrics', step: 'diagram', group: 'toolchain', tier: 'gallery' },
  { id: 'layout-direction', step: 'updates', group: 'toolchain', tier: 'coverage' },
  { id: 'pen-and-pencil', step: 'plate', group: 'toolchain', tier: 'gallery' },
];

/** The showcase tier, in gallery order; the complete collection above remains the coverage inventory. */
export const SHOWCASE: readonly string[] = EXPLAINERS.filter((e) => e.tier === 'showcase').map((e) => e.id);
/** Explainers listed in the gallery and llms.txt: every tier but coverage. */
export const LISTED: readonly string[] = EXPLAINERS.filter((e) => e.tier !== 'coverage').map((e) => e.id);
