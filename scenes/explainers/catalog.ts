import { HOME } from '../../app/embed-share.ts';

/**
 * The collection, in gallery order. `topic` explainers are about subjects a
 * reader might search for; `toolchain` explainers show how these explanations
 * are made (the engine, the diagrams, the text outlines). `step` chooses
 * the default case's poster step; gallery links open at step one instead.
 */
export const PRODUCT = {
  /** The project's home, where every page's footer mark links (app/embed-share.ts). */
  home: HOME,
  summary: 'Interactive explanations of protocols, algorithms and code changes.',
  audience: 'For engineers and technical educators who write TypeScript.',
  description:
    'Step through a picture at your own pace, or change a setting to follow another case. The model computes the numbers, diagrams and captions. Publish a portable HTML page with a transcript and no runtime network requests.',
  requirements: 'Node 24 or later and Chromium. Authoring targets Ubuntu and macOS.',
  tutorial: 'https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md',
  reference: 'https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md',
  skill: 'https://github.com/adewale/rayner/blob/main/skills/rayner-explainers/SKILL.md',
  entry: {
    id: 'python-dict',
    step: 'question',
    settings: { key: '8' },
    label: 'See why deleting a dictionary entry needs a marker',
  },
} as const;

/**
 * Where an explainer is shown, from its verdict under docs/EXPLAINER-RUBRIC.md. `showcase`: graded
 * Good, and leads the gallery. `gallery`: worth reading, behind "More". `coverage`: kept because it is
 * the only scene exercising some engine feature, diagram family or check (or until it is rebuilt);
 * its page is built and tested but not listed in the gallery or llms.txt.
 */
export type Tier = 'showcase' | 'gallery' | 'coverage';

export const EXPLAINERS: readonly { id: string; step: string; group: 'topic' | 'toolchain'; tier: Tier }[] = [
  { id: 'periodic-groups', step: 'blocks', group: 'topic', tier: 'gallery' },
  { id: 'python-dict', step: 'marker', group: 'topic', tier: 'showcase' },
  { id: 'bloom-filter', step: 'false-positive', group: 'topic', tier: 'showcase' },
  { id: 'git-branches', step: 'merge', group: 'topic', tier: 'showcase' },
  { id: 'monty-hall', step: 'worlds', group: 'topic', tier: 'showcase' },
  { id: 'birthday-paradox', step: 'chance', group: 'topic', tier: 'coverage' },
  { id: 'melody-rhythm', step: 'bar', group: 'topic', tier: 'showcase' },
  { id: 'seasons', step: 'latitude', group: 'topic', tier: 'gallery' },
  { id: 'oauth-pkce', step: 'attack', group: 'topic', tier: 'gallery' },
  { id: 'exgit', step: 'change', group: 'topic', tier: 'gallery' },
  { id: 'token-bucket', step: 'later', group: 'topic', tier: 'showcase' },
  { id: 'mr-cache', step: 'reader-outcome', group: 'topic', tier: 'coverage' },
  { id: 'latest-search', step: 'reader-guard', group: 'topic', tier: 'gallery' },
  { id: 'state-machine', step: 'reader-reject', group: 'topic', tier: 'coverage' },
  { id: 'statecharts', step: 'regions', group: 'topic', tier: 'gallery' },
  { id: 'ring-buffer', step: 'result', group: 'topic', tier: 'gallery' },
  { id: '2password', step: 'reader-boundary', group: 'topic', tier: 'gallery' },
  { id: 'just-bash', step: 'reader-values', group: 'topic', tier: 'coverage' },
  { id: 'cert-renewal', step: 'year', group: 'topic', tier: 'gallery' },
  { id: 'quotient-familial', step: 'multiplie', group: 'topic', tier: 'gallery' },
  { id: 'send-sync', step: 'reader-wrappers', group: 'topic', tier: 'gallery' },
  { id: 'gtfs', step: 'reader-stop', group: 'topic', tier: 'gallery' },
  { id: 'pg-page', step: 'reader-page', group: 'topic', tier: 'gallery' },
  { id: 'traffic-policy', step: 'reader-shares', group: 'topic', tier: 'gallery' },
  { id: 'isdigit', step: 'outcome', group: 'topic', tier: 'gallery' },
  { id: 'ical-recurrence', step: 'copy', group: 'topic', tier: 'gallery' },
  { id: 'ext4-space', step: 'reader-reserve', group: 'topic', tier: 'gallery' },
  { id: 'trust-proxy', step: 'read', group: 'topic', tier: 'gallery' },
  { id: 'tailwind-gamut', step: 'reader-display', group: 'topic', tier: 'gallery' },
  { id: 'gnome-files', step: 'reader-sample', group: 'topic', tier: 'coverage' },
  { id: 'wcag-map', step: 'reader-levels', group: 'topic', tier: 'coverage' },
  { id: 'feature-tour', step: 'result', group: 'toolchain', tier: 'coverage' },
  { id: 'lantern', step: 'seek', group: 'toolchain', tier: 'gallery' },
  { id: 'fork', step: 'cases', group: 'toolchain', tier: 'gallery' },
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
