// Conservative CI policy: prose has a small owner; every other input gets the full campaign.
const executableDocs = new Set(['docs/REFERENCE.md', 'docs/LETTERING.md', 'docs/UPSTREAM.md']);
export function proseOnly(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every(path =>
    !executableDocs.has(path) && /^(?:README\.md|FAQ\.md|CHANGELOG\.md|(?:docs|specs|skills)\/[^\n]+\.md)$/.test(path));
}

// The eight owners a campaign must pass before its result is reused. A successful workflow can
// contain skipped jobs; reuse requires actual success in every owner, including both Mac
// architectures and Safari (compatibility (macos-26, 24)). Branch protection requires all of these
// except that macOS 26 job, which GitHub's hosted arm64 pool can cancel unrun (docs/RELEASING.md),
// so a pull request merged without it gets a full campaign on main instead of reuse.
export const requiredJobs = ['check', 'catalog', 'story', ...['ubuntu-24.04', 'macos-15-intel']
  .flatMap(os => ['24.0.0', '24'].map(node => `compatibility (${os}, ${node})`)), 'compatibility (macos-26, 24)'];
export function completedCampaign(jobs: {name: string; conclusion: string | null}[]): boolean {
  return requiredJobs.every(name => jobs.filter(job => job.name === name).length === 1 &&
    jobs.find(job => job.name === name)!.conclusion === 'success');
}
export function reusableProof(story: {sourceCommit?: string; scenarios?: number; stepWidths?: number; consoleErrors?: unknown[]; runtimeConnections?: unknown[]},
  archive: {sourceCommit?: string; dirty?: boolean; node?: string; gates?: {package?: boolean; browser?: boolean; letteringCapture?: boolean}},
  commit: string, node: string): boolean {
  return /^[a-f0-9]{40}$/.test(commit) && story.sourceCommit === commit && archive.sourceCommit === commit &&
    archive.dirty === false && archive.node === node && archive.gates?.package === true && archive.gates.browser === true &&
    archive.gates.letteringCapture === true && Number.isSafeInteger(story.scenarios) && story.scenarios! > 0 &&
    Number.isSafeInteger(story.stepWidths) && story.stepWidths! > 0 &&
    Array.isArray(story.consoleErrors) && story.consoleErrors.length === 0 &&
    Array.isArray(story.runtimeConnections) && story.runtimeConnections.length === 0;
}
