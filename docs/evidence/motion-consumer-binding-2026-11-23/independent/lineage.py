from pathlib import Path
from functools import lru_cache
import hashlib,json,subprocess,gzip,sys,os
own=Path(__file__).resolve().parent
repo=own.parents[2]
prior=Path('/workspace/rayner/out/remaining-fixes-2026-11-22/astra-attempt-2')
revs=['8151582fc8a4ff2d06d6b4e5607633e0474c0dbf',sys.argv[1]]
h=lambda b:hashlib.sha256(b).hexdigest()
load=lambda f:json.loads(f.read_bytes())
canon=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')).encode()
dig=lambda v:h(canon(v))
artifact=lambda p:{'path':os.path.relpath(p,own),'sha256':h(p.read_bytes())}
prev=load(prior/'review-receipt.json');assert h((prior/'review.json').read_bytes())==prev['review']['sha256']
paths={'driverSha256':'tools/repo/motion-current-audit.ts','routesSha256':'tools/repo/motion-audit-routes.ts','corpusSha256':'test/fixtures/motion-corpus/corpus.ts','packageLockSha256':'package-lock.json'}
allpack=[]
for rev in revs:
 base=Path('/workspace/rayner') if rev==revs[0] else repo;native=base/('out/root-causes-native-'+rev[:8]);packet=base/('out/root-causes-review-'+rev[:8]);cf=packet/'capture.json'
 cap=load(cf);ix=load(native/'index.json');p=load(native/'provenance.json')
 assert cap['sourceRevision']==ix['revision']==p['revision']==rev
 assert cap['run']=='root-causes-'+rev[:8] and ix['expected']==ix['uniqueIds']==ix['completed']==len(cap['cases'])==59
 assert len(set(x['id'] for x in ix['cases']))==59
 for key,path in paths.items():
  assert h(subprocess.check_output(['git','show',rev+':'+path],cwd=repo))==p[key],key
 assert h((native/'provenance.json').read_bytes())==cap['provenance']['sha256']
 ids=[x['id'] for x in cap['cases']]; assert ids==[x['id'] for x in ix['cases']]
 items={};global_seen=set()
 for c,i in zip(cap['cases'],ix['cases']):
  id=c['id'];casep=(packet/c['caseReceipt']['path']).resolve();assert casep==native/id/'case.json'
  case=load(casep);assert case==i and h(casep.read_bytes())==c['caseReceipt']['sha256']
  assert case['id']==id and case['revision']==rev and case['status']==c['status'] and c['route']==case['route'] and case['captureDriverSha256']==p['driverSha256']
  ledger={};assets=set()
  for side in c['sides']:
   role=side['side'];file=(packet/side['receipt']['path']).resolve();assert file==native/id/role/'receipt.json'
   assert h(file.read_bytes())==side['receipt']['sha256']
   rec=load(file);assert rec['side']==role and rec['status']==side['status'] and rec['mark']==side['mark'] and rec['provenance']==side['provenance'] and rec['route']==c['route']
   assert rec['width']==800 and rec['height']==450 and rec['fps']==30 and rec['frameCount']==len(rec['frames'])==side['frameCount']
   seen={};frames=[]
   for n,f in enumerate(rec['frames']):
    assert n==f['sequence'] and f['asset']==f['svg']
    if f['asset'] not in seen:
     img=file.parent/(f['asset']+'.png');png=img.read_bytes();assert png[:8]==bytes.fromhex('89504e470d0a1a0a')
     assert int.from_bytes(png[16:20],'big')==800 and int.from_bytes(png[20:24],'big')==450
     seen[f['asset']]=h(png)
    frames.append({**f,'pngSha256':seen[f['asset']]})
   assert len(seen)==rec['uniqueAssets'];assets.update(seen.values())
   ledger[role]={'frames':frames,'mark':rec['mark'],'status':rec['status'],'route':rec['route'],'provenance':rec['provenance'],'fps':rec['fps'],'receiptSha256':side['receipt']['sha256'],'reader':rec.get('reader')}
  assert set(ledger)=={'baseline','variant'}
  contact=(packet/c['contact']['path']).resolve();assert h(contact.read_bytes())==c['contact']['sha256'];assets.add(c['contact']['sha256']);assert assets==set(c['nativeAssets'])
  global_seen.update(assets)
  items[id]={'route':c['route'],'status':c['status'],'source':c['source'],'case':case,'ledger':ledger}
 assert global_seen==set(cap['nativeAssets'])
 allpack.append((items,{'index':artifact(native/'index.json'),'capture':artifact(cf),'sourceProvenance':artifact(native/'provenance.json'),'uniqueNativeAssets':len(global_seen),'sourceFiles':paths,'revision':rev,'run':cap['run']}))
