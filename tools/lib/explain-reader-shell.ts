/** Shared reader assertions run during existing catalog story visits, without another build. */
export interface ReaderChrome {
  wholePicture: string; nextLabel: string; previous: string; madeWith: string;
  viewHelp: string; hintKeys: string;
}
export function readerChrome({ wholePicture, nextLabel, previous, madeWith, viewHelp, hintKeys }: ReaderChrome): ReaderChrome {
  return { wholePicture, nextLabel, previous, madeWith, viewHelp, hintKeys };
}
export interface ReaderShell {
  chrome: ReaderChrome; home: string; cases: number; steps: string[]; crop?: CropExpectation;
}
/** Serializable: this function runs in the served page, under its real stylesheet. */
export function readerShellProblems(e: ReaderShell): string[] {
  const problems: string[] = [];
  const say = (what: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  };
  const t = e.chrome;
  const gone = ['Replay step', 'Stop animation', 'Fit stage', 'Rejouer l’étape', 'Arrêter l’animation', 'Adapter à la page'];
  const names = [...gone, t.wholePicture, t.nextLabel, t.previous];
  say('controls', names.map(name => document.querySelectorAll(`button[aria-label="${name}"]`).length), [...gone.map(() => 0), 1, 1, 1]);
  const h1s = document.querySelectorAll('h1'), player = document.querySelector('.player'), head = document.querySelector('.head');
  say('title and header', [h1s.length, !!player && h1s[0]?.closest('.player') === player,
    !!head && h1s[0]?.parentElement === head, !!player && player.firstElementChild === head,
    head?.nextElementSibling?.className,
    document.querySelectorAll('.case input').length === document.querySelectorAll('.player .head .case input').length], [1, true, true, true, 'frame', true]);
  say('maker mark', [...document.querySelectorAll<HTMLAnchorElement>('a.mark')].map(a =>
    [a.parentElement?.matches('.player > footer.foot'), a.textContent, a.href, a.getAttribute('aria-label'), a.target, a.rel]),
    [[true, 'Rayner', e.home, t.madeWith, '_blank', 'noopener']]);
  say('footer position', [...(player?.children ?? [])].filter(el => !el.matches('[hidden], .ruler, .lede-ruler, .changes-ruler')).at(-1)?.className, 'foot');
  say('standalone exit links', document.querySelectorAll('.foot a.open').length, 0);
  say('stage links', document.querySelectorAll('.stage a, .stage .foot, .frame a').length, 0);
  const controls = document.querySelector<HTMLElement>('.view-controls');
  const touring = controls && !controls.hidden && controls.style.visibility !== 'hidden';
  say('guidance', [...document.querySelectorAll<HTMLElement>('.foot .hint')].map(h =>
    [h.textContent, h.previousElementSibling?.classList.contains('mark'), h.checkVisibility()]), [[touring ? t.viewHelp : t.hintKeys, true, true]]);
  if (e.cases && !document.querySelector('.player .case input')) problems.push('case picker is missing from the card');
  const lede = document.querySelector<HTMLElement>('.lede');
  const caption = document.querySelector<HTMLElement>('.caption');
  const stepper = document.querySelector<HTMLElement>('.stepper');
  const kicker = lede?.querySelector<HTMLElement>('.kicker');
  if (lede && caption && stepper && kicker) {
    const boundary = controls && controls.getBoundingClientRect().height > 0 ? controls : stepper;
    if (kicker.getBoundingClientRect().top - boundary.getBoundingClientRect().bottom > 24)
      problems.push('empty space separates navigation from the step heading');
    if (caption.getBoundingClientRect().top - lede.getBoundingClientRect().bottom > 18)
      problems.push('empty space separates the step heading from its caption');
    const tools = document.querySelector('.tools');
    if (innerWidth <= 640 && tools && !(caption.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING))
      problems.push('phone tools must follow the explanation');
  }
  say('teaching steps', [...document.querySelectorAll('.step-bar button')].map(b => b.getAttribute('data-step')), e.steps);
  return problems;
}

