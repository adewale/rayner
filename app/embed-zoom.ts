/**
 * Zoom and pan for the stage. A 16:9 stage on a phone shows a 14 px label at
 * about 4 px, so the reader enlarges the vector drawing itself: buttons and
 * keys zoom about the centre, pinch and Ctrl-scroll about the fingers or
 * pointer, double-click about the point clicked. Once zoomed, a drag pans, and
 * so does a click or tap, which centres the point under it (no drag needed).
 */
import { DomSink } from '../src/index.ts';
import type { ElementRecord } from '../src/index.ts';
/** A zoom: scale `k` about the stage's top-left corner, then a pan of (x, y) stage pixels. */
export interface Zoom {
  k: number;
  x: number;
  y: number;
}
export const ZOOM_MAX = 6;
export const IDENTITY: Readonly<Zoom> = Object.freeze({ k: 1, x: 0, y: 0 });

/** Clamp so the drawing always covers a `w`×`h` stage: 1 ≤ k ≤ max, and no gap at any edge. */
export function clampZoom(z: Zoom, w: number, h: number, max = ZOOM_MAX): Zoom {
  // Math.min/max pass NaN through; a NaN component falls back to the identity's.
  const k = Number.isNaN(z.k) ? 1 : Math.min(max, Math.max(1, z.k));
  const pan = (p: number, side: number) => {
    // The left-most pan that still covers is side - side*k. When side*k is large that
    // subtraction rounds, sometimes leaving a sliver uncovered, so step right until it covers.
    const span = side * k;
    let lowest = side - span;
    for (let i = 0; i < 4 && lowest + span < side; i++) lowest += Math.abs(lowest) * 2 * Number.EPSILON;
    return Number.isNaN(p) ? 0 : Math.min(0, Math.max(lowest, p));
  };
  return { k, x: pan(z.x, w), y: pan(z.y, h) };
}

/** Zoom by `factor`, keeping the stage point (px, py) still, then clamp. */
export function zoomAt(z: Zoom, factor: number, px: number, py: number, w: number, h: number, max = ZOOM_MAX): Zoom {
  const k = Math.min(max, Math.max(1, z.k * factor)),
    r = k / z.k;
  // No scale change (a factor of 1, or more zoom at a limit) moves nothing; without
  // this, px - (px - x) rounds and the drawing creeps. A NaN factor or a point at
  // infinity has no meaning, so it changes nothing either.
  if (k === z.k || Number.isNaN(factor) || !Number.isFinite(px) || !Number.isFinite(py)) return clampZoom(z, w, h, max);
  return clampZoom({ k, x: px - (px - z.x) * r, y: py - (py - z.y) * r }, w, h, max);
}

/** Move the drawing by (dx, dy) stage pixels, then clamp. */
export function panBy(z: Zoom, dx: number, dy: number, w: number, h: number, max = ZOOM_MAX): Zoom {
  // A NaN delta has no direction: that axis stays put.
  return clampZoom({ k: z.k, x: Number.isNaN(dx) ? z.x : z.x + dx, y: Number.isNaN(dy) ? z.y : z.y + dy }, w, h, max);
}

// ---------------------------------------------------------------------------
// The reader's zoom over the author's camera. The player paints a zoom the way the
// author's camera (`scene.frame`) zooms: by narrowing the SVG viewBox, never by scaling
// the element. Each stage SVG carries its author's frame in `data-camera` (the camera's
// viewBox, as the sink last wrote it, or the built poster's own); the reader's zoom picks
// part of that view. So the two compose: a camera glide still plays under a reader zoom,
// a close-up zooms further into whatever the author framed, and Whole picture is the author's frame.
// On screen, a label is world size × camera zoom × reader zoom × px per view unit.

/** The camera's home viewBox: the whole 16 × 9 stage, in the sinks' user units. */
export const HOME_VIEW = '-8000 -4500 16000 9000';
type Rect = [number, number, number, number];
const rect = (v: string) => v.trim().split(/[\s,]+/).map(Number) as Rect;
/** How a `w`×`h` stage draws an `aw`×`ah` view at 1× (the SVG letterboxes): px per unit and the offset of its top-left corner. */
function fitted(aw: number, ah: number, w: number, h: number) {
  const s = Math.min(w / aw, h / ah);
  return { s, ox: (w - aw * s) / 2, oy: (h - ah * s) / 2 };
}
/**
 * The viewBox a reader sees on a `w`×`h` stage: the author's viewBox narrowed by `z`,
 * whose pan is in stage px as for a CSS transform about the stage's top-left. At the
 * identity it is the author's, exactly.
 */
