"""Package only the gallery page, manifest and declared media, with stable ZIP metadata."""
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
names = ['index.html', 'manifest.json'] + sorted(item['file'] for item in manifest['outputs'])
assert len(names) == len(set(names))
with zipfile.ZipFile(root / 'offline-gallery.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in names:
        path = root / name
        assert path.resolve().is_relative_to(root) and path.is_file()
        info = zipfile.ZipInfo(name, date_time=(2026, 11, 23, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
print(f'Offline gallery: {len(names)} files, {(root / "offline-gallery.zip").stat().st_size} bytes')
