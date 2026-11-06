import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitStory, currentFiles, history, moveMainToFeature, unreachable } from './model.ts';

test('branch labels, parents and checked-out files match real Git through both merge histories',()=>{
  for(const advanced of [false,true]) {
    const dir=mkdtempSync(join(tmpdir(),'rayner-git-lesson-'));
    const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Lesson',GIT_AUTHOR_EMAIL:'lesson@example.invalid',GIT_COMMITTER_NAME:'Lesson',GIT_COMMITTER_EMAIL:'lesson@example.invalid',GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z'}}).trim();
    const commit=(name:string)=>{git('add','.');git('-c','commit.gpgsign=false','commit','-m',name);};
    const contents=(file:string)=>{try{return readFileSync(join(dir,file),'utf8').trim();}catch{return null;}};
    try {
      git('init','-q','-b','main');writeFileSync(join(dir,'colour.txt'),'blue\n');commit('A');
      const frames=gitStory(advanced);
      const compare=(i:number)=>{
        const expected=frames[i]!;
        assert.equal(git('branch','--show-current'),expected.head);
        assert.equal(git('log','-1','--format=%s','main'),expected.main);
        assert.equal(git('log','-1','--format=%s'),expected.current);
        if(expected.feature) assert.equal(git('log','-1','--format=%s','feature'),expected.feature);
        else assert.equal(git('branch','--list','feature'),'');
        const actual=git('log','--all','--format=%H %s').split('\n').map(row=>row.split(' '));
        const names=new Map(actual.map(([sha,name])=>[sha!,name!]));
        assert.equal(actual.length,expected.commits.length);
        for(const c of expected.commits) {
          const sha=actual.find(([,name])=>name===c.id)![0]!;
          assert.deepEqual(git('show','-s','--format=%P',sha).split(' ').filter(Boolean).map(p=>names.get(p)),c.parents);
        }
        assert.deepEqual({colour:contents('colour.txt'),title:contents('title.txt')},currentFiles(expected));
      };
      compare(0);git('branch','feature');compare(1);
      git('switch','-q','feature');writeFileSync(join(dir,'colour.txt'),'green\n');commit('B');compare(2);
      git('switch','-q','main');compare(3);
      if(advanced){writeFileSync(join(dir,'title.txt'),'Home\n');commit('C');}compare(4);
      git('-c','merge.ff=true','-c','commit.gpgsign=false','merge','--no-edit','-m','M','feature');compare(5);
      assert.equal(frames[5]!.merge,advanced?'commit':'fast-forward');
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});

test('moving only the main label to feature drops C exactly when real Git would leave it on no branch',()=>{
  for(const advanced of [false,true]) {
    const dir=mkdtempSync(join(tmpdir(),'rayner-git-label-'));
    const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Lesson',GIT_AUTHOR_EMAIL:'lesson@example.invalid',GIT_COMMITTER_NAME:'Lesson',GIT_COMMITTER_EMAIL:'lesson@example.invalid',GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z'}}).trim();
    const commit=(name:string)=>{git('add','.');git('-c','commit.gpgsign=false','commit','-m',name);};
    const contents=(file:string)=>{try{return readFileSync(join(dir,file),'utf8').trim();}catch{return null;}};
    try {
      git('init','-q','-b','main');writeFileSync(join(dir,'colour.txt'),'blue\n');commit('A');
      git('branch','feature');git('switch','-q','feature');writeFileSync(join(dir,'colour.txt'),'green\n');commit('B');
      git('switch','-q','main');
      if(advanced){writeFileSync(join(dir,'title.txt'),'Home\n');commit('C');}
      const before=gitStory(advanced)[4]!,names=new Map(git('log','--all','--format=%H %s').split('\n').map(row=>row.split(' ') as [string,string]));
      const subjects=(rev:string)=>git('rev-list',rev).split('\n').map(sha=>names.get(sha)!).sort();
      assert.deepEqual(subjects('feature'),history(before,'B').sort(),'B’s history');
      assert.deepEqual(subjects('main'),history(before,before.main).sort(),'main’s history before the move');
      const shaOf=new Map([...names].map(([sha,name])=>[name,sha]));
      // The label-only move: point main (checked out) at feature's commit.
      git('reset','-q','--hard','feature');
      const moved=moveMainToFeature(before);
      assert.equal(git('log','-1','--format=%s','main'),moved.main);
      assert.equal(git('log','-1','--format=%s'),moved.current);
      assert.deepEqual({colour:contents('colour.txt'),title:contents('title.txt')},currentFiles(moved));
      const orphans=[...shaOf].filter(([,sha])=>git('branch','--contains',sha)==='').map(([name])=>name).sort();
      assert.deepEqual(orphans,unreachable(moved),'commits no branch reaches after the move');
      assert.deepEqual(unreachable(moved),advanced?['C']:[]);
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});

test('after M, real Git repeats a merge without changes, reverses it by fast-forward, and honours --no-ff',()=>{
  const dir=mkdtempSync(join(tmpdir(),'rayner-git-back-'));
  const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Lesson',GIT_AUTHOR_EMAIL:'lesson@example.invalid',GIT_COMMITTER_NAME:'Lesson',GIT_COMMITTER_EMAIL:'lesson@example.invalid',GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z'}}).trim();
  const commit=(name:string)=>{git('add','.');git('-c','commit.gpgsign=false','commit','-m',name);};
  try {
    git('init','-q','-b','main');writeFileSync(join(dir,'colour.txt'),'blue\n');commit('A');
    git('branch','feature');git('switch','-q','feature');writeFileSync(join(dir,'colour.txt'),'green\n');commit('B');
    git('switch','-q','main');writeFileSync(join(dir,'title.txt'),'Home\n');commit('C');
    git('-c','merge.ff=true','-c','commit.gpgsign=false','merge','--no-edit','-m','M','feature');
    const merged=gitStory(true)[5]!;
    assert.ok(history(merged,merged.main).includes(merged.feature!),'feature’s commit is in M’s history');
    const mergedSha=git('rev-parse','main'),featureSha=git('rev-parse','feature');
    assert.match(git('-c','merge.ff=true','merge','--no-edit','feature'),/Already up to date/);
    assert.equal(git('rev-parse','main'),mergedSha,'merging an ancestor again leaves main at M');
    assert.equal(git('rev-list','--all','--count'),String(merged.commits.length),'repeated merge creates nothing');
    git('switch','-q','feature');
    git('-c','merge.ff=true','-c','commit.gpgsign=false','merge','--no-edit','main');
    assert.equal(git('log','-1','--format=%s','feature'),'M');
    assert.equal(git('rev-list','--all','--count'),String(merged.commits.length),'no new commit');
    // Return to the same B -> M relation and request a merge commit explicitly.
    git('reset','-q','--hard',featureSha);
    git('-c','commit.gpgsign=false','merge','--no-ff','--no-edit','-m','forced','main');
    assert.deepEqual(git('show','-s','--format=%P','feature').split(' '),[featureSha,mergedSha]);
    assert.equal(git('rev-list','--all','--count'),String(merged.commits.length+1),'--no-ff makes a commit despite the possible fast-forward');
    assert.equal(readFileSync(join(dir,'colour.txt'),'utf8').trim(),'green');
    assert.equal(readFileSync(join(dir,'title.txt'),'utf8').trim(),'Home');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
