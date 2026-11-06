import { StateScope, wait } from './embed-scope.ts';
import { renderAt, SeekSink } from '../src/output.ts';
import { traceRun } from '../src/trace.ts';
import type { Trace } from '../src/testing.ts';
import { StopScene } from '../src/output.ts';
import { resolveSettings } from '../explain/index.ts';
import { bindSnapshots, withSettings } from '../explain/settings.ts';
import type { ExplainerClass, Settings, SnapshotStore } from '../explain/index.ts';
import { restingTime, pictureHtml, pictureSummary, stepWords, watchedChanges } from '../explain/trace.ts';
import { playerProperties } from './embed-style.ts';
import { paletteOf, paperOf } from '../explain/stage.ts';
import { connectHost, reportHeight } from './embed-protocol.ts';
import { icon } from './embed-icons.ts';
import type { IconName } from './embed-icons.ts';
import { ReaderSink, ReaderView, StageZoom, stageSize } from './embed-zoom.ts';
import type { Zoom } from './embed-zoom.ts';
import { NARROW_PX, closeUps, stageScale, stepLayouts } from './embed-closeup.ts';
import type { StepLayout } from './embed-closeup.ts';
import { changeText, chromeFor, descriptionsLang, settingsProblem } from './embed-strings.ts';
import { HOME, SHARE_META, SHARE_STEPS_META, shareable } from './embed-share.ts';
import { storyIndices, adjacentStep } from './embed-steps.ts';
import { SENT, acceptedLog, decodeLog, encodeLog, liveSteps, logStart, outcomes, pictureChange, runLive } from './embed-live.ts';
import type { Live, LiveDraw, LiveRun, LiveSession, LogStart } from './embed-live.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
/** A button named for assistive technology; `text` shows a visible label beside the icon. */
function button(label: string, name: IconName, { text, className }: { text?: string; className?: string } = {}) {
  const b = el('button', undefined, className ?? (text ? 'button' : 'button icon'));
  b.type = 'button';
  b.setAttribute('aria-label', label);
  if (!text) b.title = label;
  b.append(icon(name));
  if (text) b.append(el('span', text));
  return b;
}
/** A control's key: in its tooltip after its name, and as aria-keyshortcuts; `shown` is how the tooltip writes it. */
function keyed(b: HTMLButtonElement, label: string, key: string, shown = key) {
  b.title = `${label} (${shown})`;
  b.setAttribute('aria-keyshortcuts', key);
}
function setIcon(b: HTMLButtonElement, label: string, name: IconName) {
  b.setAttribute('aria-label', label);
  b.title = label;
  b.querySelector('svg')!.replaceWith(icon(name));
}

