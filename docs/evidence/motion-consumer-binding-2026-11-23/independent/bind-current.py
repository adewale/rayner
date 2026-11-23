from pathlib import Path
from os.path import relpath
from collections import Counter
import json,hashlib,copy,sys
p=Path(__file__).resolve().parent;repo=p.parents[2];prior=Path('/workspace/rayner/out/remaining-fixes-2026-11-22/astra-attempt-2')
rev=sys.argv[1];run='root-causes-'+rev[:8];capdir=repo/('out/root-causes-review-'+rev[:8]);native=repo/('out/root-causes-native-'+rev[:8])
read=lambda f:json.loads(f.read_text());h=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
def ref(f):return {'path':relpath(f,p),'sha256':h(f)}
def write(name,data):f=p/name;f.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n');return ref(f)
old=read(prior/'review.json');capture=read(capdir/'capture.json');line=read(p/('route-lineage-'+rev[:8]+'.json'));knock=read(p/('native-knockout-'+rev[:8]+'.json'));targets=read(p/'registry.json');opened=read(p/'native-opened.json')
assert h(prior/'review.json')=='9c7d347d03c9545f14a28a416ddc75557dcb05927bcbd0ce5fffcac5d5917db5'
assert rev==capture['sourceRevision']==line['current']['revision'] and run==capture['run'] and line['summary']['entireTwoSidedRoutesIdentical']==59
sig={'sourceRevision':rev,'run':run,'reviewer':old['reviewer']}
origin=ref(prior/'review.json');lin=ref(p/('route-lineage-'+rev[:8]+'.json'));cap=ref(capdir/'capture.json');nativeOwnership=ref(p/('native-knockout-'+rev[:8]+'.json'))
cases=[];obs=[];visual=[];pros=[];perRow={}
openedByPath={str((p/x['path']).resolve()) for x in opened['originals']}
for prev,c,identity in zip(old['cases'],capture['cases'],line['cases']):
 id=c['id'];assert id==prev['id']==identity['id'] and identity['allIdentity']
 ledger={side:read(native/id/side/'receipt.json') for side in ['baseline','variant']};sideRef={s:ref(native/id/s/'receipt.json') for s in ledger}
 r={k:copy.deepcopy(prev[k]) for k in ['id','disposition','claimRelation','note','sourceClaim','clause','prevention','editorial'] if k in prev}
 r.update({'route':c['route'],'settings':ledger['variant']['provenance']['settings'],'caseReceipt':ref(native/id/'case.json'),'baselineReceipt':sideRef['baseline'],'variantReceipt':sideRef['variant'],'lineage':{'priorIndependentReview':origin,'fullRouteVerification':lin,'method':'Exact full two-sided primary-route pixel/clock/event/model/guard and original PNG identity, with native visual meaning carried forward. Current source semantic ownership is measured independently.'}})
 select=[(f['side'],f['sequence'],f['png']['sha256'],'previously inspected original or contact cell, independently verified as identical') for f in prev['nativeFrameBindings']]
 select+= [(x['side'],x['sequence'],x['sha256'],'current original PNG individually opened') for x in opened['originals'] if x['id']==id]
 frames=[]
 for s,seq,sha,how in select:
  if any(v['side']==s and v['sequence']==seq for v in frames):continue
  f=ledger[s]['frames'][seq];file=native/id/s/(f['asset']+'.png');png=ref(file);assert png['sha256']==sha and sha in c['nativeAssets']
  frames.append({'side':s,'sequence':seq,'frame':f['frame'],'absolute':f['absolute'],'step':f['step'],'phase':f['phase'],'asset':f['asset'],'wholeStagePixelsSha256':f['pixels'],'receiptSha256':sideRef[s]['sha256'],'inspection':'current original PNG individually opened' if str(file.resolve()) in openedByPath else how,'png':png})
 r['nativeFrameBindings']=frames;r['nativeWitnesses']=list({f['png']['path']:f['png'] for f in frames}.values())
 a,b=[ledger[s]['frames'] for s in ['baseline','variant']];n=sum(f['pixels']==g['pixels'] for f,g in zip(a,b));r['pairing']={'frames':{'baseline':len(a),'variant':len(b)},'matchedSequenceCount':min(len(a),len(b)),'identicalNativePixelHashesAtMatchedSequence':n,'authoredSeconds':{s:ledger[s]['mark']['duration'] for s in ledger}}
 if r['disposition']=='non-reproducing':
  assert len(a)==len(b)==n;r['nonReproduction']={'basis':'full-route-pixel-identity'}
 if r['disposition']=='typed-prevention':assert len(b)==1 and r['prevention']['name']==ledger['variant']['mark']['guard']['name'] and r['prevention']['message']==ledger['variant']['mark']['guard']['message']
 if id=='sign-in-poll-over-card':
  r['note']='The outgoing poll crosses the final m of the face-up card example.com at frames 24–26. Exact current ownership is the card:domain child of card. Matched baseline native contributions stay clear. Frame 30 instead touches the separate Example Company line and leaves domain pixels intact. Both pre-existing generic and separately preregistered authored representations concern the same physical relation.'
  r['clause']['observed']='The outgoing poll cuts the final m of the legitimate card’s printed example.com. At frame 26 removing this poll restores 49 of its 179 native pixels. The matching fixed frame and the later Company-only frame 30 each lose zero domain pixels.'
  r['currentNativeOwnership']=nativeOwnership
 cases.append(r);perRow[id]=(r,frames);visual.append({'id':id,'priorCaseReview':origin,'verification':lin,'method':'Full route identity and prior original observations. Current individual opens are explicitly marked.','bindings':frames})
 if r['disposition']=='observed':pros.append({'id':id,'version':id+'@native-review-'+rev[:8]+'.1','relationToReconstruction':r['claimRelation'],'scenario':r['settings'],**r['clause'],'frameBindings':[{'side':f['side'],'sequence':f['sequence'],'pngSha256':f['png']['sha256']} for f in frames],'detectorRepresentation':'Only independently preregistered mappings may be scored. No implied diagnosis for this remaining inventory.'})
