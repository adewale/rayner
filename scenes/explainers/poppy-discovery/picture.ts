import { Circle, Group, Line, Polygon, Rectangle } from '../../../src/index.ts';
import type { Mobject, Text, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { emphasised, keyedParts } from '../../../explain/drawing.ts';
import { MARGIN, PALETTE as KIT_PALETTE, PLATE_HEIGHT, RADIUS, STROKE, TONE, TYPE, barrier, padlock, seal, sheet, words } from '../lib/poppy-kit.ts';
import { GATES, GATE_NAME, SERVERS, fetchDocument, parseUrl, progress } from './model.ts';
import type { Gate, GateResult, Server, World } from './model.ts';

// One state as a picture: who served the document, and how far the agent's four checks got.
//
// Top, the address bar: the URL the agent fetched, a padlock for HTTPS, the path it ended on in
// bold over an underline (the path check reads it), and above it the URL it started from when a
// redirect moved it, joined by a bracket. Left, at full height, the shopfront of the host that
// served the document, its name on the fascia and a jacket in its window; every shop is drawn
// alike, the forgers' too, since the agent cannot tell them by looks. In front of its doorstep,
// the poppy.json sheet with its letterhead, organization.domain, set in the same
// face and size as the fascia and centred under it, so the two read column by column; where they
// differ, both characters are underlined. On the roof, a signpost: the domain's protected resource
// metadata, whose arm runs right to the issuer it names. Right, the issuer as a register: a closed
// book until the agent finds it, then open at a page listing the domains it is the issuer for. When the register lists the shop, an arrow
// runs back from that row to the fascia, and the two arrows close a loop: the handshake.
//
// Bottom, the agent's line: its seal, and four stops in the order it checks (path, domain, issuer,
// listing), drawn as chapter 1's lanes are. The line is bold as far as the checks have passed, a
// passed stop is filled, and a refused one stands behind a barrier. The verdict sits large in the
// lower right, under the register.
//
// Colours are the kit's, each with its one meaning: WAX is only the agent's seal; INK what is in
// use; STEEL what is idle; paper for documents. Outcomes are said by position, the barrier and
// words. Every label is at least TYPE.small (0.56), so a phone shows the whole picture at once.

/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;

// Geometry, shared with the scene's transitions.
/** The shopfront, the chapter's hero: the left of the stage from its awning to its doorstep. */
const SHOP = { l: -7.6, r: -1.95, base: -1.4, hem: 1.6, awning: 2.12 } as const;
const SHOP_X = (SHOP.l + SHOP.r) / 2;
/** The fascia's text centre, and the letterhead's: one column, so their characters line up. */
const FASCIA_Y = 1.05;
const DOOR = { l: -4.1, r: -2.85, top: 0.5 } as const;
const STEP_Y = -1.49;
/** The sheet lies on the pavement in front of the doorstep, its letterhead under the fascia. */
const SHEET_AT: Vec = [SHOP_X, -2.2], SHEET_W = 5.4, SHEET_H = 1.0, HEAD_Y = -1.98;
/** The signpost's finger and the arm it sends to the issuer. */
const ARM_Y = 2.45, FINGER = { l: -3.1, r: -2.05 } as const;
const REG = { l: 2.25, r: MARGIN.right, top: 1.45, bottom: -0.95, titleY: 1.85 } as const;
const REG_X = (REG.l + REG.r) / 2;
const ROW_Y = [1.05, 0.3, -0.45] as const, ROW_X = 2.8;
/** The address bar: the last URL's row, and the row of the URL a redirect started from. */
const URL_Y = 3.32, FIRST_Y = 4.0, URL_X = -6.85;
/** The agent's line of checks. */
const RAIL_Y = -3.35, SEAL_X = -7.2;
export const STOP_X: Record<Gate, number> = { fetch: -3.45, read: -0.15, issuer: 3.1, listed: 6.35 };
/** The verdict, set large in the lower right, under the issuer's register. */
const VERDICT = { x: -1.1, phrase: -1.72, meaning: -2.5 } as const;

/** Where the sheet rests, where it first lands (the doorstep), and where the arm starts, for the scene's motion. */
export const SHEET_CENTRE = SHEET_AT;
export const DOORSTEP: Vec = [(DOOR.l + DOOR.r) / 2, STEP_Y];
export const ARM_FROM: Vec = [FINGER.r, ARM_Y];

/** A host and path, without the scheme the padlock stands for. */
const split = (url: string) => { const u = parseUrl(url); return { host: u.host, path: u.path + u.search }; };
const bare = (url: string) => url.replace(/^https:\/\//, '');

/** Every URL the agent visited for this server, including the last one when the path check refused it. */
function hopsOf(server: Server): readonly string[] {
  const { start, web } = SERVERS[server], f = fetchDocument(web, start, { exactPath: false });
  return 'hops' in f ? f.hops : [`https://${start}/.well-known/poppy.json`];
}

/** What the picture shows, decided from the state through the model. */
export type Scene = {
  ran: number;
  hops: readonly string[];
  /** The fascia: the host the agent is at (the start before fetching, the last URL's host after). */
  host: string;
  /** The letterhead, once read. */
  letterhead: string | null;
  results: GateResult[];
  /** The issuer once found; 'none' for a Company with none; null before or on an error. */
  issuer: string | null;
  verdict: ReturnType<typeof progress>['verdict'];
};

export function sceneOf(w: World): Scene {
  const { results, verdict } = progress(w), hops = hopsOf(w.server), last = hops.at(-1)!;
  const failed = (g: Gate) => verdict && !verdict.accepted && verdict.gate === g;
  const read = results.find((r) => r.gate === 'read');
  const doc = w.ran >= 2 && !failed('fetch') ? (fetchDocument(SERVERS[w.server].web, SERVERS[w.server].start, { exactPath: false }) as { doc: { organization?: { domain?: string } } }).doc : null;
  const issuer = results.find((r) => r.gate === 'issuer')?.found ?? null;
  return {
    ran: w.ran, hops, host: w.ran === 0 ? SERVERS[w.server].start : split(last).host,
    letterhead: read?.found || doc?.organization?.domain || null, results, issuer, verdict,
  };
}

/** Which check is the given one's result, or none yet. */
const resultOf = (sc: Scene, g: Gate) => sc.results.find((r) => r.gate === g);

/** The picture in words, for a reader who cannot see it; no two reachable states read alike. */
export function sayWorld(w: World): string {
  const sc = sceneOf(w), start = SERVERS[w.server].start;
  const fetched = sc.ran === 0 ? `The agent is about to fetch https://${start}/.well-known/poppy.json.`
    : sc.hops.length > 1 ? `The agent fetched ${sc.hops[0]}, which redirected it to ${sc.hops.at(-1)}.` : `The agent fetched ${sc.hops[0]}.`;
  const checks = GATES.map((g) => {
    const r = resultOf(sc, g);
    return r ? `${GATE_NAME[g]} ${r.ok ? `passed${r.found ? ` (${r.found})` : ''}` : 'refused'}` : `${GATE_NAME[g]} not run`;
  }).join('; ');
  const verdict = !sc.verdict ? 'No verdict yet.'
    : sc.verdict.accepted ? `Verdict: the document speaks for the Company ${sc.verdict.company}, ${sc.verdict.signIn ? 'which offers sign-in' : 'in signed-out Sessions only'}; User ID ${sc.verdict.userId}.`
    : `Verdict: refused at the ${GATE_NAME[sc.verdict.gate]} check, because ${sc.verdict.reason}.`;
  const shop = `The shopfront's fascia reads ${sc.host}${sc.letterhead ? `; the document's letterhead reads ${sc.letterhead}` : ''}.`;
  const issuer = sc.issuer === 'none' ? 'The domain’s metadata answered 404: no issuer.'
    : sc.issuer ? `The signpost names the issuer ${sc.issuer}${sc.ran >= 4 ? (sc.verdict?.accepted ? ', whose register lists the domain back' : ', whose register does not list the domain') : ''}.`
    : sc.verdict && !sc.verdict.accepted && sc.verdict.gate === 'issuer' ? 'The signpost’s arm stops short: the metadata timed out.' : '';
  return `Server: ${w.server}, from ${start}; ${sc.ran} of 4 checks run. ${fetched} ${shop} ${issuer} Checks: ${checks}. ${verdict}`.replace(/\s+/g, ' ');
}

/** A filled arrowhead with its tip at `tip`, pointing in direction `dir` (unit vector). */
function head(tip: Vec, dir: Vec, colour: string, size = 0.24): Polygon {
  const [dx, dy] = dir, back: Vec = [tip[0] - dx * size, tip[1] - dy * size], n: Vec = [-dy * size * 0.55, dx * size * 0.55];
  return new Polygon([tip, [back[0] + n[0], back[1] + n[1]], [back[0] - n[0], back[1] - n[1]]], { fill: colour, stroke: 'none' });
}

/** An open route through corner points: a Line, so the layout check treats it as a connector. */
function path(points: readonly Vec[], colour: string, width: number = STROKE.line): Line {
  const line = new Line(points[0]!, points[1]!, { stroke: colour, strokeWidth: width, fill: 'none' });
  for (const p of points.slice(2)) line.addLineTo(p);
  return line;
}

/**
 * The shopfront, drawn the same for every host, the forgers' too: a striped awning that leans out
 * over the street with a scalloped hem, a RAISED facade, a fascia board (the host's words are a
 * separate part), a shop window with the errand's jacket on a hanger, a panelled door with a glass
 * light and a handle, and a stone doorstep. One unkeyed Group.
 */
function shopfront(): Group {
  const { l, r, base, hem, awning } = SHOP, w = r - l, stripes = 10, out = 0.18;
  const parts: Mobject[] = [new Rectangle({ width: w, height: hem - base, fill: TONE.raised, stroke: 'none' }).moveTo([SHOP_X, (hem + base) / 2])];
  // The awning: a trapezoid of stripes, wider at the hem, each stripe ending in a scallop.
  const at = (t: number, y: number): number => { const k = (awning - y) / (awning - hem); return l - out * k + t * (w + 2 * out * k); };
  for (let i = 0; i < stripes; i++) {
    const t0 = i / stripes, t1 = (i + 1) / stripes, pts: Vec[] = [[at(t0, awning), awning], [at(t1, awning), awning], [at(t1, hem), hem]];
    const x0 = at(t0, hem), x1 = at(t1, hem), rr = (x1 - x0) / 2;
    for (let k = 1; k < 10; k++) { const a = Math.PI * (k / 10); pts.push([x1 - rr + rr * Math.cos(a), hem - rr * 0.8 * Math.sin(a)]); }
    pts.push([x0, hem]);
    parts.push(new Polygon(pts, { fill: i % 2 ? TONE.steel : TONE.rule, stroke: 'none' }));
  }
  parts.push(new Rectangle({ width: w + 2 * out, height: 0.08, fill: TONE.steel, stroke: 'none' }).moveTo([SHOP_X, awning]));
  // The fascia board.
  parts.push(new Rectangle({ width: w - 0.3, height: 0.78, fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.paper }).moveTo([SHOP_X, FASCIA_Y]));
  // The shop window, its sill, and the jacket on display.
  const win = { l: l + 0.3, r: DOOR.l - 0.35, top: DOOR.top, bottom: base + 0.35 }, wx = (win.l + win.r) / 2, wy = (win.top + win.bottom) / 2;
  parts.push(new Rectangle({ width: win.r - win.l, height: win.top - win.bottom, fill: TONE.rule, stroke: TONE.steel, strokeWidth: STROKE.fine, cornerRadius: RADIUS.paper }).moveTo([wx, wy]));
  parts.push(new Rectangle({ width: win.r - win.l + 0.2, height: 0.1, fill: TONE.steel, stroke: 'none' }).moveTo([wx, win.bottom - 0.05]));
  parts.push(jacket([wx, wy - 0.12], 0.95));
  // The door: a panel, a glass light in its upper half, a handle, and the doorstep below.
  const dx = (DOOR.l + DOOR.r) / 2, dw = DOOR.r - DOOR.l;
  parts.push(new Rectangle({ width: dw, height: DOOR.top - base, fill: TONE.ground, stroke: TONE.steel, strokeWidth: STROKE.fine }).moveTo([dx, (DOOR.top + base) / 2]));
  parts.push(new Rectangle({ width: dw - 0.36, height: 0.8, fill: TONE.rule, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo([dx, DOOR.top - 0.58]));
  parts.push(new Rectangle({ width: dw - 0.36, height: 0.5, fill: 'none', stroke: TONE.rule, strokeWidth: STROKE.fine, cornerRadius: RADIUS.paper }).moveTo([dx, base + 0.42]));
  parts.push(new Circle({ radius: 0.06, fill: TONE.soft, stroke: 'none' }).moveTo([DOOR.r - 0.18, (DOOR.top + base) / 2 - 0.05]));
  parts.push(new Rectangle({ width: dw + 0.4, height: 0.16, fill: TONE.steel, stroke: 'none', cornerRadius: 0.03 }).moveTo([dx, STEP_Y]));
  return new Group(...parts);
}

/** The jacket in the window: a hanger, then the jacket's body and sleeves, a zip and two pockets. */
function jacket(c: Vec, u: number): Group {
  const p = (x: number, y: number): Vec => [c[0] + x * u, c[1] + y * u];
  const body = [p(-0.2, 0.6), p(-0.56, 0.48), p(-0.82, -0.48), p(-0.6, -0.56), p(-0.42, 0.0), p(-0.44, -0.7), p(0.44, -0.7), p(0.42, 0.0), p(0.6, -0.56), p(0.82, -0.48), p(0.56, 0.48), p(0.2, 0.6), p(0, 0.28)];
  return new Group(
    new Polygon([p(-0.5, 0.52), p(0, 0.72), p(0.5, 0.52)], { fill: 'none', stroke: TONE.soft, strokeWidth: STROKE.fine }),
    new Rectangle({ width: 0.04 * u, height: 0.14 * u, fill: TONE.soft, stroke: 'none' }).moveTo(p(0, 0.79)),
    new Polygon(body, { fill: TONE.pewterLight, stroke: 'none' }),
    new Rectangle({ width: 0.035 * u, height: 0.98 * u, fill: TONE.raised, stroke: 'none' }).moveTo(p(0, -0.21)),
    ...[-1, 1].map((f) => new Rectangle({ width: 0.22 * u, height: 0.035 * u, fill: TONE.raised, stroke: 'none' }).moveTo(p(f * 0.24, -0.36))),
  );
}

/** The signpost on the shop's roof: a post and a finger pointing right, the domain's metadata. */
function signpost(): Group {
  const post = new Rectangle({ width: 0.09, height: ARM_Y - SHOP.awning, fill: TONE.ink, stroke: 'none' }).moveTo([FINGER.l + 0.3, (ARM_Y + SHOP.awning) / 2]);
  const h = 0.34, finger = new Polygon([[FINGER.l, ARM_Y + h / 2], [FINGER.r - 0.2, ARM_Y + h / 2], [FINGER.r, ARM_Y], [FINGER.r - 0.2, ARM_Y - h / 2], [FINGER.l, ARM_Y - h / 2]], { fill: TONE.ink, stroke: 'none' });
  return new Group(post, finger);
}

/** The issuer's register, closed: a bound book standing face on, its spine on the left, its page edges showing. */
const BOOK = { x: REG_X, y: 0.25, w: 3.3, h: 2.3 } as const;
function closedRegister(s: Stage): Group {
  const { x, y, w, h } = BOOK, l = x - w / 2;
  return new Group(
    new Rectangle({ width: w, height: h, fill: TONE.paperLine, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo([x + 0.1, y - 0.1]),
    new Rectangle({ width: w, height: h, fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.paper }).moveTo([x, y]),
    new Rectangle({ width: 0.42, height: h, fill: TONE.rule, stroke: 'none' }).moveTo([l + 0.21, y]),
    ...[0.62, -0.62].map((dy) => new Rectangle({ width: 0.42, height: 0.06, fill: TONE.steel, stroke: 'none' }).moveTo([l + 0.21, y + dy])),
    new Rectangle({ width: 2.0, height: 0.74, fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.paper }).moveTo([x + 0.21, y + 0.25]),
    words(s, 'issuer', { at: [x + 0.21, y + 0.25], align: 'middle' }),
  );
}

/** The issuer's register, open at its page: the cover's edge on the left, a PAPER page with a ruled margin and ruled lines. */
function registerPage(): Group {
  const h = REG.top - REG.bottom, cy = (REG.top + REG.bottom) / 2;
  return new Group(
    new Rectangle({ width: 0.2, height: h + 0.12, fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.paper }).moveTo([REG.l - 0.1, cy]),
    new Rectangle({ width: REG.r - REG.l, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo([REG_X, cy]),
    new Rectangle({ width: 0.035, height: h - 0.2, fill: TONE.paperLine, stroke: 'none' }).moveTo([REG.l + 0.32, cy]),
    new Rectangle({ width: 0.035, height: h - 0.2, fill: TONE.paperLine, stroke: 'none' }).moveTo([REG.l + 0.4, cy]),
    ...[0.675, -0.075].map((y) => new Rectangle({ width: REG.r - REG.l - 0.7, height: STROKE.hair, fill: TONE.paperLine, stroke: 'none' }).moveTo([REG_X + 0.25, y])),
  );
}

/** Where the noticeboard stands, in the street beside the shop, and where a sheet is pinned on it. */
const BOARD = { x: 0.65, y: 0.25, w: 4.0, h: 1.7 } as const;
const BOARD_SHEET: Vec = [BOARD.x, BOARD.y];
/** A noticeboard on two legs: a RAISED board with a STEEL frame, where anyone can pin a page. */
function noticeboard(): Group {
  const { x, y, w, h } = BOARD;
  return new Group(
    ...[-1, 1].map((f) => new Rectangle({ width: 0.12, height: 0.5, fill: TONE.steel, stroke: 'none' }).moveTo([x + f * (w / 2 - 0.4), y - h / 2 - 0.2])),
    new Rectangle({ width: w, height: h, fill: TONE.raised, stroke: TONE.steel, strokeWidth: STROKE.line, cornerRadius: RADIUS.paper }).moveTo([x, y]),
  );
}

/** Underlines under the characters of `t` (a mono line) at these indices. */
function underlines(t: Text, indices: readonly number[], colour: string): Group {
  const cw = t.width() / t.text.length, left = t.center()[0]! - t.width() / 2, y = t.center()[1]! - 0.33;
  return new Group(...indices.map((i) => new Rectangle({ width: cw * 0.9, height: 0.1, fill: colour, stroke: 'none' }).moveTo([left + (i + 0.5) * cw, y])));
}

/** A label set on a line, signage fashion: the words on an opaque plate of the ground's colour. Adds both. */
function onLine(parts: ReturnType<typeof keyedParts>, s: Stage, key: string, value: string, at: Vec, pad = 0.36): Text {
  const label = words(s, value, { at, align: 'middle' });
  parts.add(new Rectangle({ width: label.width() + pad, height: PLATE_HEIGHT, fill: TONE.ground, stroke: 'none' }).moveTo(at), `${key}:plate`);
  return parts.add(label, `${key}:label`);
}

/** The state as its picture. */
export function drawWorld(w: World, s: Stage): Group {
  const parts = keyedParts(), sc = sceneOf(w), v = sc.verdict;
  const stoppedAt = v && !v.accepted ? v.gate : null;
  const passed = (g: Gate) => !!resultOf(sc, g)?.ok;

  // The address bar: the URL to fetch, or the one fetched; above it, where a redirect started.
  const last = sc.hops.at(-1)!, fetched = sc.ran >= 1;
  const { host, path: lastPath } = split(fetched ? last : sc.hops[0]!);
  parts.add(padlock(s, { at: [URL_X - 0.5, URL_Y + 0.05], size: 0.62, color: fetched ? TONE.ink : TONE.soft }), 'url:lock');
  const hostText = parts.add(words(s, host, { at: [URL_X, URL_Y], mono: true, color: fetched ? TONE.ink : TONE.soft }), 'url:host');
  const pathX = hostText.center()[0]! + hostText.width() / 2;
  const pathText = parts.add(words(s, lastPath, { at: [pathX, URL_Y], mono: true, bold: fetched, color: fetched ? TONE.ink : TONE.soft }), 'url:path');
  const lastEnd = pathX + pathText.width();
  if (fetched) {
    const under = parts.add(new Rectangle({ width: pathText.width(), height: 0.05, fill: TONE.ink, stroke: 'none' }).moveTo([pathX + pathText.width() / 2, URL_Y - 0.4]), 'url:under');
    if (stoppedAt === 'fetch') emphasised(under, `refused: the agent ended on ${lastPath}, not /.well-known/poppy.json`);
  }
  if (fetched && sc.hops.length > 1) {
    const first = parts.add(words(s, bare(sc.hops[0]!), { at: [URL_X, FIRST_Y], mono: true, color: TONE.soft }), 'url:first');
    emphasised(first, `the agent was redirected from ${sc.hops[0]}`);
    // The redirect: a bracket from the end of the first URL, round and back to the end of the last.
    const firstEnd = first.center()[0]! + first.width() / 2, x = Math.max(firstEnd, lastEnd) + 0.35, tip: Vec = [lastEnd + 0.2, URL_Y];
    parts.add(new Group(path([[firstEnd + 0.15, FIRST_Y], [x, FIRST_Y], [x, URL_Y], [tip[0] + 0.24, URL_Y]], TONE.soft, STROKE.line), head(tip, [-1, 0], TONE.soft, 0.28)), 'url:redirect');
  }

  // The shopfront of the host the agent is at, its name on the fascia, and the signpost on its roof.
  parts.add(shopfront(), 'shop');
  const fascia = parts.add(words(s, sc.host, { at: [SHOP_X, FASCIA_Y], mono: true, align: 'middle' }), 'shop:name');
  parts.add(signpost(), 'sign');

  // A document fetched from any other path was not handed over at the door: it is pinned to a
  // noticeboard in the street, where anyone with an upload can put one.
  if (fetched && stoppedAt === 'fetch') {
    parts.add(noticeboard(), 'board');
    parts.add(new Group(sheet(s, { at: BOARD_SHEET, width: 3.7, height: 1.0, lines: 0 }), new Circle({ radius: 0.09, fill: TONE.steel, stroke: 'none' }).moveTo([BOARD_SHEET[0], BOARD_SHEET[1] + 0.36])), 'sheet');
    parts.add(words(s, 'poppy.json', { at: [BOARD_SHEET[0], BOARD_SHEET[1] - 0.1], mono: true, color: TONE.print, align: 'middle' }), 'sheet:name');
  }
  // The document in front of the doorstep, once fetched from the well-known path; its letterhead once read.
  if (fetched && stoppedAt !== 'fetch') {
    parts.add(sheet(s, { at: SHEET_AT, width: SHEET_W, height: SHEET_H, lines: 0 }), 'sheet');
    parts.add(new Rectangle({ width: 3.6, height: 0.075, fill: TONE.paperLine, stroke: 'none', cornerRadius: 0.03 }).moveTo([SHOP_X, SHEET_AT[1] - 0.26]), 'sheet:lines');
    if (sc.letterhead && sc.ran >= 2) {
      const letter = parts.add(words(s, sc.letterhead, { at: [SHOP_X, HEAD_Y], mono: true, bold: true, color: TONE.print, align: 'middle' }), 'sheet:head');
      if (stoppedAt === 'read') {
        const a = sc.host.toLowerCase(), b = sc.letterhead.toLowerCase(), n = Math.max(a.length, b.length);
        const differ = Array.from({ length: n }, (_, i) => i).filter((i) => a[i] !== b[i]);
        parts.add(underlines(fascia, differ.filter((i) => i < a.length), TONE.ink), 'shop:mark');
        emphasised(parts.add(underlines(letter, differ.filter((i) => i < b.length), TONE.print), 'sheet:mark'), `refused: the letterhead says ${sc.letterhead}, the fascia ${sc.host}`);
      }
    }
  }

  // The signpost's arm: to the issuer it names, stopped short on an error, or nothing for 404.
  if (sc.ran >= 3) {
    if (sc.issuer && sc.issuer !== 'none') {
      const end: Vec = [REG_X, REG.titleY + 0.29];
      parts.add(path([ARM_FROM, [end[0], ARM_Y], end], TONE.ink), 'out:line');
      parts.add(head(end, [0, -1], TONE.ink), 'out:head');
      onLine(parts, s, 'out', 'names its issuer', [0.4, ARM_Y]);
    } else if (sc.issuer === 'none') {
      parts.add(words(s, '404', { at: [FINGER.r + 0.3, ARM_Y], mono: true, bold: true }), 'out:code');
      emphasised(parts.add(words(s, 'not found', { at: [FINGER.r + 1.55, ARM_Y], color: TONE.soft }), 'out:note'), 'the metadata answered 404: no issuer');
    } else if (stoppedAt === 'issuer') {
      parts.add(path([ARM_FROM, [-0.3, ARM_Y]], TONE.ink), 'out:line');
      emphasised(parts.add(words(s, 'timed out', { at: [0.1, ARM_Y], bold: true }), 'out:note'), 'refused: the metadata timed out, and the agent does not fall back');
    }
  }

  // The issuer: a closed register until it is found; open at its page once found; its rows once asked.
  // A Company with no issuer has no register at all, which the picture says in words.
  if (sc.issuer && sc.issuer !== 'none') {
    parts.add(words(s, bare(sc.issuer), { at: [REG.l, REG.titleY], mono: true, bold: true }), 'register:title');
    parts.add(registerPage(), 'register:page');
    if (sc.ran >= 4) {
      const listed = ['example.com', 'example.co.uk'];
      listed.forEach((d, i) => parts.add(words(s, d, { at: [ROW_X, ROW_Y[i]!], mono: true, color: TONE.print }), `register:row:${i}`));
      const match = listed.indexOf(sc.host.toLowerCase());
      if (match >= 0) {
        // Back from the row that lists the shop to its fascia, along the fascia's level.
        const y = ROW_Y[match]!, to: Vec = [SHOP.r + 0.02, FASCIA_Y], from: Vec = [REG.l - 0.2, y], bend = REG.l - 0.7;
        const points: Vec[] = match === 0 ? [from, to] : [from, [bend, y], [bend, FASCIA_Y], to];
        parts.add(path(points, TONE.ink), 'back:line');
        parts.add(head(to, [-1, 0], TONE.ink), 'back:head');
        emphasised(onLine(parts, s, 'back', 'lists it back', [(SHOP.r + 0.24 + (match === 0 ? from[0] : bend)) / 2, FASCIA_Y], 0.24), `the issuer lists ${sc.host} back`);
      } else {
        // No row for this host: an empty dashed slot, and the return arrow only as a ghost that never arrives.
        parts.add(new Rectangle({ width: REG.r - ROW_X - 0.25, height: 0.72, fill: 'none', stroke: TONE.print, strokeWidth: STROKE.fine, dashArray: '0.12 0.08', cornerRadius: RADIUS.paper }).moveTo([(ROW_X - 0.15 + REG.r - 0.25) / 2 + 0.07, ROW_Y[2] - 0.05]), 'register:slot');
        emphasised(parts.add(words(s, 'not listed', { at: [ROW_X + 0.25, ROW_Y[2] - 0.05], color: TONE.print }), 'register:slot:text'), `refused: the issuer does not list ${sc.host}`);
        parts.add(new Line([REG.l - 0.3, ROW_Y[2] - 0.05], [-0.7, ROW_Y[2] - 0.05], { stroke: TONE.steel, strokeWidth: STROKE.line, dashArray: '0.18 0.12', fill: 'none' }).addLineTo([-0.7, FASCIA_Y]).addLineTo([SHOP.r + 0.3, FASCIA_Y]), 'back:ghost');
      }
    }
  } else if (sc.issuer === 'none') {
    emphasised(parts.add(words(s, 'no issuer', { at: [BOOK.x, BOOK.y], size: TYPE.label, color: TONE.soft, align: 'middle' }), 'register:none'), 'there is no issuer: the Company is its domain');
  } else if (stoppedAt !== 'fetch') parts.add(closedRegister(s), 'register:closed');

  // The verdict, large, in the lower right.
  if (v) {
    const phrase = parts.add(words(s, v.accepted ? 'Accepted' : 'Refused', { at: [VERDICT.x, VERDICT.phrase], size: TYPE.title, bold: true }), 'verdict:phrase');
    if (v.accepted) {
      if (!v.signIn) parts.add(words(s, 'signed out only', { at: [phrase.center()[0]! + phrase.width() / 2 + 0.42, VERDICT.phrase - 0.06], color: TONE.soft }), 'verdict:note');
      const lead = parts.add(words(s, 'speaks for', { at: [VERDICT.x, VERDICT.meaning], color: TONE.soft }), 'verdict:meaning');
      emphasised(parts.add(words(s, bare(v.company), { at: [lead.center()[0]! + lead.width() / 2 + 0.24, VERDICT.meaning], mono: true, bold: true }), 'verdict:value'), `the verdict: the document speaks for ${v.company}`);
    } else emphasised(parts.add(words(s, `at the ${GATE_NAME[v.gate]} check`, { at: [VERDICT.x, VERDICT.meaning], color: TONE.soft }), 'verdict:meaning'), `the verdict: refused at the ${GATE_NAME[v.gate]} check`);
  }

  // The agent's line of checks: its seal, the line, bold as far as the checks have passed, and a stop for each.
  parts.add(seal(s, { at: [SEAL_X, RAIL_Y], r: 0.4 }), 'rail:agent');
  parts.add(words(s, 'your agent', { at: [MARGIN.left, RAIL_Y - 0.62] }), 'rail:name');
  parts.add(path([[SEAL_X + 0.42, RAIL_Y], [MARGIN.right, RAIL_Y]], TONE.steel), 'rail:line');
  const reached = GATES.filter(passed).at(-1);
  if (reached) parts.add(path([[SEAL_X + 0.42, RAIL_Y], [STOP_X[reached], RAIL_Y]], TONE.ink, STROKE.bold), 'rail:done');
  for (const g of GATES) {
    const ok = passed(g), refused = stoppedAt === g;
    parts.add(new Circle({ radius: 0.2, fill: ok ? TONE.ink : TONE.ground, stroke: ok || refused ? TONE.ink : TONE.steel, strokeWidth: STROKE.line }).moveTo([STOP_X[g], RAIL_Y]), `rail:stop:${g}`);
    parts.add(words(s, GATE_NAME[g], { at: [STOP_X[g], RAIL_Y - 0.62], align: 'middle', color: ok || refused ? TONE.ink : TONE.soft, bold: refused }), `rail:name:${g}`);
  }
  if (stoppedAt) parts.add(barrier(s, { at: [STOP_X[stoppedAt] - 0.62, RAIL_Y], height: 0.84 }), 'rail:barrier');
  return parts.group();
}
