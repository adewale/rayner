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
// redirect moved it. Left, the shopfront of the host that served the document, its name on the
// fascia; every shop is drawn alike, the forgers' too, since the agent cannot tell them by looks.
// On the doorstep, the poppy.json sheet with its letterhead, organization.domain, set in the same
// face and size as the fascia and centred under it, so the two read column by column; where they
// differ, both characters are underlined. On the roof, a signpost: the domain's protected resource
// metadata, whose arm runs right to the issuer it names. Right, the issuer as a register: its host
// over a page listing the domains it is the issuer for. When the register lists the shop, an arrow
// runs back from that row to the fascia, and the two arrows close a loop: the handshake.
//
// Bottom, the agent's line: its seal, and four stops in the order it checks (path, domain, issuer,
// listing), drawn as chapter 1's lanes are. The line is bold as far as the checks have passed, a
// passed stop is filled, and a refused one stands behind a barrier. Over it, the verdict.
//
// Colours are the kit's, each with its one meaning: WAX is only the agent's seal; INK what is in
// use; STEEL what is idle; paper for documents. Outcomes are said by position, the barrier and
// words. Every label is at least TYPE.small (0.56), so a phone shows the whole picture at once.

/** The stage's palette: the series' own. */
export const PALETTE = KIT_PALETTE;

// Geometry, shared with the scene's transitions.
const SHOP = { l: -7.55, r: -1.95, base: -0.45, facade: 1.5, awning: 2.0 } as const;
const SHOP_X = (SHOP.l + SHOP.r) / 2;
/** The fascia's text centre, and the letterhead's: one column, so their characters line up. */
const FASCIA_Y = 1.05, HEAD_Y = -0.86;
const SHEET_AT: Vec = [SHOP_X, -1.33], SHEET_W = 5.4, SHEET_H = 1.58;
/** The signpost's finger and the arm it sends to the issuer. */
const ARM_Y = 2.45, FINGER = { l: -2.9, r: -1.85 } as const;
const REG = { l: 2.25, r: MARGIN.right, top: 1.45, bottom: -1.0, titleY: 1.85 } as const;
const REG_X = (REG.l + REG.r) / 2;
const ROW_Y = [1.05, 0.3, -0.45] as const, ROW_X = 2.8;
/** The address bar: the last URL's row, and the row of the URL a redirect started from. */
const URL_Y = 3.32, FIRST_Y = 4.0, URL_X = -6.95;
/** The agent's line of checks. */
const RAIL_Y = -3.35, SEAL_X = -7.2;
export const STOP_X: Record<Gate, number> = { fetch: -3.45, read: -0.15, issuer: 3.1, listed: 6.35 };
const VERDICT_Y = -2.55;

/** Where the sheet rests on the doorstep, and where the arm and the return arrow start, for the scene's motion. */
export const SHEET_CENTRE = SHEET_AT;
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
 * A shopfront: a striped awning with a scalloped hem, a RAISED facade with a fascia board, two
 * windows and a door. Drawn the same for every host. One unkeyed Group; the fascia's words are a
 * separate part.
 */
