from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
from functools import lru_cache
from hashlib import sha256
from urllib.parse import urlsplit
import json,zipfile
from PIL import Image
import numpy as np
here=Path(__file__).resolve().parent;repo=here.parents[1];guide=repo/'docs/evidence/motion-visual-guide-2026-11-23'
j=lambda p:json.loads(Path(p).read_bytes());h=lambda p:sha256(Path(p).read_bytes()).hexdigest()
m=j(guide/'manifest.json');native=j(here/'native-and-timing.json')
assert native['presentationManifestSha256']==h(guide/'manifest.json')
hist='5bff60e0aa5660c2b944fb59fbfe0b59e703db93';current=m['reviewedRenderingRevision']
base={hist:Path('/workspace/rayner-audit/out/current-audit-2026-11-22'),current:Path('/workspace/rayner-attempt3/out/root-causes-native-39b75450')}
@lru_cache(maxsize=500)
def want(path):
    with Image.open(path) as p:
        # Omit the top two preview rows bordering the header. Each side then contains only native stage samples.
        pad=Image.new('RGB',(800,502),'white');pad.paste(p.convert('RGB'),(0,52))
        return np.asarray(pad.resize((480,302),Image.Resampling.LANCZOS).convert('L'))[34:,:].astype('int16')
rows=[]
for clip in m['clips']:
    pairs=[[base[x['sourceRevision']]/x['sourcePath'] for x in src['frames']] for src in clip['inputs']]
    orientation=Counter();nei=Counter();ma=[];times=[]
    with Image.open(guide/clip['gif']) as im:
        assert im.n_frames==clip['frameCount'] and im.size==(960,302)
        for i in range(im.n_frames):
            im.seek(i);times.append(im.info['duration']);pix=np.asarray(im.convert('RGB').convert('L'))[34:,:].astype('int16')
            for k in [0,1]:
                obs=pix[:,k*480:(k+1)*480];a=want(pairs[k][i]);own=np.abs(obs-a);ma.append(float(own.mean()))
                for key,x,bag in [('other-side',want(pairs[1-k][i]),orientation)]+[('adjacent',want(pairs[k][z]),nei) for z in (i-1,i+1) if 0<=z<im.n_frames]:
                    mask=np.abs(a-x)>=18
                    if mask.sum()<16:bag['too-little-visible-change']+=1;continue
                    bag['expected-closer' if own[mask].sum()<np.abs((obs-x)[mask]).sum() else key+'-closer-or-tied']+=1
    assert max(ma)<3.5 and orientation['other-side-closer-or-tied']==0 and nei['adjacent-closer-or-tied']==0,(clip['id'],max(ma),orientation,nei)
    rows.append({'id':clip['id'],'gifFrames':len(times),'milliseconds':sum(times),'maxPreviewLumaMae':max(ma),'sideComparisons':orientation,'adjacentComparisons':nei})
class Gallery(HTMLParser):
    def __init__(self):
        super().__init__();self.refs=[];self.anchors=set();self.videos=[];self.scripts=[]
    def handle_starttag(self,tag,attr):
        d=dict(attr)
        if 'id'in d:self.anchors.add(d['id'])
        if tag=='video':self.videos.append(d)
        if tag=='script':self.scripts.append(d)
        for k in (['src','poster'] if tag in ['img','video','source','iframe','link','script'] else ['href'] if tag=='a' else []):
            if k in d:self.refs.append((tag,k,d[k]))
zpath=guide/'offline-gallery.zip';parser=Gallery();parser.feed((guide/'index.html').read_text())
with zipfile.ZipFile(zpath) as z:
    names=z.namelist();expected={'index.html','manifest.json'}|{x['file'] for x in m['outputs']}
    assert len(names)==len(set(names)) and set(names)==expected and all(z.read(v)==(guide/v).read_bytes() for v in names)
    local=0;external=[]
    for tag,k,link in parser.refs:
        u=urlsplit(link)
        if u.scheme or u.netloc:assert tag=='a';external.append(link);continue
        if u.path:assert u.path in names,(tag,k,link);local+=1
        else:assert u.fragment in parser.anchors
    assert not parser.scripts and len(parser.videos)==3 and all('controls' in v and 'autoplay' not in v for v in parser.videos)
    assert [x['poster'] for x in parser.videos]==['media/grant-pair.png','media/words-pair.png','media/domain-control-pair.png']
result={'mediaCount':len(expected)-2,'zipMembers':len(names),'zipSha256':h(zpath),'htmlSha256':h(guide/'index.html'),'markdownSha256':h(guide/'README.md'),'localLinkedRefs':local,'externalLinksAreUserNavigatedOnly':external,'allVideoControlsHavePairedPosters':True,'allThreeVideosRequireUserPlayback':True,'gifDecode':rows,'gifMethod':'All GIF frames compared after reducing source panels to the published scale, using luma in the native stage region, separately checking left/right and neighbouring poses on source-distinguishable pixels. Original PNGs provide color/pixel evidence.','browserScope':'Static archive membership, source-call requirements and decoded media independently verified. Interactive browser smoke and real playback handled by parent reviewer. No independent file:// success claimed.'}
(here/'gif-and-offline-readback.json').write_text(json.dumps(result,indent=2)+'\n');print([(r['id'],r['maxPreviewLumaMae'],r['adjacentComparisons']) for r in rows],len(names),flush=True)
