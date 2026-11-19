export interface JobStatus {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  runner_id: number | null;
  runner_name: string | null;
  steps: unknown[];
}
const seconds = (from: string | null, to: string | null) => {
  if (!from || !to) return null;
  const result = (Date.parse(to) - Date.parse(from)) / 1000;
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const duration = (value: number | null) => value === null ? '—' : `${Math.floor(Math.round(value) / 60)}m ${Math.round(value) % 60}s`;
const cell = (text: string) => text.replaceAll(/[\r\n]/g, ' ').replaceAll('|', '\\|').replaceAll('`', '\\`');

/** Assignment metadata establishes whether tests ran; it cannot establish who cancelled a job. */
export function unassignedCancellation(job: JobStatus): boolean {
  return job.conclusion === 'cancelled' && !job.runner_id && !job.runner_name && job.steps.length === 0;
}
export function ciStatus(jobs: readonly JobStatus[], repo: string, runId: string) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[1-9]\d*$/.test(runId)) throw new Error('invalid CI repository or run ID');
  const cancelled = jobs.filter(unassignedCancellation);
  const rows = jobs.filter(job => job.name !== 'ci-status').map(job => {
    const assigned = !!job.runner_id || !!job.runner_name || job.steps.length > 0;
    const queue = assigned ? duration(seconds(job.created_at, job.started_at)) : `unassigned (${duration(seconds(job.created_at, job.completed_at))})`;
    const execution = assigned ? duration(seconds(job.started_at, job.completed_at)) : '—';
    return `| ${cell(job.name)} | ${cell(job.conclusion ?? job.status)} | ${queue} | ${execution} |`;
  });
  const retry = cancelled.map(job => {
    if (!Number.isSafeInteger(job.id) || job.id <= 0) throw new Error('invalid CI job ID');
    return `- ${cell(job.name)} was cancelled before runner assignment; zero steps ran. Inspect the run's cancellation reason, then retry only this job if appropriate:\n\n  \`gh run rerun ${runId} --job ${job.id} --repo ${repo}\``;
  });
  return {
    unassigned: cancelled,
    markdown: ['## CI timing and runner assignment', '', '| Job | Result | Queue/wait | Execution |', '| --- | --- | ---: | ---: |', ...rows,
      '', ...retry, ...(cancelled.length ? ['', 'An unassigned cancellation is not a test failure. Around-15-minute waits match the hosted macOS provisioning symptom in https://github.com/actions/runner/issues/4833; metadata alone cannot rule out manual or concurrency cancellation. ARM/Safari coverage remains required for proof reuse.'] : []), ''].join('\n'),
  };
}
