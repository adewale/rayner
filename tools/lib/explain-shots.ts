import {textContextOf} from '../../src/text-context.ts';
import { writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { Scene, Text } from '../../src/index.ts';
import type { Step } from '../../src/index.ts';
import { NullSink, renderFrame, toSvgString } from '../../src/output.ts';
import { SnapshotSink } from '../../src/svg.ts';
import { traceRun } from '../../src/trace.ts';
import { rasterize, band } from './explain-raster.ts';
import { defaultScenario } from './explain-project.ts';
import { stepWords } from '../../explain/trace.ts';
import { paperOf } from '../../explain/stage.ts';
import { isHex } from '../../src/color.ts';
import type { Project } from './explain-project.ts';
import { CARD } from './explain-share.ts';
import { useProjectLettering } from './explain-lettering.ts';
import { palettePng } from './explain-palette.ts';
import { withSceneLettering } from '../../src/lettering-outlines.ts';

/**
 * Each step's resting picture as `draw` makes it from the scene, every one from one run of `Source`
 * (see AtRest in src/trace.ts), keyed by step; only the steps in `only`, when given.
 */
export async function restingPictures<T>(Source: Project['Scene'], draw: (scene: Scene, step: Step) => T, only?: ReadonlySet<string>): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  await traceRun(Source, {}, (scene, step) => {
    if (!only || only.has(step.path)) out.set(step.path, draw(scene, step));
  });
  return out;
}

/**
 * A scene's picture as an SVG for a PNG, `width` pixels wide. Culled: resvg 2.6.2 aborts on a
 * fading element the camera has left outside the view, which a zoomed camera leaves often.
 */
const stillSvg = (scene: Scene, width: number) => toSvgString(scene, { width, cull: true });

/** Each step's resting picture as PNG, `width` pixels wide, from one run (see restingPictures). */
export async function restingPngs(Source: Project['Scene'], width: number, only?: ReadonlySet<string>): Promise<Map<string, Buffer>> {
  const svgs = await restingPictures(Source, (scene) => stillSvg(scene, width), only);
  const out = new Map<string, Buffer>();
  for (const [step, svg] of svgs) out.set(step, (await rasterize(svg)).asPng());
  return out;
}

/** The scene drawn for a link-preview picture: its SVG, CARD.inner pixels wide, and the stage's paper colour (explain/stage.ts). */
const cardDrawing = (scene: Scene) => ({
  svg: toSvgString(scene, { width: CARD.inner, cull: true, background: CARD.background }),
  paper: paperOf(scene),
});

/** The latest frame drawn as a card's picture (cardDrawing). */
class CardSink extends SnapshotSink {
  paper: string | undefined;
  override async frame(scene: Scene): Promise<void> {
    ({ svg: this.svg, paper: this.paper } = cardDrawing(scene));
  }
}

/**
 * A step's link-preview picture (tools/lib/explain-share.ts) as drawn: the 16:9 still,
 * CARD.inner pixels wide, centred on a CARD.width × CARD.height (2:1) canvas of the stage's paper
 * colour (or CARD.background for a scene with no stage). X shows a summary_large_image card at
 * 2:1, and Facebook and LinkedIn at 1.91:1; a 16:9 picture cut to 2:1 would lose 30 px top and
 * bottom, where many steps have labels, and cutting the side bands loses nothing.
 */
export async function cardPicture(Source: Project['Scene'], frame: number) {
  const sink = new CardSink();
  await renderFrame(Source, frame, sink);
  return cardRaster(sink);
}

/** A card's picture (cardDrawing) centred on its canvas, rasterized. */
function cardRaster(drawn: { svg: string; paper: string | undefined }) {
  const x = (CARD.width - CARD.inner) / 2,
    fill = isHex(drawn.paper, { alpha: true }) ? drawn.paper : CARD.background,
    inner = drawn.svg.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /, `<svg x="${x}" `);
  if (inner === drawn.svg) throw new Error('cardPicture: unexpected SVG root');
  return rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}"><rect width="${CARD.width}" height="${CARD.height}" fill="${fill}"/>${inner}</svg>`,
  );
}

/**
 * The link-preview picture as a palette PNG (tools/lib/explain-palette.ts): about a third of the
 * bytes of a full-colour PNG, each pixel within a few levels of the render.
 */
export async function cardPng(Source: Project['Scene'], frame: number): Promise<Buffer> {
  const picture = await cardPicture(Source, frame);
  return palettePng(picture.pixels, picture.width, picture.height);
}

/** Each step's link-preview picture as a palette PNG (cardPng), every one from one run (see restingPictures). */
export async function restingCardPngs(Source: Project['Scene'], only?: ReadonlySet<string>): Promise<Map<string, Buffer>> {
  const drawn = await restingPictures(Source, cardDrawing, only);
  const out = new Map<string, Buffer>();
  for (const [step, d] of drawn) {
    const picture = await cardRaster(d);
    out.set(step, palettePng(picture.pixels, picture.width, picture.height));
  }
  return out;
}

export async function contactSheet(
  project: Project,
  out: string,
  v: Project['scenarios'][number] = defaultScenario(project),
): Promise<string> {
  await useProjectLettering(project);
  const
    steps = v.trace.steps,
    cols = 2,
    w = 640,
    h = 400,
    rows = Math.ceil(steps.length / cols);
  const tiles = [];
  // Every step's picture from one run of the scene.
  const pngs = await restingPngs(v.Scene, w);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!,
      png = pngs.get(step.step)!;
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