old,first=allpack[0];new,second=allpack[1];assert list(old)==list(new)
out=[]
for id,now in new.items():
 before=old[id];assert before['status']==now['status'] and before['route']==now['route'] and before['source']==now['source']
 assert before['case']['mutation']==now['case']['mutation'] and before['case']['mutationSha256']==now['case']['mutationSha256'] and before['case']['routeSha256']==now['case']['routeSha256']
 row={'id':id,'route':now['route'],'status':now['status'],'sides':{}}
 for side in ['baseline','variant']:
  a,b=before['ledger'][side],now['ledger'][side]
  normalized=lambda m:json.loads(json.dumps(m).replace('file:///workspace/rayner-attempt3/', 'file:///workspace/rayner/'))
  meta=a['status']==b['status'] and a['route']==b['route'] and normalized(a['mark'])==normalized(b['mark']) and a['fps']==b['fps'] and a['reader']==b['reader'] and a['provenance']['settings']==b['provenance']['settings']
  ca,cb=[[{k:f[k] for k in ('sequence','frame','absolute','step','phase')} for f in l['frames']] for l in (a,b)]
  fa,fb=a['frames'],b['frames'];delta=[i for i,(aa,bb) in enumerate(zip(fa,fb)) if aa['pixels']!=bb['pixels'] or aa['pngSha256']!=bb['pngSha256']]
  assert len(fa)==len(fb) and meta and ca==cb,(id,side)
  row['sides'][side]={'count':len(fb),'origin':b['mark']['origin'],'end':b['mark']['end'],'metadataAndEveryClockEqual':meta and ca==cb,'exactRawMarkEqualityBeforeWorktreePrefixNormalization':a['mark']==b['mark'],'oldLedger':a['receiptSha256'],'currentLedger':b['receiptSha256'],'sourceBundleOld':a['provenance']['bundledSource'],'sourceBundleNew':b['provenance']['bundledSource'],'currentRouteAndMarkHash':dig([b['route'],b['mark']]),'currentClocksHash':dig(cb),'priorPixelsAndPngInventoryHash':dig([[f['pixels'],f['pngSha256']] for f in fa]),'currentPixelsAndPngInventoryHash':dig([[f['pixels'],f['pngSha256']] for f in fb]),'changedPixelOrPngSequence':delta,'identicalSvgFrameCount':sum(x['svg']==y['svg'] for x,y in zip(fa,fb))}
 row['allIdentity']=all(not s['changedPixelOrPngSequence'] and s['metadataAndEveryClockEqual'] for s in row['sides'].values());out.append(row)
stats={'complete':sum(v['status']=='complete' for v in new.values()),'typedPreventions':sum(v['status']=='typed-refusal' for v in new.values()),'entireTwoSidedRoutesIdentical':sum(r['allIdentity'] for r in out),'changedRoutes':[r['id'] for r in out if not r['allIdentity']],'sideFrameOccurrences':sum(s['count'] for r in out for s in r['sides'].values())}
(own/('route-lineage-'+revs[1][:8]+'.json')).write_text(json.dumps({'prior':first,'current':second,'priorIndependentReview':prev['review'],'method':'Verified every side ledger, actual PNG bytes, pixel-hash entry, clock, step, runtime phase, route, guard, model/history, renderer provenance and original mutation. compared equally indexed frames. Bundled source hashes are retained explicitly, including when rendered frames agree. For typed guard stack traces only the worktree absolute path prefix is normalized. Raw ledgers and marks stay intact. No detector input.','summary':stats,'cases':out},indent=2)+'\n')
print(stats)
for row in out:
 if not row['allIdentity']:
  print(row['id'],[(k,len(q['changedPixelOrPngSequence']),q['changedPixelOrPngSequence'][:2],q['changedPixelOrPngSequence'][-2:]) for k,q in row['sides'].items()])
