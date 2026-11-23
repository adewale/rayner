from pathlib import Path
from hashlib import sha256
from collections import Counter
import functools,gzip,json,subprocess,zipfile
from PIL import Image
import numpy as np
here=Path(__file__).resolve().parent
repo=here.parents[1];guide=repo/'docs/evidence/motion-visual-guide-2026-11-23'
hist='5bff60e0aa5660c2b944fb59fbfe0b59e703db93'
reviewed='39b75450eeb4ef9082ec22a93be099770365d715'
inter='8151582fc8a4ff2d06d6b4e5607633e0474c0dbf'
base='20fe61ee4afd9fa7be55e9b34501e67674c32bf1'
roots={hist:Path('/workspace/rayner-audit/out/current-audit-2026-11-22'),reviewed:Path('/workspace/rayner-attempt3/out/root-causes-native-39b75450')}
returnRoots={inter:repo/'out/remaining-fixes-2026-11-22/astra-attempt-2/reader-return',reviewed:Path('/workspace/rayner-attempt3/out/remaining-fixes-2026-11-22/astra-attempt-3/reader-return')}
j=lambda p:json.loads(Path(p).read_bytes());h=lambda v:sha256(v).hexdigest();fp=lambda p:h(Path(p).read_bytes())
manifest=j(guide/'manifest.json');verifyOutputs={};assert manifest['reviewedRenderingRevision']==reviewed and manifest['presentationReferenceHead']==base
for rev,root in roots.items():assert j(root/'provenance.json')['revision']==rev
@functools.lru_cache(maxsize=None)
def cap(rev,id,side):
    root=roots[rev];case=root/id/'case.json';f=root/id/side/'receipt.json';d=j(f);a=j(case)
    assert a['revision']==rev and a['id']==id and a['status']=='complete' and a[side]['status']==d['status']=='complete'
    assert d['side']==side and d['height']==450 and d['width']==800 and d['fps']==30 and d['frameCount']==len(d['frames'])==a[side]['frameCount'] and d['route']==a['route']
    return d,fp(case),fp(f)