export function readerViewBox(author: string, z: Zoom, w: number, h: number): string {
  if ((z.k === 1 && z.x === 0 && z.y === 0) || !(w > 0) || !(h > 0)) return author;
  const [ax, ay, aw, ah] = rect(author);
  const { s, ox, oy } = fitted(aw, ah, w, h);
  const box = [ax + (-z.x / z.k - ox) / s, ay + (-z.y / z.k - oy) / s, w / (z.k * s), h / (z.k * s)];
  // A thousandth of a user unit (a millionth of a scene unit): exact enough to read the zoom back.
  return box.map((n) => +n.toFixed(3)).join(' ');
}
/** The author's frame of a stage SVG: what its camera shows, recorded on first sight for a poster. */
export function cameraOf(svg: SVGSVGElement): string {
  let author = svg.getAttribute('data-camera');
  if (author == null) svg.setAttribute('data-camera', (author = svg.getAttribute('viewBox') ?? HOME_VIEW));
  return author;
}
/** Paints a zoom on the stage's picture; `glide` eases a discrete step. */
export type Painter = (z: Zoom, glide: boolean) => void;
/** A glide's length, as the CSS transition it replaces, and its ease-out. */
const GLIDE_MS = 220;
const easeOut = (a: number) => 1 - (1 - a) ** 3;
/**
 * The reader's zoom painted as a viewBox over the author's camera. `shown` is the zoom on
 * screen: the last one painted, or a step of a glide toward it, which a ReaderSink reads
 * each frame so a camera move under a gliding zoom lands in the same viewBox write.
 */
export class ReaderView {
  shown: Zoom = { ...IDENTITY };
  private readonly stage: HTMLElement;
  private glide = 0;
  constructor(stage: HTMLElement) {
    this.stage = stage;
  }
  /** The viewBox for an author's frame at the zoom on screen, on this stage. */
  view(author: string): string {
    return readerViewBox(author, this.shown, this.stage.clientWidth, this.stage.clientHeight);
  }
  private show(z: Zoom): void {
    this.shown = { k: z.k, x: z.x, y: z.y };
    const svg = this.stage.querySelector('svg');
    if (!svg) return;
    const box = this.view(cameraOf(svg));
    if (svg.getAttribute('viewBox') !== box) svg.setAttribute('viewBox', box);
  }
  readonly paint: Painter = (z, glide) => {
    cancelAnimationFrame(this.glide);
    const from = this.shown;
    const still = from.k === z.k && from.x === z.x && from.y === z.y;
    if (!glide || still || matchMedia('(prefers-reduced-motion: reduce)').matches) return this.show(z);
    const t0 = performance.now();
    const step = (now: number) => {
      const a = Math.min(1, (now - t0) / GLIDE_MS),
        e = easeOut(a);
      this.show(a < 1 ? { k: from.k + (z.k - from.k) * e, x: from.x + (z.x - from.x) * e, y: from.y + (z.y - from.y) * e } : z);
      if (a < 1) this.glide = requestAnimationFrame(step);
    };
    this.glide = requestAnimationFrame(step);
  };
}
/**
 * A DomSink whose viewBox is the author's camera with the reader's zoom on top. Each
 * frame the camera's box arrives as `viewBox`; it is kept as the SVG's `data-camera`,
 * and the reader's zoom is read then, so a camera move and a reader zoom both land in
 * that frame's one viewBox write.
 */
export class ReaderSink extends DomSink {
  private readonly reader: (author: string) => string;
  private readonly signal:AbortSignal;
  constructor(container: Element, options: ConstructorParameters<typeof DomSink>[1], reader: (author: string) => string, signal:AbortSignal) {
    super(container, options);
    this.reader = reader;
    this.signal = signal;
    this.svg.setAttribute('data-camera', this.svg.getAttribute('viewBox') ?? HOME_VIEW);
  }
  override apply(els: readonly ElementRecord[], viewBox?: string): void {
    // DomSink can wake from its browser clock after this step was left.
    this.signal.throwIfAborted();
    if (viewBox !== undefined && viewBox !== this.svg.getAttribute('data-camera')) this.svg.setAttribute('data-camera', viewBox);
    super.apply(els, this.reader(this.svg.getAttribute('data-camera')!));
  }
}

export class StageZoom {
  k = 1;
  x = 0;
  y = 0;
  readonly max = ZOOM_MAX;
  private readonly stage: HTMLElement;
  private readonly changed: () => void;
  private readonly paint: Painter;