function shopfront(): Group {
  const { l, r, base, facade, awning } = SHOP, w = r - l, stripes = 9, pitch = w / stripes, hem = 0.16;
  const parts: Mobject[] = [new Rectangle({ width: w, height: facade - base, fill: TONE.raised, stroke: 'none' }).moveTo([SHOP_X, (facade + base) / 2])];
  for (let i = 0; i < stripes; i++) {
    const x0 = l + i * pitch, pts: Vec[] = [[x0, awning], [x0 + pitch, awning], [x0 + pitch, facade]];
    for (let k = 1; k < 8; k++) { const a = Math.PI * (k / 8); pts.push([x0 + pitch - (pitch * k) / 8, facade - hem * Math.sin(a)]); }
    pts.push([x0, facade]);
    parts.push(new Polygon(pts, { fill: i % 2 ? TONE.steel : TONE.rule, stroke: 'none' }));
  }
  // The fascia board, the windows with their glazing bars, and the door with its handle.
  parts.push(new Rectangle({ width: w - 0.24, height: 0.66, fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.paper }).moveTo([SHOP_X, FASCIA_Y]));
  for (const [x0, x1] of [[l + 0.3, SHOP_X - 0.75], [SHOP_X + 0.75, r - 0.3]] as const) {
    const cx = (x0 + x1) / 2;
    parts.push(new Rectangle({ width: x1 - x0, height: 0.7, fill: TONE.rule, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo([cx, 0.2]));
    parts.push(new Rectangle({ width: 0.05, height: 0.7, fill: TONE.raised, stroke: 'none' }).moveTo([cx, 0.2]));
  }
  parts.push(new Rectangle({ width: 0.9, height: 1.0, fill: TONE.ground, stroke: 'none' }).moveTo([SHOP_X, base + 0.5]));
  parts.push(new Circle({ radius: 0.05, fill: TONE.soft, stroke: 'none' }).moveTo([SHOP_X + 0.28, base + 0.45]));
  return new Group(...parts);
}

/** Where the noticeboard stands, beside the shop, and where a sheet is pinned on it. */
const BOARD = { x: 0.75, y: -0.75, w: 4.4, h: 1.7 } as const;
const BOARD_SHEET: Vec = [BOARD.x, BOARD.y];
/** A noticeboard on two legs: a RAISED board with a STEEL frame, where anyone can pin a page. */
function noticeboard(): Group {
  const { x, y, w, h } = BOARD;
  return new Group(
    ...[-1, 1].map((f) => new Rectangle({ width: 0.12, height: 0.6, fill: TONE.steel, stroke: 'none' }).moveTo([x + f * (w / 2 - 0.4), y - h / 2 - 0.25])),
    new Rectangle({ width: w, height: h, fill: TONE.raised, stroke: TONE.steel, strokeWidth: STROKE.line, cornerRadius: RADIUS.paper }).moveTo([x, y]),
  );
}

/** The signpost on the shop's roof: a post and a finger pointing right, the domain's metadata. */
function signpost(): Group {
  const post = new Rectangle({ width: 0.09, height: ARM_Y - SHOP.awning, fill: TONE.ink, stroke: 'none' }).moveTo([FINGER.l + 0.3, (ARM_Y + SHOP.awning) / 2]);
  const h = 0.34, finger = new Polygon([[FINGER.l, ARM_Y + h / 2], [FINGER.r - 0.2, ARM_Y + h / 2], [FINGER.r, ARM_Y], [FINGER.r - 0.2, ARM_Y - h / 2], [FINGER.l, ARM_Y - h / 2]], { fill: TONE.ink, stroke: 'none' });
  return new Group(post, finger);
}

/** The issuer's register: a page of PAPER with a ruled spine, and ruled lines for its rows. */
function registerPage(): Group {
  const h = REG.top - REG.bottom, cy = (REG.top + REG.bottom) / 2;
  return new Group(
    new Rectangle({ width: REG.r - REG.l, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo([REG_X, cy]),
    new Rectangle({ width: 0.035, height: h - 0.2, fill: TONE.paperLine, stroke: 'none' }).moveTo([REG.l + 0.32, cy]),
    new Rectangle({ width: 0.035, height: h - 0.2, fill: TONE.paperLine, stroke: 'none' }).moveTo([REG.l + 0.4, cy]),
    ...[0.675, -0.075].map((y) => new Rectangle({ width: REG.r - REG.l - 0.7, height: STROKE.hair, fill: TONE.paperLine, stroke: 'none' }).moveTo([REG_X + 0.25, y])),
  );
}

/** Underlines under the characters of `t` (a mono line) at these indices. */
function underlines(t: Text, indices: readonly number[], colour: string): Group {
  const cw = t.width() / t.text.length, left = t.center()[0]! - t.width() / 2, y = t.center()[1]! - 0.36;
  return new Group(...indices.map((i) => new Rectangle({ width: cw * 0.9, height: 0.1, fill: colour, stroke: 'none' }).moveTo([left + (i + 0.5) * cw, y])));
}

/** The state as its picture. */
export function drawWorld(w: World, s: Stage): Group {
  const parts = keyedParts(), sc = sceneOf(w), v = sc.verdict;
  const stoppedAt = v && !v.accepted ? v.gate : null;
  const passed = (g: Gate) => !!resultOf(sc, g)?.ok;

  // The address bar: the URL to fetch, or the one fetched; above it, where a redirect started.
  const last = sc.hops.at(-1)!, fetched = sc.ran >= 1;
  const { host, path: lastPath } = split(fetched ? last : sc.hops[0]!);
  parts.add(padlock(s, { at: [URL_X - 0.42, URL_Y + 0.04], size: 0.42, color: fetched ? TONE.ink : TONE.soft }), 'url:lock');
  const hostText = parts.add(words(s, host, { at: [URL_X, URL_Y], mono: true, color: fetched ? TONE.ink : TONE.soft }), 'url:host');
  const pathX = hostText.center()[0]! + hostText.width() / 2;
  const pathText = parts.add(words(s, lastPath, { at: [pathX, URL_Y], mono: true, bold: fetched, color: fetched ? TONE.ink : TONE.soft }), 'url:path');
  if (fetched) {
    const under = parts.add(new Rectangle({ width: pathText.width(), height: 0.05, fill: TONE.ink, stroke: 'none' }).moveTo([pathX + pathText.width() / 2, URL_Y - 0.4]), 'url:under');
    if (stoppedAt === 'fetch') emphasised(under, `refused: the agent ended on ${lastPath}, not /.well-known/poppy.json`);
  }
  if (fetched && sc.hops.length > 1) {
    const first = parts.add(words(s, bare(sc.hops[0]!), { at: [URL_X, FIRST_Y], mono: true, color: TONE.soft }), 'url:first');
    // The redirect, drawn as a short drop from the first URL to the last, over the padlock.
    // A hook from the first URL's start down to the last URL's padlock.
    const x = URL_X - 0.42, from: Vec = [URL_X - 0.12, FIRST_Y], to: Vec = [x, URL_Y + 0.32];
    emphasised(first, `the agent was redirected from ${sc.hops[0]}`);
    parts.add(new Group(path([from, [x, FIRST_Y], [x, to[1] + 0.16]], TONE.soft, STROKE.line), head(to, [0, -1], TONE.soft, 0.2)), 'url:redirect');
  }

  // The shopfront of the host the agent is at, its name on the fascia, and the signpost on its roof.
  parts.add(shopfront(), 'shop');
  const fascia = parts.add(words(s, sc.host, { at: [SHOP_X, FASCIA_Y], mono: true, align: 'middle' }), 'shop:name');
  parts.add(signpost(), 'sign');

  // A document fetched from any other path was not handed over at the door: it is pinned to a
  // noticeboard beside the shop, where anyone with an upload can put one.
  if (fetched && stoppedAt === 'fetch') {
    parts.add(noticeboard(), 'board');
    parts.add(new Group(sheet(s, { at: BOARD_SHEET, width: 3.7, height: 1.0, lines: 0 }), new Circle({ radius: 0.09, fill: TONE.steel, stroke: 'none' }).moveTo([BOARD_SHEET[0], BOARD_SHEET[1] + 0.36])), 'sheet');
    parts.add(words(s, 'poppy.json', { at: [BOARD_SHEET[0], BOARD_SHEET[1] - 0.1], mono: true, color: TONE.print, align: 'middle' }), 'sheet:name');
  }
  // The document on the doorstep, once fetched from the well-known path; its letterhead once read.
  if (fetched && stoppedAt !== 'fetch') {
    parts.add(sheet(s, { at: SHEET_AT, width: SHEET_W, height: SHEET_H, lines: 0 }), 'sheet');
    // The file's name, printed under where the letterhead goes, and a ruled line for the rest.
    parts.add(words(s, 'poppy.json', { at: [SHOP.l + 0.55, -1.56], mono: true, color: TONE.print }), 'sheet:name');
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
      const label = words(s, 'names its issuer', { at: [0.6, ARM_Y], align: 'middle' });
      parts.add(new Rectangle({ width: label.width() + 0.36, height: PLATE_HEIGHT, fill: TONE.ground, stroke: 'none' }).moveTo([0.6, ARM_Y]), 'out:plate');
      parts.add(label, 'out:label');
    } else if (sc.issuer === 'none') {
      parts.add(words(s, '404', { at: [FINGER.r + 0.3, ARM_Y], mono: true, bold: true }), 'out:code');
      emphasised(parts.add(words(s, 'not found', { at: [FINGER.r + 1.55, ARM_Y], color: TONE.soft }), 'out:note'), 'the metadata answered 404: no issuer');
    } else if (stoppedAt === 'issuer') {
      parts.add(path([ARM_FROM, [-0.3, ARM_Y]], TONE.ink), 'out:line');
      emphasised(parts.add(words(s, 'timed out', { at: [0.1, ARM_Y], bold: true }), 'out:note'), 'refused: the metadata timed out, and the agent does not fall back');
    }
  }

  // The issuer's register: its host, its page, and, once asked, the domains it lists.
  if (sc.issuer && sc.issuer !== 'none') {
    parts.add(words(s, bare(sc.issuer), { at: [REG.l, REG.titleY], mono: true, bold: true }), 'register:title');
    parts.add(registerPage(), 'register:page');
    if (sc.ran >= 4) {
      const listed = ['example.com', 'example.co.uk'];
      listed.forEach((d, i) => parts.add(words(s, d, { at: [ROW_X, ROW_Y[i]!], mono: true, color: TONE.print }), `register:row:${i}`));
      const match = listed.indexOf(sc.host.toLowerCase());
      if (match >= 0) {
        const y = ROW_Y[match]!, to: Vec = [SHOP.r + 0.02, FASCIA_Y];
        const points: Vec[] = match === 0 ? [[REG.l, y], to] : [[REG.l, y], [-0.7, y], [-0.7, FASCIA_Y], to];
        parts.add(path(points, TONE.ink), 'back:line');
        parts.add(head(to, [-1, 0], TONE.ink), 'back:head');
        const ly = match === 0 ? y - 0.48 : y - 0.48;
        emphasised(parts.add(words(s, 'lists it back', { at: [match === 0 ? 0 : 0.35, ly], align: 'middle' }), 'back:label'), `the issuer lists ${sc.host} back`);
      } else {
        // No row for this host: an empty dashed slot, and the return arrow only as a ghost that never arrives.
        parts.add(new Rectangle({ width: REG.r - ROW_X - 0.25, height: 0.72, fill: 'none', stroke: TONE.print, strokeWidth: STROKE.fine, dashArray: '0.12 0.08', cornerRadius: RADIUS.paper }).moveTo([(ROW_X - 0.15 + REG.r - 0.25) / 2 + 0.07, ROW_Y[2] - 0.05]), 'register:slot');
        emphasised(parts.add(words(s, 'not listed', { at: [ROW_X + 0.25, ROW_Y[2] - 0.05], color: TONE.print }), 'register:slot:text'), `refused: the issuer does not list ${sc.host}`);
        parts.add(new Line([REG.l - 0.2, ROW_Y[2] - 0.05], [-0.7, ROW_Y[2] - 0.05], { stroke: TONE.steel, strokeWidth: STROKE.line, dashArray: '0.18 0.12', fill: 'none' }).addLineTo([-0.7, FASCIA_Y]).addLineTo([SHOP.r + 0.3, FASCIA_Y]), 'back:ghost');
      }
    }
  }

  // Until the issuer is found, its place stands empty: a dashed outline, as the kit draws an empty slot.
  // (A document refused at the path check never gets that far, and the noticeboard stands there instead.)
  if ((!sc.issuer || sc.issuer === 'none') && stoppedAt !== 'fetch') {
    parts.add(new Rectangle({ width: REG.r - REG.l, height: REG.top - REG.bottom, fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, dashArray: '0.18 0.12', cornerRadius: RADIUS.paper }).moveTo([REG_X, (REG.top + REG.bottom) / 2]), 'register:ghost');
    parts.add(words(s, sc.issuer === 'none' ? 'no issuer' : 'the issuer', { at: [REG.l, REG.titleY], color: TONE.soft }), 'register:ghost:label');
  }

  // The verdict, over the agent's line.
  if (v) {
    const phrase = parts.add(words(s, v.accepted ? 'Accepted' : 'Refused', { at: [MARGIN.left, VERDICT_Y], size: TYPE.title, bold: true }), 'verdict:phrase');
    const x = phrase.center()[0]! + phrase.width() / 2 + 0.42;
    if (v.accepted) {
      const lead = parts.add(words(s, 'speaks for', { at: [x, VERDICT_Y - 0.06], color: TONE.soft }), 'verdict:meaning');
      const company = parts.add(words(s, bare(v.company), { at: [lead.center()[0]! + lead.width() / 2 + 0.2, VERDICT_Y - 0.06], mono: true, bold: true }), 'verdict:value');
      emphasised(company, `the verdict: the document speaks for ${v.company}`);
      if (!v.signIn) parts.add(words(s, 'signed out', { at: [company.center()[0]! + company.width() / 2 + 0.42, VERDICT_Y - 0.06], color: TONE.soft }), 'verdict:note');
    } else emphasised(parts.add(words(s, `at the ${GATE_NAME[v.gate]} check`, { at: [x, VERDICT_Y - 0.06], color: TONE.soft }), 'verdict:meaning'), `the verdict: refused at the ${GATE_NAME[v.gate]} check`);
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

/** Where the URL's path ends, for the sheet's flight down to the doorstep. */
export const URL_PATH_AT: Vec = [0.5, URL_Y];
