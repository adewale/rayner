// The git-branches explainer's model: two branches from A, feature's B changing colour.txt, main's C (in the
// diverged history) adding title.txt, and the merge: M with parents C and B, or main fast-forwarded to B.
// Its ordinary merges match real Git with merge.ff=true (model.test.ts). It does not model
// squash merges, rebases, conflicts or octopus merges; --ff-only (which would refuse the diverged merge) and
// --no-ff (which can choose a commit where a fast-forward would do) are not states it draws. "No branch
// reaches C" means these two labels: reflogs, tags, remote-tracking refs, recovery and garbage collection are
// outside it, and an unreachable commit is still stored.
export interface LessonCommit {id: string; parents: string[]; colour: string; title: string | null}
export interface GitFrame {commits: LessonCommit[]; main: string; feature: string | null; head: 'main' | 'feature'; current: string; merge: 'none' | 'commit' | 'fast-forward'}
export function gitStory(advanced: boolean): GitFrame[] {
  const commits: LessonCommit[] = [{id: 'A', parents: [], colour: 'blue', title: null}];
  let main = 'A', feature: string | null = null, head: 'main' | 'feature' = 'main';
  const frames: GitFrame[] = [];
  const frame = (merge: GitFrame['merge'] = 'none') => frames.push({commits: commits.map(c => ({...c, parents: [...c.parents]})), main, feature, head, current: (head === 'main' ? main : feature)!, merge});
  frame();
  feature = 'A'; frame();
  head = 'feature'; commits.push({id: 'B', parents: ['A'], colour: 'green', title: null}); feature = 'B'; frame();
  head = 'main'; frame();
  if (advanced) {commits.push({id: 'C', parents: ['A'], colour: 'blue', title: 'Home'}); main = 'C';}
  frame();
  if (advanced) {commits.push({id: 'M', parents: ['C', 'B'], colour: 'green', title: 'Home'}); main = 'M';}
  else main = 'B';
  frame(advanced ? 'commit' : 'fast-forward');
  return frames;
}
export function currentFiles(frame: GitFrame) {
  const commit = frame.commits.find(c => c.id === frame.current)!;
  return {colour: commit.colour, title: commit.title};
}
/** The commits reachable from `id` by following parents: what a branch on it contains. */
export function history(frame: GitFrame, id: string): string[] {
  const seen: string[] = [], todo = [id];
  while (todo.length) {
    const next = todo.shift()!;
    if (seen.includes(next)) continue;
    seen.push(next);
    todo.push(...frame.commits.find(c => c.id === next)!.parents);
  }
  return seen;
}
/** What a merge would do if it only moved labels: main points at feature's commit, and HEAD's files follow. */
export function moveMainToFeature(frame: GitFrame): GitFrame {
  if (!frame.feature) throw new Error('No feature branch to move main onto');
  return {...frame, commits: frame.commits.map(c => ({...c, parents: [...c.parents]})), main: frame.feature,
    current: frame.head === 'main' ? frame.feature : frame.current, merge: 'none'};
}
/** Commits no branch label reaches: what that label-only move would leave behind. */
export function unreachable(frame: GitFrame): string[] {
  const kept = new Set([frame.main, ...(frame.feature ? [frame.feature] : [])].flatMap(id => history(frame, id)));
  return frame.commits.map(c => c.id).filter(id => !kept.has(id));
}
