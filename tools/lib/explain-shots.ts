import {textContextOf} from '../../src/text-context.ts';
import { writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { Scene, Text, NullSink, SnapshotSink, renderAt } from '../../src/index.ts';
import { rasterize, band } from './explain-raster.ts';
import { defaultVariant } from './explain-project.ts';
import { restingTime, stepWords } from '../../explain/trace.ts';
import type { Project } from './explain-project.ts';
import { CARD } from './explain-share.ts';
import { useProjectLettering } from './explain-lettering.ts';
import { palettePng } from './explain-palette.ts';
import { withSceneLettering } from '../../src/lettering-outlines.ts';

/**
 * A scene's picture at `time` as PNG, `width` pixels wide. Culled: resvg 2.6.2 aborts on a
 * fading element the camera has left outside the view, which a zoomed camera leaves often.
 */
export async function stillPng(Source: Project['Scene'], time: number, width: number): Promise<Buffer> {
  const sink = new SnapshotSink({ width, cull: true });
  await renderAt(Source, time, sink);
  return (await rasterize(sink.svg)).asPng();
}

/** The latest frame, and the stage's paper colour (explain/stage.ts) in it. */
class CardSink extends SnapshotSink {
  paper: string | undefined;
  override async frame(scene: Scene): Promise<void> {
    await super.frame(scene);
    this.paper = scene.mobjects.find((m) => m.key === '__paper')?.style.fill;
  }
}

/**
 * A step's link-preview picture (tools/lib/explain-share.ts) as drawn: the 16:9 still,
 * CARD.inner pixels wide, centred on a CARD.width × CARD.height (2:1) canvas of the stage's paper
 * colour (or CARD.background for a scene with no stage). X shows a summary_large_image card at
 * 2:1, and Facebook and LinkedIn at 1.91:1; a 16:9 picture cut to 2:1 would lose 30 px top and
 * bottom, where many steps have labels, and cutting the side bands loses nothing.
 */
export async function cardPicture(Source: Project['Scene'], time: number) {
  const sink = new CardSink({ width: CARD.inner, cull: true, background: CARD.background });
  await renderAt(Source, time, sink);
  const x = (CARD.width - CARD.inner) / 2,
    fill = sink.paper && /^#[0-9a-f]{3,8}$/i.test(sink.paper) ? sink.paper : CARD.background,
    inner = sink.svg.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /, `<svg x="${x}" `);
  if (inner === sink.svg) throw new Error('cardPicture: unexpected SVG root');
  return rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}"><rect width="${CARD.width}" height="${CARD.height}" fill="${fill}"/>${inner}</svg>`,
  );
}

/**
 * The link-preview picture as a palette PNG (tools/lib/explain-palette.ts): about a third of the
 * bytes of a full-colour PNG, each pixel within a few levels of the render.
 */
export async function cardPng(Source: Project['Scene'], time: number): Promise<Buffer> {
  const picture = await cardPicture(Source, time);
  return palettePng(picture.pixels, picture.width, picture.height);
}

export async function contactSheet(
  project: Project,
  out: string,
  v: Project['variants'][number] = defaultVariant(project),
): Promise<string> {
  await useProjectLettering(project);
  const
    steps = v.trace.steps,
    cols = 2,
    w = 640,
    h = 400,
    rows = Math.ceil(steps.length / cols);
  const tiles = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!,
      png = await stillPng(v.Scene, restingTime(step, v.trace.fps), w);
    const labelSvg = await withSceneLettering(v.Scene, async () => {
      const labelScene = new Scene(new NullSink()),
        label = new Text(`${i + 1}. ${stepWords(step).title}`, {
          shaping: textContextOf(v.Scene), fontSize: 0.36,
          color: '#eef3fa',
          anchor: 'start',
        });
      if (label.width() > 15.2) label.setWidth(15.2);
      label.moveTo([-7.6, 0], [-1, 0]);
      labelScene.add(label);
      // A 40-pixel band: one scene unit at 640 pixels wide.
      return band(labelScene, w, 1, '#101820');
    });
    tiles.push(
      `<g transform="translate(${(i % cols) * w} ${Math.floor(i / cols) * h})"><image width="${w}" height="360" href="data:image/png;base64,${png.toString('base64')}"/><g transform="translate(0 360)">${labelSvg}</g></g>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * cols}" height="${h * rows}"><rect width="100%" height="100%" fill="#101820"/>${tiles.join('')}</svg>`;
  // The PNG at `out` (given .png when it has no extension), the SVG beside it.
  out = resolve(extname(out) ? out : out + '.png');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(join(dirname(out), basename(out, extname(out)) + '.svg'), svg);
  await writeFile(out, (await rasterize(svg)).asPng());
  return out;
}