export interface CropExpectation {
  player: string;
  next: string;
  title: string;
  kicker: string;
  segments: number;
  cases: number;
  madeWith: string;
  home: string;
  /** For a framed page: the way out's path and query, without parentOrigin. */
  open: { path: string; query: Record<string, string> } | null;
}
export function cropTest(e: CropExpectation) {
  const tile = document.querySelector<HTMLElement>('#content .tile');
  if (!tile) return ['no .tile in #content'];
  const problems: string[] = [];
  const all = (s: string) => [...tile.querySelectorAll<HTMLElement>(s)];
  const say = (what: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  };
  // 1. What it is.
  say('section.player and its name', all('section.player').map((p) => p.getAttribute('aria-label')), [e.player]);
  say('.stepper holding Next and the step bar', all('.stepper').map((s) => [s.querySelectorAll(`button[aria-label="${e.next}"]`).length, s.querySelectorAll('ol.step-bar > li > button').length]), [[1, e.segments]]);
  // 2. What it is about.
  say('h1', all('h1').map((h) => h.textContent), [e.title]);
  say('.lede .kicker', all('.lede .kicker').map((k) => k.textContent), [e.kicker]);
  say('.case fieldsets', all('fieldset.case').length, e.cases);
  // 3. Who made it.
  say('.foot a.mark', all('.foot a.mark').map((a) => [a.textContent, (a as HTMLAnchorElement).href, a.getAttribute('aria-label')]), [['Rayner', e.home, e.madeWith]]);
  // 4. Where to go.
  say('transcript and steps disclosures in the tile', [document.querySelectorAll('details.transcript').length, all('details.transcript').length, document.querySelectorAll('.rail').length, all('.rail').length], [1, 1, 1, 1]);
  const open = all('.foot a.open') as HTMLAnchorElement[];
  if (!e.open) say('.foot a.open (standalone)', open.length, 0);
  else {
    say('.foot a.open (framed)', open.length, 1);
    if (open[0]) {
      const u = new URL(open[0].href);
      const sorted = (q: [string, string][]) => Object.fromEntries(q.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
      say('the way out', { path: u.origin + u.pathname, query: sorted([...u.searchParams].filter(([k]) => k !== 'theme')), parentOrigin: u.searchParams.has('parentOrigin') }, { path: e.open.path, query: sorted(Object.entries(e.open.query)), parentOrigin: false });
    }
    // Nothing of Rayner's drawn outside the tile.
    say('framed body and #content', [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.getElementById('content')!).padding], ['rgba(0, 0, 0, 0)', '0px']);
  }
  // 5. The boundary: every element under #content with a box is the tile or inside it, and what it
  // draws is inside the tile's box. What it draws is its box cut by every ancestor that clips its
  // overflow: a diagram's paths may run past the stage's edges, but the stage (overflow: hidden) and
  // its SVG viewport cut them there, so they are never drawn outside the tile.
  const t = tile.getBoundingClientRect();
  const drawn = (el: Element) => {
    const b = el.getBoundingClientRect();
    let left = b.left, top = b.top, right = b.right, bottom = b.bottom;
    // Ancestors inside the tile only: the tile clips too, and something it cuts off is a fault.
    for (let a = el.parentElement; a && a !== tile; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = a.getBoundingClientRect();
      left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
    }
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  for (const el of document.querySelectorAll<HTMLElement>('#content *')) {
    const r = drawn(el);
    // A closed disclosure's content keeps a layout box in Chromium but is not drawn (content-visibility);
    // an element clipped away entirely draws nothing.
    if ((r.width === 0 && r.height === 0) || !el.checkVisibility()) continue;
    if (el !== tile && !tile.contains(el)) problems.push(`outside the tile: ${el.tagName.toLowerCase()}.${el.className}`);
    else if (r.left < t.left - 1 || r.top < t.top - 1 || r.right > t.right + 1 || r.bottom > t.bottom + 1)
      problems.push(`past the tile's edge: ${el.tagName.toLowerCase()}.${el.className} ${JSON.stringify([r.left, r.top, r.right, r.bottom])} vs ${JSON.stringify([t.left, t.top, t.right, t.bottom])}`);
  }
  return problems;
}
