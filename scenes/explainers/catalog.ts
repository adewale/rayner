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

export const EXPLAINERS: readonly { id: string; step: string; group: 'topic' | 'toolchain' }[] = [
  { id: 'periodic-groups', step: 'reader-filling', group: 'topic' },
  { id: 'python-dict', step: 'marker', group: 'topic' },
  { id: 'bloom-filter', step: 'false-positive', group: 'topic' },
  { id: 'git-branches', step: 'merge', group: 'topic' },
  { id: 'monty-hall', step: 'odds', group: 'topic' },
  { id: 'birthday-paradox', step: 'chance', group: 'topic' },
  { id: 'melody-rhythm', step: 'bar', group: 'topic' },
  { id: 'seasons', step: 'reader-year', group: 'topic' },
  { id: 'oauth-pkce', step: 'reader-redeem', group: 'topic' },
  { id: 'exgit', step: 'reader-change', group: 'topic' },
  { id: 'token-bucket', step: 'reader-refill', group: 'topic' },
  { id: 'mr-cache', step: 'reader-outcome', group: 'topic' },
  { id: 'latest-search', step: 'reader-guard', group: 'topic' },
  { id: 'state-machine', step: 'reader-reject', group: 'topic' },
  { id: 'statecharts', step: 'regions', group: 'topic' },
  { id: 'ring-buffer', step: 'reader-reuse', group: 'topic' },
  { id: '2password', step: 'reader-auth', group: 'topic' },
  { id: 'just-bash', step: 'reader-values', group: 'topic' },
  { id: 'cert-renewal', step: 'reader-retries', group: 'topic' },
  { id: 'quotient-familial', step: 'reader-cap', group: 'topic' },
  { id: 'send-sync', step: 'reader-wrappers', group: 'topic' },
  { id: 'gtfs', step: 'reader-stop', group: 'topic' },
  { id: 'pg-page', step: 'reader-page', group: 'topic' },
  { id: 'traffic-policy', step: 'reader-shares', group: 'topic' },
  { id: 'isdigit', step: 'reader-result', group: 'topic' },
  { id: 'ical-recurrence', step: 'reader-copies', group: 'topic' },
  { id: 'ext4-space', step: 'reader-reserve', group: 'topic' },
  { id: 'trust-proxy', step: 'reader-answer', group: 'topic' },
  { id: 'tailwind-gamut', step: 'reader-display', group: 'topic' },
  { id: 'gnome-files', step: 'reader-sample', group: 'topic' },
  { id: 'wcag-map', step: 'reader-levels', group: 'topic' },
  { id: 'feature-tour', step: 'result', group: 'toolchain' },
  { id: 'lantern', step: 'reader-outputs', group: 'toolchain' },
  { id: 'fork', step: 'reader-cost', group: 'toolchain' },
  { id: 'agentic-mermaid', step: 'reader-repair', group: 'toolchain' },
  { id: 'glyph', step: 'reader-shape', group: 'toolchain' },
  { id: 'font-metrics', step: 'diagram', group: 'toolchain' },
  { id: 'layout-direction', step: 'updates', group: 'toolchain' },
  { id: 'pen-and-pencil', step: 'reader-labels', group: 'toolchain' },
];

/** Public selection; the complete collection above remains the coverage inventory. */
export const SHOWCASE = ['python-dict', 'bloom-filter', 'git-branches', 'melody-rhythm', 'monty-hall', 'token-bucket'] as const;