export async function mountEmbed(root: HTMLElement, Source: ExplainerClass, snapshots: SnapshotStore,
  audio?: (stage: HTMLElement, frame: HTMLElement) => {set(value: unknown): void; stop(): void}): Promise<void> {
  const params = new URLSearchParams(location.search);
  // In a frame the page draws nothing but the tile: no padding, no background (embed.css). The
  // built page's first script says so before the body is laid out; this keeps it so for a page
  // mounted some other way.
  if (window.parent !== window) document.documentElement.dataset.framed = '';
  document.documentElement.dataset.theme = ['light', 'dark'].includes(params.get('theme') ?? '')
    ? params.get('theme')!
    : 'auto';
  const Bound = bindSnapshots(Source, snapshots);
  // The page's own words in the scene's language; so are the generated descriptions, where
  // explain/words.ts has the language (else they are English and marked so).
  const lang = Source.meta?.lang ?? 'en',
    t = chromeFor(lang);
  let values: Settings,
    trace: Trace,
    wanted: Settings | undefined,
    selected = 0,
    // On a narrow stage, whether each step opens on its close-up; Whole picture turns it off, Close-up on.
    follow = true;
  // `live`: the steps where the reader can drive a machine; `bases`: where each one's log starts, worked out once.
  type Base = { from: LogStart; state: object };
  type Entry = { Scene: ExplainerClass; trace: Trace; palette?: ReturnType<typeof paletteOf>; paper?: string; layouts?: Promise<Map<string, StepLayout>>; resting: Map<string, Node[]>;
    live: Map<string, Live>; bases: Map<string, Promise<Base | null>>; said: Map<string, SceneStateLike> };
  type SceneStateLike = Record<string, unknown>;
  type ScenarioHistory = {kind:'keep-step' | 'step'; name:string | undefined} | {kind:'first'};
  type ScenarioPhase = { kind: 'loading'; scope: StateScope } | { kind: 'ready'; entry: Entry };
  let scenarioPhase: ScenarioPhase = { kind: 'loading', scope: new StateScope() };
  const cache = new Map<string, Entry>();
  // The events the reader sent at the step on show (the log the URL's `sent` holds), and that step's machine.
  let sent: string[] = [],
    liveNow: LiveNow | null = null;
  const currentStep = () => trace.steps[selected]!;
  const stepCount = () => trace.steps.length;

  // The card's header: the title, then the scenarios it can show, so the choice sits next to what
  // it changes. The built page's heading is the title, so the live page says what the static one did.
  const title = el('h1', root.querySelector('h1')?.textContent ?? Source.meta?.title ?? '');
  const head = el('header', undefined, 'head');
  head.append(title);
  const choices = new Map<string, HTMLInputElement[]>();
  for (const s of Source.settings ?? []) {
    const group = el('fieldset', undefined, 'scenario');
    group.append(el('legend', s.label));
    const segments = el('div', undefined, 'segments');
    const inputs = s.options.map((o) => {
      const label = el('label'),
        input = el('input');
      input.type = 'radio';
      input.name = s.id;
      input.value = o.value;
      input.addEventListener('change', () => {
        // A scene may start each new scenario with its opening step; otherwise keep
        // the current step by name, read when the new scenario actually arrives.
        if (input.checked) void load({ ...(wanted ?? values), [s.id]: o.value },
          Source.meta?.scenarioNavigation === 'first' ? undefined : () => trace?.steps[selected]?.step, true);
      });
      label.append(input, el('span', o.label));
      segments.append(label);
      return input;
    });
    group.append(segments);
    head.append(group);
    choices.set(s.id, inputs);
  }

  // The player: the picture, what it says, and how to move on. Enlarge shows all three.
  const player = el('section', undefined, 'player');
  player.setAttribute('aria-label', t.player);
  const stage = el('div', undefined, 'stage');
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', title.textContent!);
  const poster = root.querySelector('svg');
  if (poster) stage.append(poster);
  stage.tabIndex = 0;
  // The step's heading as text on every width: where the reader is of how many, the step's
  // title and its line. On a narrow stage the heading the stage draws is too small to read,
  // and a close-up leaves it out.
  const lede = el('p', undefined, 'lede'),
    ledeKicker = el('span', undefined, 'kicker'),
    ledeTitle = el('strong'),
    ledeLine = el('span', undefined, 'line');
  lede.append(ledeKicker, ledeTitle, ledeLine);
  const caption = el('p', undefined, 'caption');
  caption.setAttribute('aria-live', 'polite');
  // The resting picture in words, for readers who cannot see it or cannot read its labels:
  // a sentence or two as the stage's description, the full list under a disclosure. A
  // description must come from a hidden element, not a closed <details>, which computes empty.
  const summary = el('p'),
    described = el('details', undefined, 'described'),
    picture = el('div');
  summary.id = 'picture-summary';
  summary.hidden = true;
  const said = descriptionsLang(lang);
  if (said) summary.lang = picture.lang = said;
  described.append(el('summary', t.picture), picture);
  stage.setAttribute('aria-describedby', summary.id);
  // One stepper row straight under the picture: Prev and Next at the start, where the
  // reader's hand returns at every width, then the view tools behind a rule.
  const stepper = el('div', undefined, 'stepper');
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', t.controls);
  const prev = button(t.previous, 'previous'),
    next = button(t.nextLabel, 'next', { text: t.next, className: 'button primary' });
  next.append(next.querySelector('svg')!); // the arrow follows the word
  next.querySelector('span')!.dataset.other = t.startAgain; // reserves Start again's width (embed.css)
  const backToStory = button(t.backToStory, 'previous', {text: t.backToStory, className: 'button back'});
  backToStory.querySelector('span')!.dataset.short = t.backToStoryShort; // its visible word (embed.css)
  backToStory.title = t.backToStory; // the full words, as its name says them
  backToStory.hidden = true;
  let lastStory = 0;
  // At rest on the last step Next is Start again, and a scene with settings offers its next scenario
  // after it: the first setting's next option, keeping the others, from the first step.
  const firstSetting = Source.settings?.[0],
    tryScenario = el('button', undefined, 'button try');
  tryScenario.type = 'button';
  tryScenario.hidden = true;
  const nextOption = () => {
    const options = firstSetting!.options,
      i = options.findIndex((o) => o.value === values[firstSetting!.id]);
    return options[(i + 1) % options.length]!;
  };
  let face = 'next';
  /** Next's face: Next, or at the end Start again with Try beside it (labelled `tryLabel`). */
  function endControls(end: boolean, tryLabel = '') {
    if (face !== (end ? 'end' : 'next')) {
      face = end ? 'end' : 'next';
      next.setAttribute('aria-label', end ? t.startAgainLabel : t.nextLabel);
      // ArrowRight never starts again: at the end Next's tooltip is its name, with no key.
      if (end) {
        next.title = t.startAgainLabel;
        next.removeAttribute('aria-keyshortcuts');
      } else keyed(next, t.nextLabel, 'ArrowRight', '→');
      const word = next.querySelector('span')!;
      word.textContent = end ? t.startAgain : t.next;
      word.dataset.other = end ? t.next : t.startAgain;
      next.querySelector('svg')!.replaceWith(icon(end ? 'restart' : 'next'));
    }
    tryScenario.hidden = !end || !firstSetting;
    // On phones Try lives with the secondary tools after the explanation.
    stepper.classList.toggle('end', !tryScenario.hidden);
    if (tryScenario.textContent !== tryLabel) { tryScenario.textContent = tryLabel; tryScenario.title = tryLabel; }
  }
  /** At rest on the last step: the end of the explanation, not of a step still playing. */
  const atEnd = () => !!trace && !isPlaying() && adjacentStep(trace.steps, selected, 1) === selected;
  const tryLabel = () => (firstSetting ? t.tryScenario(nextOption().label) : '');
  const tools = el('div', undefined, 'tools');
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', t.viewTools);
  const zoomOut = button(t.zoomOut, 'zoomOut'),
    zoomIn = button(t.zoomIn, 'zoomIn'),
    wholePicture = button(t.wholePicture, 'fit'),
    copy = button(t.copy, 'link', { className: 'button icon share' }),
    enlarge = button(t.enlarge, 'enlarge');
  enlarge.setAttribute('aria-pressed', 'false');
  // Every control with a key says it, in its tooltip and to assistive technology. The arrows are
  // not mirrored on a right-to-left page: the root's handler does not mirror them.
  keyed(prev, t.previous, 'ArrowLeft', '←');
  keyed(next, t.nextLabel, 'ArrowRight', '→');
  keyed(zoomIn, t.zoomIn, '+');
  keyed(zoomOut, t.zoomOut, '-', '−');
  keyed(wholePicture, t.wholePicture, '0');
  // On a narrow stage, Whole picture shows the whole picture from then on; Close-up brings
  // back a close-up of each step.
  const closer = button(t.closeUp, 'closeUp');
  closer.hidden = true;
  tools.append(zoomOut, zoomIn, wholePicture, closer, copy, ...(document.fullscreenEnabled ? [enlarge] : []));
  // The step bar: one segment per step of the scenario, between Next and the tools. It shows how
  // many steps there are, where the reader is, and the current step filling as it plays; it is
  // a stepper's timeline, never a seek bar.
  const bar = el('ol', undefined, 'step-bar');
  bar.setAttribute('aria-label', t.stepBar);
  stepper.append(prev, next, ...(firstSetting ? [tryScenario] : []), backToStory, bar, tools);
  const notice = el('p', undefined, 'notice');
  notice.setAttribute('role', 'status');
  // Keep navigation outside the picture so controls cannot cover its lettering.
  const frame = el('div', undefined, 'frame');
  // What the step changed of the state its author names for readers (meta.watch), under the
  // caption: plain text, read with the words. A scene that watches nothing has no such row.
  const watch = Source.meta?.watch,
    changes = watch ? el('p', undefined, 'changes') : undefined;
  if (changes) changes.hidden = true;
  /** Fill `row` with step `s`'s watched changes: the quiet label, then "Label: before → after" each. */
  const fillChanges = (row: HTMLElement, s: Trace['steps'][number]) => {
    const said = watchedChanges(s, watch, lang).map((c) => changeText(t, c));
    row.hidden = !said.length;
    // Spaces between the items keep them apart for assistive technology; flex layout drops them.
    row.replaceChildren(...(said.length ? [el('span', t.changed), ...said.flatMap((c) => [' ', el('span', c, 'change')])] : []));
  };
  // The scene's check questions (meta.checks), asked after its last teaching step: each question
  // in view, its answer behind a disclosure, so the reader answers before looking.
  const checks = Source.meta?.checks?.length ? el('section', undefined, 'checks') : undefined;
  if (checks) {
    const heading = el('h2', t.checkYourself);
    heading.id = 'check-yourself';
    checks.setAttribute('aria-labelledby', heading.id);
    const list = el('ol');
    for (const c of Source.meta!.checks!) {
      const item = el('li'), answer = el('details');
      answer.append(el('summary', t.showAnswer), el('p', c.answer));
      item.append(el('p', c.question, 'question'), answer);
      list.append(item);
    }
    checks.append(heading, el('p', t.checkHint, 'hint'), list);
    checks.hidden = true;
  }
  // The step's words, under the controls, so a long caption never moves Next.
  const words = el('div', undefined, 'words');
  words.append(lede, caption, ...(changes ? [changes] : []), ...(checks ? [checks] : []), described);
  // Measure the tallest heading and title: the stage cap budgets them and the heading keeps their height.
  const ledeRuler = el('p', undefined, 'lede-ruler');
  ledeRuler.setAttribute('aria-hidden', 'true');
  // And the tallest caption, measured where the caption sits, so its rules and width apply: the
  // caption keeps that height, so nothing after it moves as captions change length.
  // Its own class, styled with .caption's text rules in embed.css, so `.caption` still names one element.
  const captionRuler = el('p', undefined, 'caption-ruler');
  captionRuler.setAttribute('aria-hidden', 'true');
  words.append(captionRuler);
  // The page's transcript holds every scenario; the player shows the current one, and its links move
  // the player. It is a closed row of the card, under the words (and the steps, on a narrow page).
  const transcript = root.querySelector<HTMLDetailsElement>('.transcript')!;
  transcript.open = false;
  const detailSteps = el('ol', undefined, 'steps supporting-steps');
  const detailDisclosure = el('details', undefined, 'supporting');
  detailDisclosure.append(el('summary', t.details), detailSteps);
  detailDisclosure.hidden = true;
  // The card's footer: who made it, at the start, and inside a frame (the loader's or any other)
  // a way out to this page, at the end. A footer inside a section is no landmark of its own.
  const foot = el('footer', undefined, 'foot'),
    mark = el('a', undefined, 'mark');
  mark.href = HOME;
  mark.target = '_blank';
  mark.rel = 'noopener';
  mark.setAttribute('aria-label', t.madeWith);
  mark.append(icon('mark'), 'Rayner');
  // One quiet, permanent line on how to move, between the mark and the way out: keys on a fine
  // pointer, taps on a coarse one. Nothing is stored, so it never needs dismissing. On a step with
  // more than one view on a narrow stage it says how Next view differs from Next instead
  // (drawOverview sets `touring`), and Next view names it as its description.
  let touring = false;
  const hint = el('span', undefined, 'hint'),
    coarse = matchMedia('(pointer: coarse)'),
    sayHint = () => {
      const text = touring ? t.viewHelp : trace && isDetail(selected) ? t.backToStory : coarse.matches ? t.hintTouch : t.hintKeys;
      if (hint.textContent !== text) hint.textContent = text;
      hint.classList.toggle('view-help', touring);
    };
  hint.id = 'view-help';
  sayHint();
  coarse.addEventListener('change', sayHint);
  foot.append(mark, hint);
  const wayOut = el('a', t.open, 'open');
  wayOut.target = '_blank';
  wayOut.rel = 'noopener';
  wayOut.append(icon('open'));
  if (window.parent !== window) foot.append(wayOut);
  // One card: its header (the title and the scenarios), the picture mounted under it, the stepper
  // row, the words, the rows that open under them, then the footer.
  player.append(head, frame, stepper, words, notice, transcript, foot, summary, ledeRuler);
  // A frame the loader sizes to its content has no viewport height to fit: the card takes
  // the page's width, and the host page scrolls (embed.css, --player-reserve).
  const sizedToContent = window.parent !== window && params.has('parentOrigin');
  if (sizedToContent) {
    root.style.setProperty('--player-reserve', '0px');
    // The frame's height follows the content, so a narrow stage's height must not follow the frame's.
    root.style.setProperty('--stage-narrow-max', '100000px');
  }
  // The header's height depends on how the title wraps in the reader's fonts, so the stage's cap
  // takes the measured header rather than a guess: a title that wraps to two lines makes the stage
  // smaller, not the step heading fall off the screen. Written in the next frame, outside
  // ResizeObserver delivery, as reserve() is.
  // The header's height and the card's width depend on each other: a smaller cap narrows the card,
  // which can wrap the title again. Measure until the height holds (at most four passes), so the
  // stage has its final size before anything is drawn on it.
  const measureHead = () => {
    for (let pass = 0; pass < 4; pass++) {
      const height = `${Math.ceil(head.getBoundingClientRect().height)}px`;
      if (root.style.getPropertyValue('--head-h') === height) return;
      root.style.setProperty('--head-h', height);
    }
  };
  new ResizeObserver(() => requestAnimationFrame(measureHead)).observe(head);
  // A window resize changes the card's width first; measuring in the resize event, before layout is
  // observed, lets the stage change size once rather than twice.
  addEventListener('resize', measureHead);

  const steps = el('ol', undefined, 'steps');
  steps.setAttribute('aria-label', t.stepList);
  // The steps list is a rail: on a wide page a pane of the tile beside the card, under its
  // heading; on a narrow one a closed disclosure row in the card, under the words, where the step
  // bar already says where the reader is. One list, moved between the two, so it is in the page
  // at every width. The pane stretches to the tile's height; its body, not the pane, stays in view.
  const railBeside = el('aside', undefined, 'rail'),
    railBody = el('div', undefined, 'rail-body'),
    railHeading = el('h2', t.steps),
    railUnder = el('details', undefined, 'rail'),
    railSummary = el('summary');
  railHeading.id = 'rail-heading';
  railBeside.setAttribute('aria-labelledby', railHeading.id);
  railBody.append(railHeading);
  railBeside.append(railBody);
  railUnder.append(railSummary);
  // The tile: everything the page shows, on one surface inside one edge.
  const layout = el('div', undefined, 'layout tile');
  layout.append(player);
  // Secondary controls follow the explanation on phones; Next stays beside its step bar.
  const compactTools = matchMedia('(max-width:640px)');
  const placeTools = () => {
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && (tools.contains(active) || active === tryScenario) ? active : undefined;
    if (compactTools.matches) {
      words.append(tools);
      if (firstSetting) tools.prepend(tryScenario);
    } else {
      stepper.append(tools);
      if (firstSetting) next.after(tryScenario);
    }
    focused?.focus({preventScroll:true});
  };
  compactTools.addEventListener('change', placeTools);
  placeTools();
  const wide = matchMedia('(min-width: 1100px)');
  const rootStyle = getComputedStyle(root);
  const floor = parseFloat(rootStyle.getPropertyValue('--player-floor')) || 0;
  const placeRail = () => {
    // A viewport query includes the scrollbar; the rail must fit the actual content box.
    const beside = wide.matches && (!floor || root.getBoundingClientRect().width - parseFloat(rootStyle.paddingLeft) - parseFloat(rootStyle.paddingRight) >= floor + 300);
    if (steps.parentElement === (beside ? railBody : railUnder)) return;
    const active = document.activeElement;
    const focused = active === railSummary
      ? detailSteps.querySelector<HTMLButtonElement>('[aria-current=step]') ?? steps.querySelector<HTMLButtonElement>('[aria-current=step]') ?? steps.querySelector<HTMLButtonElement>('button')
      : active instanceof HTMLElement && (steps.contains(active) || detailDisclosure.contains(active)) ? active : undefined;
    if (beside) {
      if (steps.parentElement !== railBody) railBody.append(steps, detailDisclosure);
      railUnder.remove();
      // Appended after the card, never by moving the card, which would end full screen.
      if (railBeside.parentElement !== layout) layout.append(railBeside);
    } else {
      if (steps.parentElement !== railUnder) railUnder.append(steps, detailDisclosure);
      railBeside.remove();
      if (railUnder.nextElementSibling !== transcript) transcript.before(railUnder);
      if (focused || detailSteps.querySelector('[aria-current=step]')) railUnder.open = true;
    }
    focused?.focus({preventScroll:true});
    keepInRail();
  };
  placeRail();
  wide.addEventListener('change', placeRail);
  if (floor) new ResizeObserver(() => requestAnimationFrame(placeRail)).observe(root);
  transcript.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('section a'),
      step = a && new URLSearchParams(a.search).get('step');
    if (!step) return;
    e.preventDefault();
    if (scenarioPhase.kind === 'ready') void show(scenarioPhase.entry.trace.steps.findIndex((s) => s.step === step));
  });
  root.replaceChildren(layout);
  // Measured now, before the first step is shown, so the stage has its final size when the first
  // close-up is worked out; the observer above follows later changes.
  measureHead();

  // A map beside the picture while a narrow stage is zoomed:
  // where the view is, and where the step changed. Pressing it moves to the step's next
  // close-up, so the reader can see every change in turn without hunting for it.
  const overview = el('button', undefined, 'overview'),
    map = el('span', undefined, 'map'),
    view = el('span', undefined, 'view');
  overview.type = 'button';
  overview.hidden = true;
  overview.append(map);
  frame.append(stage);
  // Optional score audio (app/embed-audio.ts) puts its panel straight under the picture it plays,
  // so the score and its sound controls fit on a small phone together; the stepper row follows.
  const sound=audio?.(stage,frame);
  // Keep view navigation separate from step navigation: its own row, under the stepper row.
  const views = el('div', undefined, 'view-controls'),
    viewCount = el('span'),
    nextView = el('button', t.nextView, 'button');
  nextView.type = 'button';
  // How Next view differs from Next is said in the footer's hint (below), on the steps that have
  // more than one view: the footer is the card's last row, so its words can change from step to
  // step without moving anything, and the view row needs only its one line of controls.
  nextView.setAttribute('aria-describedby', 'view-help');
  viewCount.setAttribute('aria-live', 'polite');
  views.hidden = true;
  views.append(viewCount, nextView, overview);
  stepper.after(views);
  // A live step's controls (docs/MACHINES.md, "The player"): one button per event of the machine
  // the step last played, then Undo and Reset, and a polite line that says what each event did.
  // Under the caption (and its changes), so neither Next nor the caption moves as the reader steps
  // onto a live step; a step without a machine hides the row.
  const liveRow = el('div', undefined, 'live'),
    liveLede = el('p', undefined, 'live-lede'),
    liveEvents = el('div', undefined, 'live-events'),
    liveTools = el('div', undefined, 'live-tools'),
    undo = el('button', t.undo, 'button'),
    reset = el('button', t.reset, 'button'),
    liveSaid = el('p', undefined, 'live-said');
  liveRow.setAttribute('role', 'group');
  liveRow.setAttribute('aria-label', t.liveControls);
  liveLede.id = 'live-lede';
  liveEvents.setAttribute('aria-describedby', liveLede.id);
  undo.type = reset.type = 'button';
  reset.setAttribute('aria-label', t.resetLabel);
  reset.title = t.resetLabel;
  liveSaid.setAttribute('role', 'status');
  liveSaid.setAttribute('aria-live', 'polite');
  liveTools.append(undo, reset);
  liveRow.append(liveLede, liveEvents, liveTools, liveSaid);
  liveRow.hidden = true;
  (changes ?? caption).after(liveRow);
  // On a wide page the steps list is a rail beside the picture (placeRail), and the live row joins
  // it, at its top: the reader presses an event and watches the picture change without scrolling,
  // which under the caption at 1280 × 800 put the buttons below the fold. On a narrow page it stays
  // under the caption. Run after placeRail, on the same changes.
  const placeLive = () => {
    const beside = steps.parentElement === railBody;
    if (liveRow.parentElement === (beside ? railBody : words)) return;
    const focused = liveRow.contains(document.activeElement) ? (document.activeElement as HTMLElement) : undefined;
    if (beside) railBody.prepend(liveRow);
    else (changes ?? caption).after(liveRow);
    focused?.focus({preventScroll:true});
  };
  placeLive();
  wide.addEventListener('change', placeLive);
  if (floor) new ResizeObserver(() => requestAnimationFrame(placeLive)).observe(root);
  const narrow = () => stage.clientWidth > 0 && stage.clientWidth < NARROW_PX;
  // A narrow stage draws its pictures without the stage's heading (ReaderSink), so pictures
  // kept from the other width are stale when the stage crosses NARROW_PX (a phone turning):
  // drop them and redraw the resting picture in place. That is not a new step: no step event,
  // no host message, no history. A step playing finishes as drawn and rests anew.
  let drawnNarrow: boolean | undefined;
  function redrawIfNarrowChanged() {
    const now = narrow();
    if (stage.clientWidth <= 0 || now === drawnNarrow) return;
    const first = drawnNarrow === undefined;
    drawnNarrow = now;
    if (first) return;
    for (const entry of cache.values()) entry.resting.clear();
    if (scenarioPhase.kind === 'ready' && !isPlaying()) void redrawResting(scenarioPhase.entry, selected);
  }
  function redrawResting(at: Entry, index: number) {
    const step = at.trace.steps[index]!,
      scope = playback.scope,
      container = el('div');
    // In the scope it draws for: a step, scenario or playback change that aborts it mid-draw ends the
    // redraw quietly, rather than rejecting a promise no one holds (the sink refuses to draw once
    // aborted; issue #96's property found it with a resize across NARROW_PX and a scenario switch).
    return scope.run(function* () {
      yield* wait(restingPicture(at, step, liveNow?.step === step ? liveNow : null, sent, container, scope));
      // Superseded while drawing: a step, scenario or playback change owns the stage now.
      if (playback.scope !== scope || scenarioPhase.kind !== 'ready' || scenarioPhase.entry !== at || selected !== index) return;
      stage.replaceChildren(...container.childNodes);
      zoom.apply();
    });
  }
  const revealStage = () => {
    if (!narrow()) return;
    const box = stage.getBoundingClientRect();
    if (box.top < 0 || box.bottom > innerHeight) stage.scrollIntoView({block: 'nearest'});
  };
  let shownLayout: StepLayout | undefined,
    scenarioLayouts: Map<string, StepLayout> | undefined,
    tourSize = '',
    // The close-ups of the step on show, where it opened first; `stop` is the one last visited.
    tour: Zoom[] = [],
    scenarioTours = false,
    stop = 0;
  function refreshTour() {
    const [w, h] = stageSize(stage), key = `${w} ${h}`;
    if (!scenarioLayouts || w <= 0 || h <= 0 || key === tourSize) return;
    tourSize = key;
    tour = closeUps(shownLayout, w, h, zoom.max);
    stop = Math.min(stop, tour.length - 1);
    // Whether any step of this case tours: then a single-view step keeps the row's place.
    scenarioTours = [...scenarioLayouts.values()].some((layout) => layout === shownLayout ? tour.length > 1 : closeUps(layout, w, h, zoom.max).length > 1);
  }
  // An authored opening can be the whole frame while its later detail stops
  // zoom in. Whole picture opts out of that tour; manually zooming out from a
  // detail stop also returns to the whole frame until the tour is resumed.
  const showingWhole = () => zoom.k <= 1 && !(follow && tour[stop]?.k === 1);
  function drawOverview() {
    refreshTour();
    const [w, h] = stageSize(stage),
      on = narrow() && zoom.k > 1;
    stage.classList.toggle('narrow', narrow());
    player.classList.toggle('narrow', narrow());
    redrawIfNarrowChanged();
    const multiple = tour.length > 1;
    // A reserved row also keeps the next close-up's slot (embed.css), so Next view never slides.
    const reserved = narrow() && (multiple || scenarioTours);
    overview.hidden = !on || !multiple;
    // Next is above this row. A single-view step needs no controls; it keeps the row's place,
    // hidden, when another step of the scenario tours, so stepping between them moves nothing.
    const activeTour = narrow() && multiple;
    views.hidden = !reserved;
    views.style.visibility = activeTour ? '' : 'hidden';
    // A row kept in place for another step's tour still says how many views this step has, so the
    // reader sees a labelled row rather than an unexplained gap; its count is not announced there.
    viewCount.style.visibility = reserved && !activeTour ? 'visible' : '';
    viewCount.toggleAttribute('aria-hidden', reserved && !activeTour);
    if (touring !== activeTour) {
      touring = activeTour;
      sayHint();
    }
    nextView.disabled = tour.length < 2;
    const count = !multiple || !showingWhole() ? t.viewCount(stop + 1, Math.max(1, tour.length)) : t.wholePicture;
    if (viewCount.textContent !== count) viewCount.textContent = count;
    if (!on) return;
    overview.disabled = tour.length < 2;
    const label = t.nextCloseUp(((stop + 1) % Math.max(1, tour.length)) + 1, Math.max(1, tour.length));
    overview.setAttribute('aria-label', label);
    overview.title = label;
    const pc = (v: number) => `${(v * 100).toFixed(3)}%`;
    const place = (node: HTMLElement, left: number, top: number, width: number, height: number) =>
      Object.assign(node.style, { left: pc(left), top: pc(top), width: pc(width), height: pc(height) });
    place(view, -zoom.x / (zoom.k * w), -zoom.y / (zoom.k * h), 1 / zoom.k, 1 / zoom.k);
    const { s, ox, oy } = stageScale(w, h);
    const parts = (shownLayout?.parts ?? []).map((b) => {
      const part = el('span', undefined, 'part');
      place(part, (ox + (b[0] + 8) * s) / w, (oy + (4.5 - b[3]) * s) / h, ((b[2] - b[0]) * s) / w, ((b[3] - b[1]) * s) / h);
      return part;
    });
    map.replaceChildren(...parts, view);
  }
  overview.onclick = nextView.onclick = () => {
    // The stage may have changed size since the close-ups were last worked out (the header settles
    // a frame after a resize), so work them out for the stage as it is now.
    refreshTour();
    if (tour.length < 2) return;
    revealStage();
    if (showingWhole()) { closer.click(); return; }
    stop = (stop + 1) % tour.length;
    zoom.to(tour[stop]!, true);
  };
  // The reader's zoom narrows the viewBox over the author's camera (app/embed-zoom.ts), so the
  // drawing stays crisp, the layout never moves, a camera move keeps playing under a zoom, and
  // Whole picture is the author's own frame. Close-ups are reader zooms over that frame too.
  const reader = new ReaderView(stage),
    readerView = (author: string) => reader.view(author);
  /**
   * A sink's options for a scenario: its paper as the SVG's background. A narrow stage is taller
   * than the picture, so the whole picture, and a close-up near its top or bottom edge, shows
   * past the frame; that margin should read as more paper, not as the engine's dark default.
   */
  const sinkOptions = (at: Entry, realtime: boolean) => ({
    realtime,
    ...(at.paper && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(at.paper) ? { background: at.paper } : {}),
  });
  const zoom = new StageZoom(
    stage,
    () => {
      zoomOut.disabled = zoom.k <= 1;
      zoomIn.disabled = zoom.k >= zoom.max;
      // Unseen until zoomed, but it keeps its place, so a step that opens on a close-up
      // does not wrap the controls onto a second row and push the page down.
      wholePicture.style.visibility = zoom.k <= 1 ? 'hidden' : '';
      closer.hidden = follow || !narrow();
      drawOverview();
    },
    reader.paint,
  );
  for (const [control, factor] of [[zoomIn, 1.6], [zoomOut, 1 / 1.6]] as const) {
    control.onclick = () => { revealStage(); zoom.zoomAt(factor, undefined, undefined, true); };
  }
  /** The whole picture; on a narrow stage, for the steps that follow too. */
  const whole = (glide: boolean) => {
    if (narrow()) follow = false;
    zoom.reset(glide);
  };
  wholePicture.onclick = () => whole(true);
  closer.onclick = async () => {
    if (scenarioPhase.kind === 'loading') return;
    const scope = playback.scope, at = scenarioPhase.entry;
    return scope.run(function* () {
      follow = true;
      const target = yield* wait(framing(currentStep(), scope, at));
      if (target) zoom.to(target, true);
      else zoom.apply();
      // The button that was pressed hides; focus moves to the stage it changed.
      stage.focus();
    });
  };
  reportHeight(root);

  /** This step and scenario as a URL, with the events the reader sent last, written as `sent=push,pop` (commas and colons kept). */
  function urlFor(withoutParent = false): URL {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
    url.searchParams.set('step', currentStep().step);
    url.searchParams.delete(SENT);
    if (withoutParent) url.searchParams.delete('parentOrigin');
    if (sent.length) url.search = `${url.search ? `${url.search}&` : '?'}${SENT}=${encodeLog(sent)}`;
    return url;
  }
  function link(push: boolean) {
    const url = urlFor();
    // Re-showing the step already in the address bar adds no history entry Back would have to skip.
    (push && url.href !== location.href ? history.pushState : history.replaceState).call(history, null, '', url);
    wayOut.href = urlFor(true).href;
  }
  const mainIndices = () => storyIndices(trace.steps);
  const firstMain = () => mainIndices()[0] ?? 0;
  function isDetail(index: number) {
    return trace.steps[index]?.meta.kind === 'detail' && trace.steps.some(step => step.meta.kind !== 'detail');
  }
  function chrome() {
    const step = currentStep(),
      words = stepWords(step);
    caption.textContent = words.caption;
    fillLede(ledeKicker, ledeTitle, ledeLine, selected, words);
    if (changes) fillChanges(changes, step);
    prev.disabled = adjacentStep(trace.steps, selected, -1) === selected;
    backToStory.hidden = !isDetail(selected);
    bar.hidden = isDetail(selected);
    sayHint();
    if (isDetail(selected)) {
      detailDisclosure.open = true;
      if (railUnder.isConnected) railUnder.open = true;
    }
    else lastStory = selected;
    endControls(atEnd(), atEnd() ? tryLabel() : '');
    if (checks) checks.hidden = selected !== mainIndices().at(-1);
    reached.add(step.step);
    nameSteps();
    // Done, current, to do, in the rail and on the step bar. Only the current segment is a Tab
    // stop, full at rest and empty as its step starts.
    for (const list of [steps, detailSteps, bar]) for (const b of list.querySelectorAll<HTMLButtonElement>('button')) {
      const i = Number(b.dataset.index);
      const state = i < selected ? 'done' : i === selected ? 'current' : 'todo';
      b.dataset.state = state;
      b.setAttribute('aria-current',state === 'current' ? 'step' : 'false');
      if(list===bar) {
        b.tabIndex=state === 'current' ? 0 : -1;
        if(state === 'current') b.style.setProperty('--progress',isPlaying() ? '0' : '1');
        else b.style.removeProperty('--progress');
      }
    }
    keepInRail();
    stage.setAttribute('aria-label', t.stageLabel(title.textContent!, words.title, words.line));
    // Busy while a step plays: the resting picture, and its description, are still to come.
    if (isPlaying()) stage.setAttribute('aria-busy', 'true');
    else stage.removeAttribute('aria-busy');
    describePicture(step);
  }
  /** The resting picture in words: the step's, or what the scene shows after the reader's events (`shown`). */
  let describedShown: unknown;
  function describePicture(step: Trace['steps'][number], shown?: SceneStateLike) {
    const said = describedShown = shown ?? step.shown;
    summary.textContent = pictureSummary(said);
    picture.innerHTML = pictureHtml(said);
    described.hidden = !picture.innerHTML;
  }
  // The steps the reader has reached, by name, across scenarios. The rail and the step bar name a
  // teaching step only once it is reached (or an earlier step's later one is), so a later title
  // such as "Answer: …" cannot give away a prediction; meta.player.outline names them all.
  const reached = new Set<string>(),
    outline = Source.meta?.player?.outline === true;
  function nameSteps() {
    let furthest = selected;
    trace.steps.forEach((s, i) => { if (reached.has(s.step) && i > furthest) furthest = i; });
    const main = mainIndices();
    for (const b of steps.querySelectorAll<HTMLButtonElement>('button')) {
      const i = Number(b.dataset.index), shown = outline || i <= furthest;
      if (b.dataset.shown === String(shown)) continue;
      b.dataset.shown = String(shown);
      const words = stepWords(trace.steps[i]!), title = b.querySelector<HTMLElement>('.title')!, line = b.querySelector<HTMLElement>('.line');
      title.textContent = shown ? words.title : t.notYet(main.indexOf(i) + 1);
      b.classList.toggle('unseen', !shown);
      if (line) line.hidden = !shown;
    }
    main.forEach((i, ordinal) => {
      const b = bar.querySelector<HTMLButtonElement>(`button[data-index="${i}"]`);
      if (!b) return;
      const shown = outline || i <= furthest, label = stepWords(trace.steps[i]!).title;
      b.title = shown ? label : t.notYet(ordinal + 1);
      b.setAttribute('aria-label', shown ? t.stepOf(ordinal + 1, main.length, label) : t.stepOf(ordinal + 1, main.length));
    });
  }
  /** Beside the card, scroll the rail, never the page, so the current step is in view in it. */
  function keepInRail() {
    const item = steps.querySelector<HTMLElement>('[aria-current=step]');
    if (!item || !railBeside.isConnected || railBody.scrollHeight <= railBody.clientHeight) return;
    // The sticky rail body is the item's offset parent, so these are in its scrolled content.
    const top = item.offsetTop,
      bottom = top + item.offsetHeight;
    if (top < railBody.scrollTop) railBody.scrollTop = top;
    else if (bottom > railBody.scrollTop + railBody.clientHeight) railBody.scrollTop = bottom - railBody.clientHeight;
  }
  let shownScenario = '',
    reservedFor = '',
    measuredFor = '';
  /** The lede's words for step `i`: its number of the total, its title, then its line when it has one. */
  function fillLede(kicker: HTMLElement, strong: HTMLElement, span: HTMLElement, i: number, words: { title: string; line: string }) {
    const ordinal = mainIndices().indexOf(i);
    kicker.textContent = isDetail(i) ? t.details : t.stepOf(ordinal + 1, mainIndices().length);
    strong.textContent = words.title;
    span.textContent = words.line;
    span.hidden = !words.line;
  }
  // The tallest heading sets the stage cap and the heading's reserved height; the tallest caption the caption's.
  // Recheck when the cap changes the card width, which can wrap the heading again.
  function reserve() {
    // A re-measure starts from the layout a fresh link starts with, then settles from there as a fresh
    // link does. The header's and the tallest heading's heights cap the stage (embed.css), the cap sets
    // the card's width, and the width sets how they wrap, so settling from the layout before (another
    // scenario's, or another width's) can reach a different size that also holds (issue #96). From
    // the same start, the size is a function of the scenario and the page's size alone.
    // Only a new scenario or page size starts again; the passes that settle a layout (here, and when
    // the card's resize brings reserve back) continue from where the last one left it.
    // In a frame the loader sizes to its content, the frame's height follows the layout rather than
    // bounding it, so only its width is a cause; a height in the key would restart every re-measure.
    const cause = `${innerWidth} ${sizedToContent ? '' : innerHeight} ${shownScenario}`;
    if (scenarioPhase.kind !== 'loading' && caption.clientWidth && cause !== measuredFor) {
      measuredFor = cause;
      for (const property of ['--head-h', '--lede-h', '--lede-title-h', '--caption-h', '--stepper-h']) root.style.removeProperty(property);
      measureHead();
    }
    for (let pass = 0; pass < 3; pass++) {
      if (!reserveOnce()) return;
      const width = lede.clientWidth;
      measureHead();
      if (lede.clientWidth === width) return;
    }
  }
  function reserveOnce(): boolean {
    player.classList.toggle('narrow', narrow());
    if (scenarioPhase.kind==='loading' || !caption.clientWidth) return false;
    // Measured over both paths, so moving between the explanation and its details resizes nothing.
    const key = reserveKey();
    if (key === reservedFor) return false;
    reservedFor = key;
    ledeRuler.style.width = `${lede.clientWidth}px`;
    const kicker = el('span', undefined, 'kicker'),
      strong = el('strong'),
      span = el('span', undefined, 'line');
    ledeRuler.replaceChildren(kicker, strong, span);
    captionRuler.style.width = `${caption.clientWidth}px`;
    let tallest = 0,
      tallestTitle = 0,
      tallestCaption = 0;
    for (const [i, step] of trace.steps.entries()) {
      const shown = stepWords(step);
      fillLede(kicker, strong, span, i, shown);
      tallest = Math.max(tallest, ledeRuler.getBoundingClientRect().height);
      tallestTitle = Math.max(tallestTitle, strong.getBoundingClientRect().height);
      captionRuler.textContent = shown.caption;
      tallestCaption = Math.max(tallestCaption, captionRuler.getBoundingClientRect().height);
    }
    ledeRuler.replaceChildren();
    captionRuler.textContent = '';
    root.style.setProperty('--caption-h', `${tallestCaption}px`);
    // The stage cap budgets the tallest heading, and the heading keeps that height (embed.css),
    // its title the tallest title's, so stepping never moves the line or the caption.
    root.style.setProperty('--lede-h', `${tallest}px`);
    root.style.setProperty('--lede-title-h', `${tallestTitle}px`);
    reserveStepper(trace.steps);
    return true;
  }
  /** What the reserved heights were measured for: the caption's and heading's widths, and the scenario. */
  const reserveKey = () => `${caption.clientWidth} ${lede.clientWidth} ${shownScenario}`;
  /** The stepper row at its widest: Start again, Try beside it when it is in the row, and Back when
   *  the scenario has details. When the tools do not fit beside that, they take their own line on every
   *  step; the row keeps that scenario's height, so no step wraps it differently or moves what follows. */
  function reserveStepper(steps: Trace['steps']) {
    const saved = { face, tryHidden: tryScenario.hidden, tryText: tryScenario.textContent, backHidden: backToStory.hidden };
    endControls(true, tryLabel());
    tryScenario.hidden = tryScenario.parentElement !== stepper || !firstSetting;
    backToStory.hidden = !steps.some((_, i) => isDetail(i));
    stepper.removeAttribute('data-stacked');
    root.style.setProperty('--stepper-h', '0px');
    const row = next.offsetTop;
    const wraps = [...stepper.children].some((c) => c instanceof HTMLElement && !c.hidden && c.offsetTop >= row + next.offsetHeight);
    stepper.toggleAttribute('data-stacked', wraps); // an attribute, so the row's class still names it alone
    const height = stepper.getBoundingClientRect().height;
    endControls(saved.face === 'end', saved.tryText ?? '');
    tryScenario.hidden = saved.tryHidden;
    backToStory.hidden = saved.backHidden;
    root.style.setProperty('--stepper-h', `${height}px`);
  }
  // Measuring the heading changes the observed layout. Write in the next
  // frame, outside ResizeObserver delivery (WebKit otherwise reports a loop).
  new ResizeObserver(() => requestAnimationFrame(reserve)).observe(player);
  /**
   * The close-up a step opens on: on a narrow stage while close-ups are on, the zoom that
   * frames what the step changed (app/embed-closeup.ts); otherwise null, and the zoom keeps
   * its place. Layouts are prepared once per scenario, including on desktop, so a later
   * resize can refresh tour metadata without rerunning the scene or changing zoom.
   */
  function framing(step: Trace['steps'][number], scope: StateScope, at: Entry) {
    return scope.run(function* () {
      shownLayout = undefined;
      scenarioLayouts = undefined;
      tourSize = '';
      tour = [];
      scenarioTours = false;
      stop = 0;
      at.layouts ??= stepLayouts(at.Scene);
      const layouts = yield* wait(at.layouts);
      const layout = layouts.get(step.step);
      // A scenario or step shown while the layouts were worked out owns the overview now.
      scenarioLayouts = layouts;
      shownLayout = layout;
      refreshTour();
      return narrow() && follow ? tour[0]! : null;
    });
  }
  function* settle(step: Trace['steps'][number], target: Zoom | null, at: Entry, scope: StateScope) {
    sound?.set(step.meta.audio);
    if (target) zoom.to(target);
    else zoom.apply();
    root.classList.remove('loading');
    yield* wait(Promise.resolve(document.dispatchEvent(new CustomEvent('rayner:step', { detail: { step: step.step, settings: values } }))));
    toHost({ step: step.step, index: selected, total: stepCount(), settings: { ...values } });
    primeNext(at);
  }
  /**
   * Show step `index` at rest. `log` is a link's events for the step's machine: the longest prefix
   * the machine takes is replayed onto the resting picture, and a notice says where the rest
   * stopped, as an unknown step falls back to the first. Any other show starts with no events.
   */
  async function show(index: number, push = true, log: readonly string[] = []) {
    if (scenarioPhase.kind === 'loading') return;
    if (push) revealStage();
    const at=scenarioPhase.entry;
    const scope = new StateScope();
    leaveStep({ kind: 'resting', scope });
    return scope.run(function* () {
      selected = Math.max(0, Math.min(stepCount() - 1, index));
      sent = [...log];
      liveNow = null;
      drawLive();
      chrome();
      reserve();
      link(push);
      const step = currentStep();
      const container = el('div');
      let live: LiveNow | null = null;
      // A link's events are checked against the machine before anything is drawn; with none, the
      // step's own picture is drawn while the machine's starting point is worked out.
      if (log.length) {
        live = yield* wait(liveAt(at, step));
        const accepted = live ? acceptedLog(live.live.machine, live.base.state, log) : undefined;
        sent = accepted?.kept ?? [];
        const problem = !live ? t.notLive : accepted!.stopped ? t.sentFallback(accepted!.stopped.event, reasonText(accepted!.stopped)) : '';
        if (problem) notice.textContent = [notice.textContent, problem].filter(Boolean).join(' ');
        if (sent.length !== log.length) link(false);
      }
      const [shown, target, found] = yield* wait(Promise.all([
        restingPicture(at, step, live, sent, container, scope),
        framing(step, scope, at),
        log.length ? Promise.resolve(live) : liveAt(at, step),
      ]));
      liveNow = found;
      drawLive();
      if (found) liveRow.dataset.landed = encodeLog(sent);
      if (shown) describePicture(step, shown);
      // Reduced motion: no animation, but the old picture fades out over the new one, so the change is still seen.
      const old = reduced() ? stage.querySelector('svg') : null;
      old?.classList.add('leaving');
      old?.addEventListener('animationend', () => old.remove());
      stage.replaceChildren(...container.childNodes, ...(old ? [old] : []));
      // On a phone the picture is shown whole while the reader explores.
      if (sent.length && narrow()) zoom.reset();
      yield* settle(step, sent.length && narrow() ? null : target ?? null, at, scope);
    });
  }
  type LiveNow = { step: Trace['steps'][number]; live: Live; base: Base };
  /** The machine live at `step` and where its log starts, or null: a step with no machine, or one no event moves. */
  function liveAt(at: Entry, step: Trace['steps'][number]): Promise<LiveNow | null> {
    const live = at.live.get(step.step);
    if (!live) return Promise.resolve(null);
    let base = at.bases.get(step.step);
    if (!base) {
      base = runLive(at.Scene, step, live.index, []).then((run) => logStart(live.machine, run.rest), (error: unknown) => {
        console.error(error);
        return null;
      });
      at.bases.set(step.step, base);
    }
    return base.then((b) => (b ? { step, live, base: b } : null));
  }
  /**
   * `step`'s resting picture with `log` sent to its machine, drawn into `container` (kept per step
   * and log, so Back and a repeated log draw nothing). With no log it is the step's own picture,
   * drawn as it always was; with one, the scene run to that picture and the log played on it, every
   * frame skipped. Resolves to what the scene then shows, for the picture's description.
   */
  function restingPicture(at: Entry, step: Trace['steps'][number], live: LiveNow | null, log: readonly string[], container: HTMLElement, scope: StateScope): Promise<SceneStateLike | undefined> {
    const key = log.length ? `${step.step}\n${log.join('\n')}` : step.step,
      kept = at.resting.get(key);
    if (kept) {
      container.append(...clones(kept));
      return Promise.resolve(at.said.get(key));
    }
    const sink = new ReaderSink(container, sinkOptions(at, false), readerView, scope.signal, narrow);
    const drawn: Promise<SceneStateLike | undefined> = log.length && live
      ? liveRun(at, live, log, { sink }).then((run) => run.shown as SceneStateLike)
      : renderAt(at.Scene, restingTime(step, at.trace.fps), sink).then(() => undefined);
    return drawn.then((shown) => {
      at.resting.set(key, clones(container.childNodes));
      if (shown) at.said.set(key, shown);
      return shown;
    });
  }
  /**
   * The run held at the picture of the reader's last log (runLive with `keep`), so a press that
   * extends it plays only the new event instead of running the scene to the step again. Any other
   * log (Undo, Reset, a link, another step) runs afresh and is held in its place.
   */
  let held: { at: Entry; step: string; from: LogStart; session: LiveSession } | null = null;
  /** `log` at `now`'s step, drawn by `draw`: from the held run when `log` extends its log by one event, else a fresh run. */
  function liveRun(at: Entry, now: LiveNow, log: readonly string[], draw: LiveDraw): Promise<LiveRun> {
    const h = held, step = now.step;
    if (h && h.at === at && h.step === step.step && h.from === now.base.from && h.session.open && !h.session.busy &&
      log.length === h.session.log.length + 1 && h.session.log.every((e, i) => e === log[i]))
      return h.session.send(log.at(-1)!, draw);
    return runLive(at.Scene, step, now.live.index, log, { ...draw, from: now.base.from, keep: true }).then((run) => {
      held?.session.close();
      held = run.session ? { at, step: step.step, from: now.base.from, session: run.session } : null;
      return run;
    });
  }
  /** Why an event is not sent: the story's bound, the model's reason, or that it is not possible here. */
  const reasonText = (o: { kind: string; reason: string | null }) =>
    o.kind === 'beyond' ? t.storyStops(o.reason!) : o.reason ?? t.notPossible;
  /** The state the reader's events have reached. */
  const liveState = (now: LiveNow) => acceptedLog(now.live.machine, now.base.state, sent).states.at(-1)!;
  /**
   * The live row for the step on show: one button per event, in the machine's order, each as
   * `outcome` says from the state reached. An event that goes somewhere is a plain button; one the
   * model refuses, or one past where the story stops, stays focusable (aria-disabled) and says why
   * in its description, on hover and on focus. Buttons are kept by event, so focus stays put.
   */
  function drawLive() {
    const now = liveNow;
    liveRow.hidden = !now;
    if (!now) {
      liveEvents.replaceChildren();
      liveSaid.textContent = '';
      delete liveRow.dataset.landed;
      return;
    }
    liveLede.textContent = now.base.from === 'start' ? t.liveFromStart : t.liveFromRest;
    const kept = new Map([...liveEvents.querySelectorAll<HTMLButtonElement>('button')].map((b) => [b.dataset.event!, b] as const));
    liveEvents.replaceChildren(...outcomes(now.live.machine, liveState(now)).map((o, i) => {
      let b = kept.get(o.event);
      if (!b) {
        b = el('button', undefined, 'button event');
        b.type = 'button';
        b.dataset.event = o.event;
        const why = el('span', undefined, 'reason');
        why.id = `live-reason-${i}`;
        b.append(el('span', o.label, 'word'), why);
        b.setAttribute('aria-label', o.label);
        const event = o.event;
        b.addEventListener('click', () => void sendEvent(event));
      }
      b.dataset.outcome = o.kind;
      const why = b.querySelector<HTMLElement>('.reason')!, reason = o.kind === 'next' ? '' : reasonText(o);
      why.textContent = reason;
      if (reason) {
        b.setAttribute('aria-disabled', 'true');
        b.setAttribute('aria-describedby', why.id);
      } else {
        b.removeAttribute('aria-disabled');
        b.removeAttribute('aria-describedby');
      }
      return b;
    }));
    // With nothing sent there is nothing to undo or reset; focus on them moves to the first event.
    const none = !sent.length;
    if (none && (document.activeElement === undo || document.activeElement === reset)) liveEvents.querySelector('button')?.focus();
    undo.disabled = reset.disabled = none;
  }
  /** Send `event` from the state the reader's events reached: refused, it only says why; otherwise it joins the log and plays. */
  async function sendEvent(event: string) {
    if (scenarioPhase.kind !== 'ready' || !liveNow) return;
    const now = liveNow,
      o = outcomes(now.live.machine, liveState(now)).find((x) => x.event === event)!;
    if (o.kind !== 'next') {
      liveSaid.textContent = t.refusedSaid(o.label, reasonText(o));
      return;
    }
    sent = [...sent, event];
    link(true);
    drawLive();
    return land(now, !reduced(), o.label);
  }
  undo.onclick = () => {
    if (!liveNow || !sent.length) return;
    sent = sent.slice(0, -1);
    link(true);
    drawLive();
    void land(liveNow, false, t.undo);
  };
  reset.onclick = () => {
    if (!liveNow || !sent.length) return;
    sent = [];
    link(true);
    drawLive();
    void land(liveNow, false);
  };
  /**
   * Draw the picture the reader's log lands on. Animated, the scene runs to the step's picture
   * with every earlier event skipped, and the last one plays in real time from the picture before
   * it, so a press during a play lands that one and plays the next. Otherwise (reduced motion,
   * Undo, Reset) the landing is drawn at once. Then the picture's words and the live line say
   * what happened: `what` (the event, or Undo) and the picture it lands on; Reset says so.
   */
  function land(now: LiveNow, animated: boolean, what?: string) {
    if (scenarioPhase.kind !== 'ready') return;
    const at = scenarioPhase.entry, step = now.step, log = [...sent];
    const scope = new StateScope();
    leaveStep({ kind: 'resting', scope });
    stage.setAttribute('aria-busy', 'true');
    // On a phone the picture is shown whole while the reader explores.
    if (narrow() && zoom.k > 1) zoom.reset();
    return scope.run(function* () {
      const container = el('div');
      let shown: SceneStateLike | undefined;
      if (animated && log.length) {
        const sink = new ReaderSink(container, sinkOptions(at, true), readerView, scope.signal, narrow);
        const run = yield* wait(liveRun(at, now, log, {
          animate: sink,
          onStart: () => { stage.replaceChildren(...container.childNodes); zoom.apply(); },
        }));
        shown = run.shown as SceneStateLike;
        const key = `${step.step}\n${log.join('\n')}`;
        at.resting.set(key, clones(stage.querySelectorAll(':scope>svg')));
        at.said.set(key, shown);
      } else {
        shown = yield* wait(restingPicture(at, step, now, log, container, scope));
        const old = reduced() ? stage.querySelector('svg') : null;
        old?.classList.add('leaving');
        old?.addEventListener('animationend', () => old.remove());
        stage.replaceChildren(...container.childNodes, ...(old ? [old] : []));
        zoom.apply();
      }
      stage.removeAttribute('aria-busy');
      const before = describedShown;
      describePicture(step, shown);
      // What the event changed of the picture, or the whole picture when no description changed.
      const change = pictureChange(before, describedShown);
      liveSaid.textContent = what === undefined ? t.resetSaid : t.sentSaid(what, change ? `${change}.` : summary.textContent ?? '');
      liveRow.dataset.landed = encodeLog(log);
      document.dispatchEvent(new CustomEvent('rayner:sent', { detail: { step: step.step, sent: log, settings: values } }));
      primeNext(at);
    });
  }
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Forward the way the author wrote it: play the step, then rest on its last frame. */
  async function advance() {
    if (scenarioPhase.kind === 'loading') return;
    const target = adjacentStep(trace.steps, selected, 1);
    if (target === selected) return;
    revealStage();
    // A source run cannot animate across omitted reference steps without flashing them.
    if (reduced() || target !== selected + 1) return show(target);
    selected = target;
    sent = [];
    liveNow = null;
    drawLive();
    link(true);
    await animate(true);
  }
  /**
   * The current segment's fill while its step plays: the share of the step's motion the scene
   * has played, written at most once per animation frame, and only while that step is still
   * the one playing (a rest, a jump or Next mid-motion writes its own value in chrome()).
   */
  function fill(index: number, value: number) {
    playback.scope.frame(() => {
      if (isPlaying() && index === selected) bar.querySelector<HTMLButtonElement>(`button[data-index="${index}"]`)?.style.setProperty('--progress', String(Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1)) * 1000) / 1000));
    });
  }
  const clones = (nodes: Iterable<Node>) => Array.from(nodes, n => n.cloneNode(true));
  type Go = { scope: StateScope; target: Zoom | null };
  type Run = { at: Entry; index: () => number; release: (go: Go | null) => void; follow: () => boolean; cancel: () => void; done: Promise<boolean> };
  type Playback =
    | { kind: 'resting' | 'cancelled'; scope: StateScope }
    | { kind: 'primed' | 'playing' | 'following'; scope: StateScope; run: Run };
  let playback: Playback = { kind: 'cancelled', scope: new StateScope() };
  const isPlaying = () => playback.kind === 'playing' || playback.kind === 'following';
  function leaveStep(next: Playback) {
    const previous = playback;
    previous.scope.abort();
    if ('run' in previous && (!('run' in next) || previous.run !== next.run)) previous.run.cancel();
    sound?.stop();
    playback = next;
  }
  /**
   * Run the scene to a step's first frame and wait there. Released, it plays the step until
   * the hold, then runs on undrawn to the step's resting frame (the one a link to it shows)
   * and draws that; `done` says whether it got there.
   */
  function prepare(at: Entry, first: number): Run {
    let run!: Run;
    /** Where the run is headed: a step, its times, and a fresh drawing of it. */
    const aimAt = (index: number) => {
      const step = at.trace.steps[index]!,
        container = el('div'), scope = new StateScope(),
        sink = new ReaderSink(container, sinkOptions(at, true), readerView, scope.signal, narrow);
      return {
        index, scope, sink,
        start: step.t0,
        // Stop when the picture stops: the reader sets the pace instead of waiting through the caption-reading hold.
        end: step.hold ?? step.t1 ?? at.trace.duration,
        rest: restingTime(step, at.trace.fps),
        container,
        seek: new SeekSink(sink, step.t0),
      };
    };
    let aim = aimAt(first), release!: Run['release'];
    const gate = () => new Promise<Go | null>(r => { release = r; });
    let ready = gate();
    let finish!: (rested: boolean) => void;
    const result = new Promise<boolean>(r => { finish = r; });
    const cancel = () => {
      aim.scope.abort(new StopScene());
      release(null);
      ready = Promise.resolve(null);
      finish(false);
    };
    const attach = (go: Go, resting = false) => {
      const attached = stage.contains(aim.sink.svg);
      if (resting || !attached) stage.replaceChildren(...aim.container.childNodes);
      zoom.apply();
      if (!attached && go.target) go.scope.frame(() => zoom.to(go.target!, true));
    };
    const runner = new at.Scene({
      async stepBegin() {
        aim.scope.signal.throwIfAborted();
        if (playback.kind === 'primed') await new Promise(r => setTimeout(r));
      },
      async frame(scene, dt) {
        aim.scope.signal.throwIfAborted();
        if (scene.time + 1e-9 < aim.start) return;
        if (dt === 0 && scene.mobjects.length === 0) return;
        const go = await ready;
        if (!go) throw new StopScene();
        return go.scope.run(function* () {
          if (scene.time > aim.end + 1e-8) {
            if (scene.time + 1e-9 < aim.rest) return;
            yield* wait(new ReaderSink(aim.container, sinkOptions(at, false), readerView, go.scope.signal, narrow).frame(scene, 0));
            attach(go, true);
            finish(true);
            throw new StopScene();
          }
          yield* wait(aim.seek.frame(scene, dt));
          attach(go);
          playback = {kind:'playing', scope:go.scope, run};
          fill(aim.index, (scene.time - aim.start) / (aim.end - aim.start));
        });
      },
    }, { skipUntil: aim.start });
    const done = runner.run().then(() => { finish(false); return result; });
    const follow = () => {
      if (playback.kind !== 'playing' || !stage.contains(aim.sink.svg) || aim.index + 1 >= at.trace.steps.length) return false;
      aim = aimAt(aim.index + 1);
      runner.skipUntil = aim.start;
      ready = gate();
      return true;
    };
    run = {
      at, index: () => aim.index,
      release: g => {
        if (g) {
          const scope = aim.scope;
          g.scope.signal.addEventListener('abort', () => scope.abort(new StopScene()), { once: true });
          if (g.scope.signal.aborted) scope.abort(new StopScene());
        }
        release(g);
      },
      follow, cancel, done,
    };
    return run;
  }

  /** Once the reader is on a step, run the scene to the next one, so Next starts at once. */
  function primeNext(at: Entry) {
    const index = adjacentStep(at.trace.steps, selected, 1), scope = playback.scope;
    if (index === selected || index >= at.trace.steps.length || reduced()) return;
    void scope.run(function* () {
      yield* wait(new Promise<void>(r => setTimeout(r)));
      const run = prepare(at, index);
      playback = { kind: 'primed', scope, run };
      run.done.catch(() => { }); // reported when used
    });
  }
  async function animate(force = false) {
    if (scenarioPhase.kind === 'loading') return;
    if (isPlaying() && !force) return show(selected, false);
    if (reduced()) { notice.textContent = t.reducedMotion; return show(selected, false); }
    const at = scenarioPhase.entry, step = currentStep(), previous = playback;
    const available = 'run' in previous ? previous.run : undefined;
    const followed = available?.at === at && available.index() === selected - 1 && available.follow();
    const run = followed ? available! : previous.kind === 'primed' && available?.at === at && available.index() === selected ? available : prepare(at, selected);
    const scope = new StateScope();
    leaveStep({ kind: followed ? 'following' : 'playing', scope, run });
    chrome();
    return scope.run(function* () {
      const target = yield* wait(framing(step, scope, at));
      run.release({ scope, target: target ?? null });
      const rested = yield* wait(run.done);
      if (!rested) return show(selected, false);
      at.resting.set(step.step, clones(stage.querySelectorAll(':scope>svg')));
      playback = { kind: 'resting', scope };
      chrome();
      liveNow = yield* wait(liveAt(at, step));
      drawLive();
      if (liveNow) liveRow.dataset.landed = '';
      yield* settle(step, null, at, scope);
    });
  }
  /**
   * Show a scenario. Until its trace is ready the player keeps showing (and linking to) the
   * scenario it has, so navigation meanwhile stays consistent; a newer load supersedes this one.
   * `step` may be a function, captured before loading freezes child navigation.
   */
  async function load(request: Settings, step?: string | (() => string | undefined), push = false, log: readonly string[] = []) {
    if (scenarioPhase.kind === 'loading') scenarioPhase.scope.abort();
    const scope = new StateScope();
    const history: ScenarioHistory = typeof step === 'function' ? {kind:'keep-step',name:step()} :
      step ? {kind:'step',name:step} : {kind:'first'};
    scenarioPhase = { kind: 'loading', scope };
    leaveStep({ kind: 'cancelled', scope: playback.scope });
    return scope.run(function* () {
      root.classList.add('loading');
      let next: Settings,
        fallback = '';
      try {
        next = resolveSettings(Source, request);
      } catch (error) {
        next = resolveSettings(Source);
        fallback = t.fallback(settingsProblem(Source, request, error));
      }
      wanted = next;
      for (const [id, inputs] of choices) for (const input of inputs) input.checked = input.value === next[id];
      const key = JSON.stringify(next);
      let entry = cache.get(key);
      if (!entry) {
        const Scene = withSettings(Bound, next),
          { trace, scene } = yield* wait(traceRun(Scene));
        entry = { Scene, trace, palette: paletteOf(scene), paper: paperOf(scene), resting: new Map(), live: liveSteps(scene), bases: new Map(), said: new Map() };
        cache.set(key, entry);
      }
      const name = history.kind === 'first' ? undefined : history.name;
      scenarioPhase = { kind: 'ready',entry };
      // Zoom keeps its place across steps, including Back and Forward within a scenario.
      const changed = !values || JSON.stringify(values) !== key;
      values = next;
      wanted = undefined;
      trace = entry.trace;
      // Apply this scenario's validated cues, clearing any cue inherited from the previous scenario.
      for (const [property, value] of Object.entries(playerProperties(Source.meta?.player, entry.palette)))
        document.documentElement.style.setProperty(property, value);
      if (changed) {
        zoom.reset();
        lastStory = firstMain();
        detailDisclosure.open = false;
      }
      selected = name ? trace.steps.findIndex((s) => s.step === name) : firstMain();
      // A previous scenario's fallback must not describe the restored scenario; both of this one's show.
      const notices = fallback ? [fallback] : [];
      let events = name ? log : [];
      if (selected < 0) {
        selected = firstMain();
        notices.push(t.noStep(name!));
        events = [];
      }
      notice.textContent = notices.join(' ');
      // Each step's title and its line. The current step is marked by colour and a filled
      // number, not by weight, so no item changes size as the reader steps.
      const buttons = trace.steps.map((step, i) => {
        const li = el('li'), b = el('button'), words = stepWords(step);
        b.append(el('span', words.title, 'title'));
        if (words.line) b.append(el('span', words.line, 'line'));
        b.type = 'button'; b.dataset.step = step.step; b.dataset.index = String(i);
        b.addEventListener('click', () => void show(i)); li.append(b); return li;
      });
      steps.replaceChildren(...buttons.filter((_, i) => !isDetail(i)));
      detailSteps.replaceChildren(...buttons.filter((_, i) => isDetail(i)));
      detailDisclosure.hidden = !detailSteps.childElementCount;
      railSummary.textContent = t.allSteps(mainIndices().length);
      bar.style.setProperty('--segments', String(mainIndices().length)); // its least width (embed.css)
      bar.replaceChildren(...mainIndices().map((i, ordinal, all) => {
        const step = trace.steps[i]!, li = el('li'), b = el('button'), label = stepWords(step).title;
        b.type = 'button'; b.dataset.step = step.step; b.dataset.index = String(i); b.title = label;
        b.setAttribute('aria-label', t.stepOf(ordinal + 1, all.length, label));
        b.append(el('span', undefined, 'fill'));
        // Another segment jumps to its step; the current one rests a playing step immediately.
        b.addEventListener('click', () => void (i !== selected ? show(i) : isPlaying() && animate()));
        li.append(b); return li;
      }));
      const shown = new URLSearchParams(values).toString();
      for (const section of transcript.querySelectorAll<HTMLElement>('section')) section.hidden = section.dataset.scenario !== shown;
      shownScenario = shown;
      reserve();
      yield* wait(show(selected, push, events));
    });
  }
  for (const type of ['click', 'wheel', 'dblclick', 'pointerdown', 'pointermove']) root.addEventListener(type, event => {
    if (type === 'wheel' && !(event as WheelEvent).ctrlKey) return;
    if (scenarioPhase.kind === 'loading' && (event.target as Element).closest('.stage,button')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, {capture:true,passive:false});
  const previous = () => {
    if (scenarioPhase.kind === 'loading') return;
    const target = adjacentStep(trace.steps, selected, -1);
    if (target !== selected) void show(target);
  };
  prev.onclick = previous;
  backToStory.onclick = () => void show(lastStory);
  // On the last step Next rests the step while it plays, and at rest starts again from step 1.
  next.onclick = () => {
    if (scenarioPhase.kind==='ready' && adjacentStep(trace.steps, selected, 1) === selected) void (isPlaying() ? animate() : show(firstMain()));
    else void advance();
  };
  tryScenario.onclick = () => {
    // The button goes once the new scenario shows its first step; Next keeps the focus.
    next.focus();
    void load({ ...values, [firstSetting!.id]: nextOption().value }, undefined, true);
  };
  // Inside the step bar, arrows move a step and Home and End go to the ends; focus follows the
  // current segment (a roving Tab stop). The root's arrows skip buttons, so the bar has its own.
  bar.addEventListener('keydown', (e) => {
    if (scenarioPhase.kind==='loading') return;
    const first = firstMain(), last = mainIndices().at(-1)!;
    const keys: Record<string, () => unknown> = {
      ArrowRight: () => advance(),
      ArrowLeft: previous,
      Home: () => selected !== first && show(first),
      End: () => selected !== last && show(last),
    };
    const action = keys[e.key];
    if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    void action();
    bar.querySelector<HTMLButtonElement>('[aria-current=step]')?.focus();
  });
  enlarge.onclick = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      await player.requestFullscreen();
      // Phones read a 16:9 stage best sideways; not every browser allows the lock.
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await orientation.lock?.('landscape').catch(() => {});
    }
  };
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === player;
    setIcon(enlarge, on ? t.exitFullScreen : t.enlarge, on ? 'fit' : 'enlarge');
    enlarge.setAttribute('aria-pressed', String(on));
    zoom.apply();
  });
  // A page `site:export --origin` published names <origin><path>/<id>/ here: each step of the
  // default scenario with a path-safe name has a share page there, whose link preview is that step.
  const shared = document.querySelector<HTMLMetaElement>(`meta[name="${SHARE_META}"]`)?.content;
  const sharedSteps = document.querySelector<HTMLMetaElement>(`meta[name="${SHARE_STEPS_META}"]`)?.content.split(/\s+/);
  copy.onclick = async () => {
    if (scenarioPhase.kind==='loading') return;
    const url = urlFor(true);
    // A share page shows a step's own picture, so a link with the reader's events is the page's own.
    const step = currentStep().step,
      share = shared && !sent.length && shareable(step) && (!sharedSteps || sharedSteps.includes(step)) && JSON.stringify(values) === JSON.stringify(resolveSettings(Source)) ? shared + step : url.href;
    try {
      await navigator.clipboard.writeText(share);
      notice.textContent = t.copied;
    } catch {
      notice.textContent = share;
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (scenarioPhase.kind === 'loading') return;
    const tag = (e.target as HTMLElement).tagName;
    if (['SELECT', 'INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SUMMARY'].includes(tag) || e.ctrlKey || e.metaKey) return;
    // Zoom keys act only on the focused stage, so they never take a key from the page; once
    // zoomed, the focused stage's arrows pan, a tenth of the stage at a time.
    const onStage = e.target === stage,
      pan = (dx: number, dy: number) => () => zoom.pan((dx * stageSize(stage)[0]) / 10, (dy * stageSize(stage)[1]) / 10);
    const keys: Record<string, () => void> =
      onStage && zoom.k > 1
        ? { ArrowLeft: pan(1, 0), ArrowRight: pan(-1, 0), ArrowUp: pan(0, 1), ArrowDown: pan(0, -1) }
        : {
            ArrowRight: () => void advance(),
            // Like the Previous button, which is disabled on the first step.
            ArrowLeft: previous,
          };
    if (onStage)
      Object.assign(keys, {
        '+': () => zoom.zoomAt(1.6),
        '=': () => zoom.zoomAt(1.6),
        '-': () => zoom.zoomAt(1 / 1.6),
        '0': () => whole(false),
      });
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };
  root.addEventListener('keydown', onKey);
  // Before the reader clicks anything, keys go to the body, outside the tile: the arrows step from
  // the moment the page loads. In a frame the frame only receives keys once it has focus, so this
  // never takes a key from the host page.
  document.addEventListener('keydown', (e) => {
    if (e.target === document.body || e.target === document.documentElement) onKey(e);
  });
  // Focusable for the arrow keys once clicked, but not a Tab stop: its focus is not drawn.
  root.tabIndex = -1;
  const fromURL = () => {
    const q = new URLSearchParams(location.search);
    const request: Record<string, string> = {};
    for (const s of Source.settings ?? []) if (q.has(s.id)) request[s.id] = q.get(s.id)!;
    return { request, step: q.get('step') ?? undefined, sent: decodeLog(q.get(SENT)) };
  };
  // A host page drives the player through the loader (specs/player-guidance.md G4): a step by name
  // and settings by id, validated as the URL's are (an undeclared id is ignored, as in a URL; an
  // unknown value falls back with the same notice). Given settings replace those of the scenario on
  // show; a request without a step keeps the step by name. It replaces the frame's history entry.
  const toHost = connectHost((request) => {
    const given: Record<string, string> = {};
    for (const s of Source.settings ?? []) if (request.settings && Object.hasOwn(request.settings, s.id)) given[s.id] = request.settings[s.id]!;
    void load({ ...(wanted ?? values), ...given }, request.step ?? (() => trace?.steps[selected]?.step), false);
  });
  window.addEventListener('popstate', () => {
    const q = fromURL();
    void load(q.request, q.step, false, q.sent);
  });
  const q = fromURL();
  await load(q.request, q.step, false, q.sent);
}