for registration in targets:
 t=registration['target'];id=t['id'];r,frames=perRow[id];seq={'poppy-key-over-station-name':37,'refusals-key-over-lane-name':38,'sign-in-poll-over-card':26,'browser-forge-across-stage':36}[id];w=[f for f in frames if f['sequence']==seq];assert {f['side'] for f in w}=={'baseline','variant'}
 assert all(r['clause'][k]==t[k] for k in ['actor','victim','literal','event','phase'])
 priorApproved=next(o for o in old['observations'] if o['caseId']==id)
 if t['version']==priorApproved['version']:assert registration['sha256']==priorApproved['targetSha256']
 data=[x for x in knock if x['id']==id and x['seq']==seq and x['literal']==t['literal']];assert len(data)==2
 neg=next(x for x in data if x['side']=='baseline');pos=next(x for x in data if x['side']=='variant')
 assert neg['totalLost']==0 and pos['totalLost']>0
 for x in [neg,pos]:assert x['pngSha256']==next(f for f in w if f['side']==x['side'])['png']['sha256']
 o={'version':t['version'],'targetSha256':registration['sha256'],'actor':t['actor'],'victim':t['victim'],'literal':t['literal'],'event':t['event'],'phase':t['phase'],'caseId':id,'route':r['route'],'scenario':r['settings'],'note':f'Independently confirmed on the current source at native {r["route"]["step"]}/{t["event"]} frame {seq}. The fixed control loses zero named glyph pixels. The variant loses {pos["totalLost"]} pixels to {t["actor"]}. The original retained route and sampled picture bytes match the previous independent review.','nativeWitnesses':[f['png'] for f in w],'witnessFrames':[{'side':f['side'],'step':f['step'],'phase':f['phase'],'frame':f['frame'],'sequence':f['sequence'],'absolute':f['absolute'],'asset':f['asset'],'pngSha256':f['png']['sha256'],'receiptSha256':f['receiptSha256']} for f in w],'nativeProof':nativeOwnership}
 if id=='sign-in-poll-over-card':o['currentOwnership']={'physicalVictim':'card','exactKey':'card:domain',**pos['parentOwnership']};o['note']+=' Domain and Company are distinct Text siblings on this face-up card. The named domain child contains only the eleven example.com glyphs. This version is a representation of the same observed outgoing-poll relation.'
 obs.append(o)
assert len(cases)==59 and len(obs)==5 and len(set(o['caseId'] for o in obs))==4 and len(pros)==45
review=write('review.json',{'schema':1,**sig,'capture':cap,'priorIndependentReview':origin,'verifiedRouteLineage':lin,'policy':'All 59 source-bound primary route judgments and five representation ratifications (four distinct observed relations) saved before consulting any final-source worker output. Prior physical-case hypotheses and 815 measurement are known. All 59 route identities reverified; the new exact named domain ownership is independently checked on this source.','scope':'Primary routes only. Reader grants and physical device/return camera checks are supplementary independent histories, and are reported separately.','cases':cases,'observations':obs})
visualRef=write('visual-inspection.json',{**sig,'priorCaseInventory':ref(prior/'visual-inspection.json'),'currentCaseImagesIndividuallyViewed':opened['originals'],'supplementaryCurrentEvidence':'See camera and live-card inspection inventories in the report; the primary packet contains no device return path.','automation':lin,'currentNonvisualOwnership':nativeOwnership,'cases':visual})
targetRef=write('independent-clause-targets.json',{**sig,'review':review,'proposals':pros,'scope':'45 visible clauses, four uniquely preregistered relations, five version-specific representations, 41 additional clauses without a preregistered matching rule.'})
def make(sub):return {'schema':1,**sig,'review':review,'capture':cap,'observations':sub,'measurementStatus':'pending separate worker measurement; independent approval saved beforehand'}
rat=write('ratifications-before-measurement.json',make(obs));v3=write('v3-ratifications-before-measurement.json',make(obs[:4]));domain=write('domain-ratification-before-measurement.json',make(obs[4:]))
receipt=write('review-receipt.json',{'schema':1,**sig,'capture':cap,'review':review,'ratifications':rat,'v3Ratifications':v3,'domainClearanceRatification':domain,'visualInspection':visualRef,'independentClauses':targetRef,'routeLineage':lin,'nativeOwnership':nativeOwnership,'cases':59,'counts':dict(Counter(x['disposition'] for x in cases))|{'unresolved':0},'positiveClauses':45,'distinctRatifiedRelations':4,'separatelyVersionedRepresentations':5,'measurement':'pending'})
print('review',review,'ratifications',rat,'domain',domain,'receipt',receipt)
