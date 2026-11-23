"""Verify presentation artifacts independently of the Node/FFmpeg compositor."""
import hashlib
import json
import pathlib
import subprocess
import sys
import zipfile

from PIL import Image

root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()

def require(condition, message):
    if not condition:
        raise AssertionError(message)

require(len(manifest['originals']) == 14, 'expected fourteen original native pictures')
require(len(manifest['posters']) == 4, 'expected three product comparisons and one diagnostic poster')
require(sum(p['kind'] == 'product-repair' for p in manifest['posters']) == 3, 'product/control poster labels')
require(len(manifest['crops']) == 10, 'expected ten declared native crops')
require(len(manifest['clips']) == 3, 'expected three continuous clips')
expected = {item['file'] for item in manifest['outputs']}
actual = {'media/' + p.name for p in (root / 'media').iterdir() if p.is_file()}
require(actual == expected, 'media inventory differs from manifest')
require(len(expected) == 34, 'unexpected media inventory')
for item in manifest['outputs']:
    data = (root / item['file']).read_bytes()
    require(len(data) == item['bytes'] and sha(data) == item['sha256'], 'output bytes: ' + item['file'])
require(sum(i['bytes'] for i in manifest['outputs']) < 16 * 1024 * 1024, 'presentation media exceeds 16 MiB')
for item in manifest['originals']:
    path = root / item['file']
    require(sha(path.read_bytes()) == item['pngSha256'], 'original file hash: ' + item['file'])
    with Image.open(path) as image:
        require(image.size == (800, 450), 'native size: ' + item['file'])
        require(sha(image.convert('RGBA').tobytes()) == item['nativePixelsSha256'], 'native RGBA: ' + item['file'])
for item in manifest['posters']:
    with Image.open(root / item['file']) as image:
        require(image.size == (1600, 502), 'poster size')
        for source, (x, y, w, h) in zip(item['inputs'], item['imageRegions']):
            with Image.open(root / source) as original:
                require(image.crop((x, y, x+w, y+h)).convert('RGBA').tobytes() == original.convert('RGBA').tobytes(),
                        'poster repainted a native panel: ' + item['file'])
for item in manifest['crops']:
    x, y, w, h = item['region']
    with Image.open(root / item['input']) as original, Image.open(root / item['file']) as crop:
        expected_pixels = original.convert('RGBA').crop((x, y, x+w, y+h)).resize((2*w, 2*h), Image.Resampling.NEAREST)
        require(crop.convert('RGBA').tobytes() == expected_pixels.tobytes(), 'crop pixels: ' + item['file'])
for clip in manifest['clips']:
    require(clip['frameCount'] == {'grant':135, 'words':41, 'domain-control':85}[clip['id']], 'documented clip length differs')
    require(len(clip['inputs']) == 2 and all(len(i['frames']) == clip['frameCount'] for i in clip['inputs']), 'clip frame inventory')
    left, right = [i['frames'] for i in clip['inputs']]
    require([f['frame'] for f in left] == [f['frame'] for f in right], 'unmatched native offsets')
    for frames in [left, right]:
        require(all(b['absolute'] == a['absolute'] + 1 for a, b in zip(frames, frames[1:])), 'omitted middle callback')
    result = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', str(root / clip['mp4'])]))
    stream = result['streams'][0]
    require(stream['r_frame_rate'] == '30/1' and int(stream['nb_read_frames']) == clip['frameCount'], 'MP4 retimed or lost frames')
    require((stream['width'], stream['height']) == (1600, 502), 'MP4 canvas')
    require(abs(float(result['format']['duration']) - clip['playbackSeconds']) < .001, 'MP4 duration')
    with Image.open(root / clip['gif']) as gif:
        duration = 0
        for frame in range(gif.n_frames):
            gif.seek(frame)
            duration += gif.info.get('duration', 0)
        require(abs(duration/1000 - clip['playbackSeconds']) < .05, 'GIF duration drift')

archive = root / 'offline-gallery.zip'
if archive.exists():
    with zipfile.ZipFile(archive) as z:
        members = z.namelist()
        required = {'index.html', 'manifest.json'} | expected
        require(len(members) == len(set(members)) and set(members) == required, 'offline archive inventory')
        for name in members:
            require(z.read(name) == (root / name).read_bytes(), 'offline archive changed bytes: ' + name)
print('Verified 14 native RGBA images, 4 unchanged poster pairs, 10 exact crops, 3 real-frame clips and media/bundle inventory.')
