// Read-only diagnostics: never retry, cancel, or convert a failed platform check into success.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appendFile} from 'node:fs/promises';
import {ciStatus} from './lib/ci-status.ts';
import type {JobStatus} from './lib/ci-status.ts';
const repo = process.env.GITHUB_REPOSITORY!, runId = process.env.GITHUB_RUN_ID!;
if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[1-9]\d*$/.test(runId)) throw new Error('invalid CI repository or run ID');
const {stdout} = await promisify(execFile)('gh', ['api', '--paginate', '--slurp', `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`], {maxBuffer: 8 * 1024 * 1024});
const pages = JSON.parse(stdout) as {jobs: JobStatus[]}[];
const report = ciStatus(pages.flatMap(page => page.jobs), repo, runId);
console.log(report.markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report.markdown);
for (const job of report.unassigned)
  console.log(`::warning title=Runner was never assigned::Job ${job.id} was cancelled with zero executed steps. See CI timing and runner assignment for a targeted retry command.`);
