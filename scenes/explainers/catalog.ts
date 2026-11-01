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
  description: 'Step through a picture at your own pace, or change a setting to follow another case. The model computes the numbers, diagrams and captions. Publish a portable HTML page with a transcript and no runtime network requests.',
  requirements: 'Node 24 or later and Chromium. Authoring targets Ubuntu and macOS.',
  tutorial: 'https://github.com/adewale/rayner/blob/main/docs/TUTORIAL.md',
  reference: 'https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md',
  skill: 'https://github.com/adewale/rayner/blob/main/skills/rayner-explainers/SKILL.md',
  entry: {id: 'periodic-groups', step: 'column', settings: {element: 'na'}, label: 'Step through what puts an element in its group'},
} as const;

export const EXPLAINERS: readonly { id: string; step: string; group: 'topic' | 'toolchain' }[] = [
  { id: 'periodic-groups', step: 'blocks', group: 'topic' },
  {id:'python-dict',step:'marker',group:'topic'},
  {id:'bloom-filter',step:'false-positive',group:'topic'},
  {id:'git-branches',step:'merge',group:'topic'},
  {id:'monty-hall',step:'odds',group:'topic'},
  {id:'birthday-paradox',step:'chance',group:'topic'},
  {id:'melody-rhythm',step:'bar',group:'topic'},
  { id: 'seasons', step: 'year', group: 'topic' },
  { id: 'oauth-pkce', step: 'attack', group: 'topic' },
  { id: 'exgit', step: 'change', group: 'topic' },
  { id: 'token-bucket', step: 'trace', group: 'topic' },
  { id: 'mr-cache', step: 'after', group: 'topic' },
  { id: 'latest-search', step: 'compare', group: 'topic' },
  { id: 'state-machine', step: 'opened', group: 'topic' },
  { id: 'statecharts', step: 'split', group: 'topic' },
  { id: 'ring-buffer', step: 'result', group: 'topic' },
  { id: '2password', step: 'suggest', group: 'topic' },
  { id: 'just-bash', step: 'cat', group: 'topic' },
  { id: 'cert-renewal', step: 'other-rule', group: 'topic' },
  { id: 'quotient-familial', step: 'plafond', group: 'topic' },
  { id: 'send-sync', step: 'wrap-arc', group: 'topic' },
  { id: 'gtfs', step: 'day', group: 'topic' },
  { id: 'pg-page', step: 'full', group: 'topic' },
  { id: 'traffic-policy', step: 'shares', group: 'topic' },
  { id: 'isdigit', step: 'outcome', group: 'topic' },
  { id: 'ical-recurrence', step: 'change', group: 'topic', },
  { id: 'ext4-space', step: 'users', group: 'topic', },
  { id: 'trust-proxy', step: 'requests', group: 'topic', },
  { id: 'tailwind-gamut', step: 'palette', group: 'topic', },
  { id: 'gnome-files', step: 'give-ups', group: 'topic', },
  { id: 'wcag-map', step: 'v22', group: 'topic', },
  { id: 'feature-tour', step: 'result', group: 'toolchain' },
  { id: 'lantern', step: 'objects', group: 'toolchain' },
  { id: 'fork', step: 'fork', group: 'toolchain' },
  { id: 'agentic-mermaid', step: 'repair', group: 'toolchain' },
  { id: 'glyph', step: 'measure', group: 'toolchain' },
  { id: 'font-metrics', step: 'diagram', group: 'toolchain' },
  { id: 'layout-direction', step: 'columns', group: 'toolchain' },
  { id: 'pen-and-pencil', step: 'plate', group: 'toolchain' },
];
