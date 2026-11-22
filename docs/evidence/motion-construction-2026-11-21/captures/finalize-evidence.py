import json,re,subprocess,shutil,datetime
from pathlib import Path
src=Path('out/principled-construction');dst=Path('docs/evidence/motion-construction-2026-11-21');captures=dst/'captures'
def stats(name):
 text=(src/name).read_text();d={}
 for key in ['tests','pass','fail','cancelled','skipped']:
  found=re.findall(r'ℹ '+key+r' (\d+)',text)
  if found:d[key]=int(found[-1])
 assert d.get('fail')==0 and d.get('cancelled')==0,(name,d)
 return {'receipt':'captures/'+name,**d}
def zero(name):
 assert (src/(name+'.exit')).read_text().strip()=='0',name
 return {'receipt':'captures/'+name+'.log','exit':0}
files=sorted(str(p) for p in Path('test/browser').glob('*.test.ts'))
assert len(files)==29
split=files.index('test/browser/explain-site.test.ts');assert split==21
partial=(src/'browser-final.log').read_text()
assert not re.search(r'^\s*✖',partial,re.M)
assert 'catalog export selects its own entry' in partial
# The original runner used test-concurrency=1. Every earlier file had completed
# before the interrupted file started. Rerun that entire file and every later one.
resume=stats('browser-resume.log')
browser={'filesCovered':29,'completedBeforeRestart':files[:split],'rerunAfterRestart':files[split:],'resume':resume,'interruptedReceipt':'captures/browser-final.log','note':'Environment restart interrupted the original runner during the22nd file. First21 completed sequentially with no reported failures; the interrupted file and all7 later files were rerun fully. No clean single-run footer or aggregate test count is invented for the interrupted run.'}
checks={
 'integrationFollowups':stats('integration-followup.log'),
 'corpusAndPackageOwners':stats('corpus-package-followup.log'),
 'nativeSignInFinal':stats('sign-in-portable-final.log'),
 'nativeOtherReaderOwnersFinal':stats('reader-owners-portable-final.log'),
 'fullOnlyNativeProofsFinal':stats('native-proof-portable-final.log'),
 'portableHelperRuntimeAwait':stats('runtime-public-route-tests.log'),
 'portableChapterClients':stats('runtime-public-route-clients.log'),
 'repositoryAwaitKeeper':stats('runtime-public-await-owner.log'),
 'fullRefusals':stats('refusals-resource-portable.log'),
 'browserSuite':browser,
 'finalDocumentAndInterfaceContracts':stats('document-contracts-final.log'),
 'typecheck':zero('typecheck-release-final'),
 'installedPackage':zero('pack-release-final'),
}
assert (src/'browser-resume.exit').read_text().strip()=='0'
full=(src/'full-suite.log').read_text();assert 'ℹ pass 2165' in full and 'ℹ fail 7' in full and 'ℹ skipped 193' in full
for args in [ ['git','diff','--quiet','bad4209','--','docs/evidence/motion-all59-2026-11-21'],['git','diff','--quiet','11b9ab5a61fbed0cb57006f583317b56eb02b5aa','--','bench/explainers/round-3-2026-11-19'] ]:subprocess.run(args,check=True)
subprocess.run(['git','diff','--check'],check=True)
report={
 'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
 'scope':'Repository integration plus final changed-owner followups, complete corpus and catalog, native/browser/package boundaries. Counts overlap; do not sum them as unique tests.',
 'repositoryIntegration':{'command':'NODE_OPTIONS=--max-old-space-size=1024 node --expose-gc --test --test-concurrency=2 test/*.test.ts test/browser/*.test.ts scenes/*/*/*.test.ts','tests':2365,'pass':2165,'fail':7,'skipped':193,'receipt':'captures/full-suite.log','note':'Integration run predates final owner reconciliation. Its failures remain failures in this record; all seven are corrected and verified by the final owners below. This is not presented as a new clean full-suite run.'},
 'resolvedIntegrationFailures':[
  {'test':'machine check concise JSON verdict','repair':'Accurate checked-state wording','verifiedBy':'integrationFollowups'},
  {'test':'machine starter exact report','repair':'Add presentations/transitions to the expected additive report shape','verifiedBy':'integrationFollowups'},
  {'test':'writing guide done-stage report','repair':'Document actual16 states/16 presentations/15 accepted transitions','verifiedBy':'integrationFollowups'},
  {'test':'library import boundaries','repair':'Import identical JSON functions through existing internal barrel','verifiedBy':'integrationFollowups'},
  {'test':'internal member ownership inventory','repair':'List the shared inventory as actual owner; retain exact rule','verifiedBy':'integrationFollowups'},
  {'test':'corpus sample','repair':'Do not credit the poll wrong-target observation; native domain proof retained separately','verifiedBy':'corpusAndPackageOwners'},
  {'test':'bundled command library boundary','repair':'Same internal-barrel repair; no new public export','verifiedBy':'corpusAndPackageOwners'},
 ],
 'additionalBoundaryRepair':{'problem':'Installed-author test dependency reached private renderer internals; SignIn public scene test reached repository-only fidelity','repair':'Public native foreground compositing; pacing poison belongs in repository fidelity; repository await keeper moved out of portable scene inventory','verifiedBy':['installedPackage','portableHelperRuntimeAwait','repositoryAwaitKeeper','nativeSignInFinal']},
 'checks':checks,
 'genericMeasurement':{'variants':59,'finishedWorkers':59,'completeReplays':52,'typedEarlyRefusals':7,'errors':0,'credited':39,'rawRejected':40,'baselines':8,'baselineFindings':0,'otherCatalog':45,'otherCatalogFindings':0,'rawReceipt':'capture.json.gz','inputManifest':'source.json','finalInterfaceOnlyAmendment':'captures/interface-amendment/amendment.json'},
 'preserved':{'frozenVisualAuditUnchanged':True,'frozenRound3BenchmarkUnchanged':True},
 'scopeLimits':['Default full-suite run has193 explicit skips; the completed first21 Chromium files plus resumed8 cover all29 browser owners and retain the resume run’s explicit skips.','FULL whole-corpus worker gate was not replayed a second time; its39 individual identities and lower bound are verified against the complete new59-worker capture.','Native observations are finite sampled/resolution-specific evidence; bounded/deeper reader exploration retains declared completeness/sampling limits.','A full new visual audit of all59 reconstructed variants was not performed.'],
}
(dst/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
patterns=['runtime*','final-*-review*','refusals-*native*','refusals-*resource*','integration-followup*','corpus-package-followup*','sign-in-*final*','reader-owners-portable-final*','native-proof-*final*','typecheck-*final*','typecheck-release-final*','pack-*final*','full-suite*','browser-final*','browser-resume*','final-generic-source-check.json','finalize-evidence.py','document-contracts-final*']
for pattern in patterns:
 for p in src.glob(pattern):
  if p.is_file():shutil.copy2(p,captures/p.name)
print(json.dumps({'source':report['sourceCommit'],'checks':checks},indent=2))
