#!/usr/bin/env node
// Use existing CI artifacts for identical merged trees. Missing proof always runs full CI.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appendFile, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {proseOnly, requiredJobs, completedCampaign, reusableProof} from './lib/ci-scope.ts';
const run = promisify(execFile);
const git = async (...args: string[]) => (await run('git', args)).stdout.trim();
const api = async (path: string) => JSON.parse((await run('gh', ['api', path], {maxBuffer: 8 * 1024 * 1024})).stdout);
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8'));
const repo = process.env.GITHUB_REPOSITORY!, sha = process.env.GITHUB_SHA!;
let full = true, prose = false, reason = 'Full validation: code, fixtures, unknown changes or explicit dispatch.';
const eventName = process.env.GITHUB_EVENT_NAME;
const mainPush = eventName === 'push' && process.env.GITHUB_REF === 'refs/heads/main';
const range = eventName === 'pull_request'
  ? `${event.pull_request.base.sha}...${event.pull_request.head.sha}`
  : mainPush && /^[a-f0-9]{40}$/.test(event.before ?? '') && !/^0+$/.test(event.before)
    ? `${event.before}..${sha}` : undefined;
if (range) {
  let paths: string[] = [];
  try { paths = (await git('diff', '--no-renames', '--name-only', '-z', range)).split('\0').filter(Boolean); }
  catch (error) { console.log(`Could not establish the diff; running full CI: ${String(error)}`); }
  if (proseOnly(paths)) {
    await git('diff', '--check', range);
    full = false; prose = true;
    reason = 'Prose-only change: authoring documentation checks run in scope.';
  }
}
if (mainPush && full) {
  try {
    const pulls = await api(`repos/${repo}/commits/${sha}/pulls`);
    const pr = pulls.find((p: any) => p.merged_at && p.merge_commit_sha === sha && p.base.ref === 'main' && p.head.repo?.full_name === repo);
    if (pr) {
      const runs = await api(`repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&status=success&per_page=10`);
      for (const candidate of runs.workflow_runs) {
        const age = Date.now() - Date.parse(candidate.created_at);
        if (!(age >= 0 && age <= 24 * 60 * 60 * 1000) || candidate.head_repository?.full_name !== repo) continue;
        const jobs = await api(`repos/${repo}/actions/runs/${candidate.id}/jobs?per_page=100`);
        if (!completedCampaign(jobs.jobs)) continue;
        const artifacts = await api(`repos/${repo}/actions/runs/${candidate.id}/artifacts?per_page=100`);
        const storyArtifact = artifacts.artifacts.find((a: any) => !a.expired && /^rayner-story-[a-f0-9]{40}$/.test(a.name));
        if (!storyArtifact) continue;
        const commit = storyArtifact.name.slice('rayner-story-'.length);
        if (!artifacts.artifacts.some((a: any) => !a.expired && a.name === `rayner-package-${commit}`)) continue;
        const folder = await mkdtemp(join(tmpdir(), 'rayner-ci-reuse-'));
        try {
          for (const name of [storyArtifact.name, `rayner-package-${commit}`])
            await run('gh', ['run', 'download', String(candidate.id), '--repo', repo, '--name', name, '--dir', folder]);
          const story = JSON.parse(await readFile(join(folder, 'browser-review.json'), 'utf8'));
          const archive = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
          if (!reusableProof(story, archive, commit, process.version)) continue;
          // The receipt names the synthetic merge actually tested, not merely the PR head.
          await run('git', ['fetch', '--no-tags', 'origin', commit]);
          if (await git('rev-parse', `${commit}^{tree}`) !== await git('rev-parse', `${sha}^{tree}`)) continue;
          await run('git', ['merge-base', '--is-ancestor', pr.head.sha, commit]);
          full = false;
          reason = `Identical tree already passed all ${requiredJobs.length} owners: https://github.com/${repo}/actions/runs/${candidate.id}`;
          break;
        } finally { await rm(folder, {recursive: true, force: true}); }
      }
    }
  } catch (error) {
    full = true;
    reason = 'Full validation: reusable PR proof could not be established.';
    console.log(`${reason} ${String(error)}`);
  }
}
console.log(reason);
// The caller runs documentation assertions before accepting a prose-only decision.
await appendFile(process.env.GITHUB_OUTPUT!, `full=${full}\nprose=${prose}\n`);
await appendFile(process.env.GITHUB_STEP_SUMMARY!, `${reason}\n`);