@functools.lru_cache(maxsize=1200)
def source_data(path):
    with Image.open(path) as im:
        assert im.mode=='RGBA' and im.size==(800,450);pix=np.asarray(im);assert pix[:,:,3].min()==255
        rgba=h(pix.tobytes())
        rgb=pix[:,:,:3].astype('uint16')
        luma=((66*rgb[:,:,0]+129*rgb[:,:,1]+25*rgb[:,:,2]+128)//256+16).astype('uint8')
    return fp(path),rgba,luma
def actual_frame(x):
    rev=x['sourceRevision'];id=x['caseId'];s=x['side'];q=x['sequence'];d,caseHash,sideHash=cap(rev,id,s);f=d['frames'][q]
    assert x['caseReceiptSha256']==caseHash and x['receiptSha256']==sideHash
    assert all(x[k]==f[k] for k in ['sequence','frame','absolute','phase','step'])
    path=roots[rev]/id/s/(f['asset']+'.png');assert x['sourcePath']==str(path.relative_to(roots[rev]))
    png,rgba,lum=source_data(path);assert png==x['pngSha256'] and rgba==x['nativePixelsSha256']==f['pixels'];return path,lum
originals={}
for x in manifest['originals']:
    dest=guide/x['file'];rev=x['sourceRevision']
    if 'reader' in x:
        fol=returnRoots[rev];r=j(fol/'return-reader-scan.json');assert r['sourceRevision']==rev and fp(fol/'return-reader-scan.json')==x['receiptSha256'];route=x['reader']
        matches=[z for z in r['histories'] if all(z[k]==route[k] for k in ['event','flow','replacement','pending','log','sourceState'])];assert len(matches)==1
        assert route=={'flow':'device','replacement':False,'pending':False,'event':'disconnect','log':['ask','approve-read','collect','disconnect'],'sourceState':'rest'}
        photo=next(a for a in matches[0]['photos'] if a['seq']==x['sequence']);assert photo['seq']==30 and photo['pngSha256']==x['pngSha256'] and photo['nativePixelsSha256']==x['nativePixelsSha256']
        source=fol/'device-first-disconnect-30.png';sb,pix,_=source_data(source);assert sb==x['pngSha256'] and pix==x['nativePixelsSha256']
    else: source,_=actual_frame(x)
    assert source.read_bytes()==dest.read_bytes()
    originals[x['file']]={'source':str(source),'sourceRevision':rev,'pngSha256':fp(dest),'nativeRgbaSha256':x['nativePixelsSha256'],'sequence':x['sequence']}
assert len(originals)==14
pairs={p['file']:p for p in manifest['posters']}
for p in pairs.values():
    with Image.open(guide/p['file']) as im:
        assert im.size==(1600,502);assert p['imageRegions']==[[0,52,800,450],[800,52,800,450]]
        for i,infile in enumerate(p['inputs']):
            with Image.open(guide/infile) as src:assert im.crop((800*i,52,800*i+800,502)).convert('RGBA').tobytes()==src.convert('RGBA').tobytes()
assert pairs['media/grant-pair.png']['inputs']==['media/grant-before.png','media/grant-reviewed.png']
assert pairs['media/words-pair.png']['inputs']==['media/words-before.png','media/words-reviewed.png']
assert pairs['media/return-pair.png']['inputs']==['media/return-before.png','media/return-reviewed.png']
assert pairs['media/domain-control-pair.png']['inputs']==['media/domain-injected.png','media/domain-clear.png']
for crop in manifest['crops']:
    with Image.open(guide/crop['input']) as src,Image.open(guide/crop['file']) as des:
        x,y,w,h0=crop['region'];assert des.convert('RGBA').tobytes()==src.convert('RGBA').crop((x,y,x+w,y+h0)).resize((w*2,h0*2),Image.Resampling.NEAREST).tobytes()
assert len(manifest['crops'])==10
roles={'grant':[(hist,'sign-in-collect-people-slide','baseline'),(reviewed,'sign-in-collect-people-slide','baseline')],'words':[(hist,'conversations-words-dissolve','baseline'),(reviewed,'conversations-words-dissolve','baseline')],'domain-control':[(reviewed,'sign-in-poll-over-card','variant'),(reviewed,'sign-in-poll-over-card','baseline')]}
reported=[]
for clip in manifest['clips']:
    id=clip['id'];n={'grant':135,'words':41,'domain-control':85}[id];assert clip['frameCount']==n and clip['fps']==30
    lim=(1600,450);pairs=[];starts=[];sameBefore=[];histor=[];marks=[]
    for k,inp in enumerate(clip['inputs']):
        rev,case,side=roles[id][k];d,*_=cap(rev,case,side);fs=inp['frames'];assert len(fs)==n
        actual=d['frames'];selected=[x for x in actual if x['step']=='owner'][:41] if id=='words' else actual;assert len(selected)==n
        assert inp['route']==d['route'] and inp['eventMark']==d['mark'] and inp['sourceModel']==d['mark']['before']
        assert all(x['sourceRevision']==rev and x['caseId']==case and x['side']==side for x in fs)
        assert [x['sequence'] for x in fs]==[x['sequence'] for x in selected] and all(b['absolute']==a['absolute']+1 for a,b in zip(fs,fs[1:]))
        pp=[actual_frame(x) for x in fs];pairs.append(pp);starts.append([fs[0]['absolute'],fs[-1]['absolute']]);sameBefore.append(d['mark']['before']);histor.append(d['mark']['history']);marks.append(d['mark']['duration'])
    assert sameBefore[0]==sameBefore[1] and histor[0]==histor[1]
    if id=='grant':assert histor[0]==['ask','approve-read','trick'] and sameBefore[0]['flow']=='direct' and marks==[4.45,4.45]
    if id=='domain-control':assert sameBefore[0]['flow']=='device' and sameBefore[0]['sign']['approved'] is None
    if id=='words':
        for ps in pairs:
            assert len(set(p for p,z in ps[-18:]))==1
    mp4=guide/clip['mp4'];gifp=guide/clip['gif'];pr=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=r_frame_rate,width,height,pix_fmt:frame=best_effort_timestamp_time:format=duration','-of','json',str(mp4)]))
    assert len(pr['frames'])==n and pr['streams'][0]['r_frame_rate']=='30/1' and (pr['streams'][0]['width'],pr['streams'][0]['height'])==(1600,502)
    assert all(abs(float(q['best_effort_timestamp_time'])-i/30)<1e-5 for i,q in enumerate(pr['frames']))
    with Image.open(gifp) as gif:
        times=[]; idx=0
        for idx in range(gif.n_frames):
            gif.seek(idx);times.append(gif.info['duration'])
        assert abs(sum(times)/1000-n/30)<.05 and gif.size==(960,302)
    cmd=['ffmpeg','-v','error','-threads','1','-i',str(mp4),'-vf','crop=1600:450:0:52,extractplanes=y','-f','rawvideo','-pix_fmt','gray','pipe:1']
    proc=subprocess.Popen(cmd,stdout=subprocess.PIPE); ma=[];sq=[];comparison=Counter();swapped=Counter()
    for idx in range(n):
        buf=proc.stdout.read(lim[0]*lim[1]);assert len(buf)==lim[0]*lim[1];decoded=np.frombuffer(buf,dtype='uint8').reshape(lim[::-1])
        for k in [0,1]:
            obs=decoded[:,k*800:(k+1)*800].astype('int16');want=pairs[k][idx][1].astype('int16');err=obs-want
            ma.append(float(np.abs(err).mean()));sq.append(float((err.astype('int32')**2).mean()))
            for otherIdx in [idx-1,idx+1]:
                if 0<=otherIdx<n:
                    other=pairs[k][otherIdx][1].astype('int16');mask=np.abs(want-other)>=12
                    if int(mask.sum())>=12:
                        correct=int(np.abs(err[mask]).sum());adjacent=int(np.abs((obs-other)[mask]).sum());comparison['expected-closer' if correct<adjacent else 'adjacent-closer-or-tied']+=1
                    else:comparison['no-sufficient-native-change']+=1
            other=pairs[1-k][idx][1].astype('int16');mask=np.abs(want-other)>=12
            if int(mask.sum())>=12:swapped['expected-closer' if int(np.abs(err[mask]).sum())<int(np.abs((obs-other)[mask]).sum()) else 'other-side-closer-or-tied']+=1
            else:swapped['same-or-below-native-change-cutoff']+=1
    assert not proc.stdout.read(1) and proc.wait()==0
    assert max(ma)<2 and max(sq)<35 and comparison['adjacent-closer-or-tied']==0 and swapped['other-side-closer-or-tied']==0,(id,max(ma),max(sq),comparison,swapped)
    reported.append({'id':id,'sources':roles[id],'frameCount':n,'panelFramesChecked':2*n,'absoluteFrameRangePerSource':starts,'sameNativeStartingModelAndHistory':True,'nativeMarkedDuration':marks,'videoDuration':float(pr['format']['duration']),'rate':pr['streams'][0]['r_frame_rate'],'everyDisplayedFrameTimestampOnGrid':True,'gifDecodedFrames':len(times),'gifCentisecondDelaysInMilliseconds':dict(Counter(times)),'gifTotalMilliseconds':sum(times),'decodedVideoAgainstNativePanels':{'metric':'luma MAE on both untouched 800x450 panels at every frame; separately compare against adjacent input and opposite panel on native pixels with absolute Y difference >=12 where at least 12 pixels distinguish them. Repeated/below-threshold frames retain exact manifest input sequence and PTS checks.','maximumAcrossFramesAndSidesMeanAbsoluteY':max(ma),'maximumAcrossFramesAndSidesMeanSquaredY':max(sq),'neighbourComparisons':dict(comparison),'sideOrientationComparisons':dict(swapped)}})
    print(id,comparison,swapped,max(ma),flush=True)
outputs={x['file'] for x in manifest['outputs']};assert outputs==set(p.relative_to(guide).as_posix() for p in (guide/'media').iterdir() if p.is_file())
for r in manifest['outputs']:assert fp(guide/r['file'])==r['sha256']
result={'referenceCode':base,'reviewedRendering':reviewed,'presentationManifestSha256':fp(guide/'manifest.json'),'verifiedNativeCopies':originals,'posters':len(manifest['posters']),'crops':len(manifest['crops']),'mediaOutputs':len(outputs),'clips':reported,'interpretation':'Every disclosed native input checked against actual case and side receipts on the requested source. Encoded visual comparison verifies luma fidelity, side orientation, and order where adjacent content differs; original PNGs retain pixel-proof role. GIF quantization and elapsed time were checked separately.'}
(here/'native-and-timing.json').write_text(json.dumps(result,indent=2)+'\n')