  /** `paint` puts the zoom on the picture; the player supplies ReaderView.paint. */
  constructor(stage: HTMLElement, changed: () => void, paint: Painter) {
    this.stage = stage;
    this.changed = changed;
    this.paint = paint;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = stage.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    stage.addEventListener(
      'wheel',
      (e) => {
        // Trackpad pinch arrives as ctrl+wheel; a plain wheel keeps scrolling the page.
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.zoomAt(Math.exp(-e.deltaY / 100), ...local(e));
      },
      { passive: false },
    );
    stage.addEventListener('dblclick', (e) => {
      if (this.k > 1) this.reset(true);
      else this.zoomAt(2.5, ...local(e), true);
    });
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0,
      // How far the pointer has moved since it went down: a click after a drag is the drag's end.
      travel = 0;
    stage.addEventListener('click', (e) => {
      if (this.k <= 1 || travel > 4) return;
      const [px, py] = local(e);
      this.pan(stage.clientWidth / 2 - px, stage.clientHeight / 2 - py, true);
    });
    // A pinch measures from the distance between exactly two fingers when that pair formed;
    // any change to the set of fingers starts a new measurement.
    const regroup = () => {
      const [a, b] = [...pointers.values()];
      pinch = pointers.size === 2 ? Math.hypot(a!.x - b!.x, a!.y - b!.y) : 0;
    };
    stage.addEventListener('pointerdown', (e) => {
      travel = 0;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      regroup();
      // Capture every pointer, so its pointerup arrives here even off the stage; a lost
      // pointerup would leave a phantom finger that turns the next touch into a pinch.
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      travel += Math.hypot(e.clientX - last.x, e.clientY - last.y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch) this.zoomAt(d / pinch, ...local({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 }));
        pinch = d;
      } else if (this.k > 1) this.pan(e.clientX - last.x, e.clientY - last.y);
    });
    const release = (e: PointerEvent) => {
      if (pointers.delete(e.pointerId)) regroup();
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    // A captured pointer can leave without pointerup; it must not stay a pinch partner.
    stage.addEventListener('lostpointercapture', release);
    // Painting can change reader chrome outside the stage. Keep those layout
    // writes outside the observer's delivery cycle, including in WebKit.
    new ResizeObserver(() => requestAnimationFrame(() => this.apply())).observe(stage);
  }

  /** Clamp so the drawing always covers the stage, then paint. `glide` eases discrete steps. */
  apply(glide = false): void {
    const w = this.stage.clientWidth,
      h = this.stage.clientHeight;
    // A resize (a phone turning) keeps the same part of the drawing in view: the pan is in
    // stage pixels, so it scales with the stage.
    const z = this.size && this.size[0] > 0 && this.size[1] > 0 && (this.size[0] !== w || this.size[1] !== h)
      ? { k: this.k, x: (this.x * w) / this.size[0], y: (this.y * h) / this.size[1] }
      : this;
    this.size = [w, h];
    this.set(clampZoom(z, w, h, this.max), glide);
  }
  private size: [number, number] | null = null;

  /** Adopt an already clamped zoom, then paint. */
  private set(z: Zoom, glide = false): void {
    this.k = z.k;
    this.x = z.x;
    this.y = z.y;
    this.paint({ k: z.k, x: z.x, y: z.y }, glide);
    this.stage.classList.toggle('zoomed', this.k > 1);
    this.changed();
  }

  /** Zoom by `factor`, keeping the stage point (px, py) still. */
  zoomAt(factor: number, px = this.stage.clientWidth / 2, py = this.stage.clientHeight / 2, glide = false): void {
    this.set(zoomAt(this, factor, px, py, this.stage.clientWidth, this.stage.clientHeight, this.max), glide);
  }

  /** Move the drawing by (dx, dy) stage pixels. */
  pan(dx: number, dy: number, glide = false): void {
    this.set(panBy(this, dx, dy, this.stage.clientWidth, this.stage.clientHeight, this.max), glide);
  }

  /** Go to a zoom worked out elsewhere (a step's close-up), clamped to this stage. */
  to(z: Zoom, glide = false): void {
    const w = this.stage.clientWidth,
      h = this.stage.clientHeight;
    // Worked out for this size, so a later resize scales the pan from here.
    this.size = [w, h];
    this.set(clampZoom(z, w, h, this.max), glide);
  }

  reset(glide = false): void {
    this.set(clampZoom(IDENTITY, this.stage.clientWidth, this.stage.clientHeight, this.max), glide);
  }
}
