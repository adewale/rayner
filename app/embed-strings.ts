// The page's own words (player controls, notices, transcript headings), by the language of
// the scene (`meta.lang`). A language without a table here gets English. The generated picture
// descriptions have their own vocabulary (explain/words.ts); a page in a language it lacks
// shows them in English and marks them lang="en".
import type { ExplainerClass, Settings } from '../explain/index.ts';
import { describedIn, primaryLanguage, wordsFor } from '../explain/words.ts';
import type { WatchedChange } from '../explain/trace.ts';

/** What is wrong with a URL's settings, so each language can say it in its own words. */
export type SettingsProblem =
  | { kind: 'option'; id: string; label: string; value: string }
  | { kind: 'setting'; id: string }
  /** Anything else the validator refuses, with its (English) message. */
  | { kind: 'other'; message: string };

export interface Chrome {
  details: string;
  backToStory: string;
  /** Accessible name of the player section. */
  player: string;
  /** The disclosure under the caption that lists what the picture shows. */
  picture: string;
  /** Accessible name of the controls. */
  controls: string;
  previous: string;
  nextLabel: string;
  /** The visible word on the Next button. */
  next: string;
  zoomOut: string;
  zoomIn: string;
  /** On a narrow stage: open each step on a close-up again, after Whole picture. */
  closeUp: string;
  /** The corner map's name: the step's next close-up, i of n. */
  nextCloseUp: (i: number, n: number) => string;
  viewCount: (i: number, n: number) => string;
  nextView: string;
  /** The one button that shows the author's whole frame (and keeps it on a narrow stage). */
  wholePicture: string;
  viewHelp: string;
  copy: string;
  enlarge: string;
  exitFullScreen: string;
  /** Accessible name of the zoom, copy and enlarge buttons' group. */
  viewTools: string;
  /** Accessible name of the list of steps. */
  stepList: string;
  /** The steps list's visible heading beside the card. */
  steps: string;
  /** The steps list's disclosure under the card, on a narrow page. */
  allSteps: (n: number) => string;
  /** Accessible name of the step bar. */
  stepBar: string;
  /** "Step 3 of 4", the step heading's kicker; with a title, a step bar segment's name. */
  stepOf: (i: number, n: number, title?: string) => string;
  /** The footer mark's accessible name; its visible text is the name "Rayner", never translated. */
  madeWith: string;
  /** The footer's way out of a frame: this page, at the reader's step and case, in a new tab. */
  open: string;
  /** The loader's name for the frame when the host gives none. */
  frame: string;
  reducedMotion: string;
  copied: string;
  /** A notice when the URL names a step this case does not have. */
  noStep: (step: string) => string;
  /** A notice when the URL's settings are invalid. */
  fallback: (problem: SettingsProblem) => string;
  /** The stage's accessible name: the explainer's title, the step's, and the line under it. */
  stageLabel: (title: string, step: string, line: string) => string;
  /** "Label: option", the way a case is named in headings. */
  setting: (label: string, option: string) => string;
  transcript: string;
  sources: string;
  /** Shown when the player cannot start, above the transcript. */
  failed: string;
  /** The quiet label before a step's changes to the state its author watches (`meta.watch`). */
  changed: string;
  /** A boolean watched value; the same words as the descriptions' (explain/words.ts). */
  yes: string;
  no: string;
  /** A watched value the step took away. */
  removed: string;
  /** The transcript's line of a step's changes: "What changed: Tokens: 5 → 0; Allowed: 0 → 5". */
  changes: (...items: string[]) => string;
  /** At rest on the last step, Next's visible word, and its accessible name. */
  startAgain: string;
  startAgainLabel: string;
  /** At rest on the last step of a scene with settings: show the next option of its first setting. */
  tryCase: (label: string) => string;
  /** The footer's one quiet line on how to move: with a keyboard and pointer, or by touch. */
  hintKeys: string;
  hintTouch: string;
  /** A rail entry for a step the reader has not reached: its title stays hidden until then. */
  notYet: (i: number) => string;
  /** The heading over the scene's check questions after the last step, and in the transcript. */
  checkYourself: string;
  /** Under the check questions' heading: answer before opening. */
  checkHint: string;
  /** The disclosure that holds a check question's answer. */
  showAnswer: string;
}

const EN: Chrome = {
  details: 'Details and sources',
  backToStory: 'Back to the explanation',
  player: 'Explainer',
  picture: 'What the picture shows',
  controls: 'Steps',
  previous: 'Previous step',
  nextLabel: 'Next step',
  next: 'Next',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  closeUp: 'Close-up of each step',
  nextCloseUp: (i, n) => `Next close-up of this step (${i} of ${n})`,
  viewCount: (i, n) => `View ${i} of ${n}`,
  nextView: 'Next view',
  wholePicture: 'Whole picture',
  viewHelp: 'Next view explores this picture. Next step continues the explanation.',
  copy: 'Copy link',
  enlarge: 'Enlarge',
  exitFullScreen: 'Exit full screen',
  viewTools: 'View tools',
  stepList: 'Steps in this explainer',
  steps: 'Steps',
  allSteps: (n) => `All ${n} steps`,
  stepBar: 'Step progress',
  stepOf: (i, n, title) => `Step ${i} of ${n}${title ? `: ${title}` : ''}`,
  madeWith: 'Made with Rayner',
  open: 'Open the explainer',
  frame: 'Interactive explainer',
  reducedMotion: 'Reduced motion is on, so the finished step is shown.',
  copied: 'Link copied.',
  noStep: (step) => `This case has no “${step}” step, so it opens at the first step.`,
  fallback: (p) =>
    `${p.kind === 'option' ? `Unknown ${p.id} option: ${p.value}` : p.kind === 'setting' ? `Unknown setting: ${p.id}` : p.message}. Showing the default case.`,
  stageLabel: (title, step, line) => `${title}: ${step}${line ? ` — ${line}` : ''}`,
  setting: (label, option) => `${label}: ${option}`,
  transcript: 'Transcript',
  sources: 'Sources',
  failed: 'The interactive player could not start. The transcript is available below.',
  changed: 'What changed',
  yes: wordsFor('en').yes,
  no: wordsFor('en').no,
  removed: 'removed',
  changes: (...items) => `What changed: ${items.join('; ')}`,
  startAgain: 'Start again',
  startAgainLabel: 'Start again from step 1',
  tryCase: (label) => `Try ‘${label}’`,
  hintKeys: '← → to step · click a segment to jump',
  hintTouch: 'Tap a segment to jump; tap the current one to finish it',
  notYet: (i) => `Step ${i}`,
  checkYourself: 'Check yourself',
  checkHint: 'Answer each one before you open it.',
  showAnswer: 'Show the answer',
};
/** French typography: a narrow no-break space (U+202F) before : ; ! ? and inside « ». */
const FR: Chrome = {
  details: 'Détails et sources',
  backToStory: 'Revenir à l’explication',
  player: 'Explication',
  picture: 'Ce que montre l’image',
  controls: 'Étapes',
  previous: 'Étape précédente',
  nextLabel: 'Étape suivante',
  next: 'Suivant',
  zoomOut: 'Zoom arrière',
  zoomIn: 'Zoom avant',
  closeUp: 'Gros plan sur chaque étape',
  nextCloseUp: (i, n) => `Gros plan suivant de cette étape (${i} sur ${n})`,
  viewCount: (i, n) => `Vue ${i} sur ${n}`,
  nextView: 'Vue suivante',
  wholePicture: 'Image entière',
  viewHelp: 'Vue suivante explore cette image. Étape suivante poursuit l’explication.',
  copy: 'Copier le lien',
  enlarge: 'Plein écran',
  exitFullScreen: 'Quitter le plein écran',
  viewTools: 'Outils d’affichage',
  stepList: 'Étapes de cette explication',
  steps: 'Étapes',
  allSteps: (n) => `Les ${n} étapes`,
  stepBar: 'Progression des étapes',
  stepOf: (i, n, title) => `Étape ${i} sur ${n}${title ? ` : ${title}` : ''}`,
  madeWith: 'Réalisé avec Rayner',
  open: 'Ouvrir l’explication',
  frame: 'Explication interactive',
  reducedMotion: 'Les animations sont réduites : l’étape s’affiche terminée.',
  copied: 'Lien copié.',
  noStep: (step) => `Ce cas n’a pas d’étape « ${step} » : il s’ouvre à la première étape.`,
  fallback: (p) =>
    `${
      p.kind === 'option'
        ? `Le réglage « ${p.label} » n’a pas d’option « ${p.value} »`
        : p.kind === 'setting'
          ? `Cette explication n’a pas de réglage « ${p.id} »`
          : 'Les réglages de l’adresse ne sont pas valides'
    }. Le cas par défaut est affiché.`,
  stageLabel: (title, step, line) => `${title} : ${step}${line ? ` — ${line}` : ''}`,
  setting: (label, option) => `${label} : ${option}`,
  transcript: 'Transcription',
  sources: 'Sources',
  failed: 'Le lecteur interactif n’a pas pu démarrer. La transcription se trouve plus bas.',
  changed: 'Ce qui a changé',
  yes: wordsFor('fr').yes,
  no: wordsFor('fr').no,
  removed: 'supprimé',
  changes: (...items) => `Ce qui a changé\u202f: ${items.join('\u202f; ')}`,
  startAgain: 'Recommencer',
  startAgainLabel: 'Recommencer à l’étape 1',
  tryCase: (label) => `Essayer «\u202f${label}\u202f»`,
  hintKeys: '← → pour changer d’étape · cliquez un segment pour y aller',
  hintTouch: 'Touchez un segment pour y aller\u202f; touchez celui en cours pour le terminer',
  notYet: (i) => `Étape ${i}`,
  checkYourself: 'Vérifiez vos connaissances',
  checkHint: 'Répondez à chaque question avant d’ouvrir la réponse.',
  showAnswer: 'Voir la réponse',
};
export const CHROME: Readonly<Record<string, Chrome>> = { en: EN, fr: FR };

/** The words for `lang`, or English when there is no table for it. */
export function chromeFor(lang = 'en'): Chrome {
  const primary = primaryLanguage(lang);
  return Object.hasOwn(CHROME, primary) ? CHROME[primary]! : EN;
}
/**
 * The lang attribute an element holding generated descriptions needs on a page in `lang`:
 * "en" when the descriptions have no words in that language, else none.
 */
export const descriptionsLang = (lang = 'en'): string | undefined =>
  describedIn(lang) === primaryLanguage(lang) ? undefined : describedIn(lang);
/** ` lang="en"` for an element holding generated descriptions in a language the page is not in, else nothing. */
export const descriptionLang = (lang = 'en') => {
  const tag = descriptionsLang(lang);
  return tag ? ` lang="${tag}"` : '';
};
/**
 * Why `resolveSettings` refused a URL's `values`, found the way it checks them: a declared
 * setting's unknown option first, then an undeclared setting.
 */
export function settingsProblem(Scene: ExplainerClass, values: Settings, error: unknown): SettingsProblem {
  for (const s of Scene.settings ?? []) {
    const value = Object.hasOwn(values, s.id) ? values[s.id]! : undefined;
    if (value !== undefined && !s.options.some((o) => o.value === value))
      return { kind: 'option', id: s.id, label: s.label, value };
  }
  const declared = new Set((Scene.settings ?? []).map((s) => s.id));
  const unknown = Object.keys(values).find((id) => !declared.has(id));
  return unknown !== undefined
    ? { kind: 'setting', id: unknown }
    : { kind: 'other', message: String((error as Error)?.message ?? error) };
}
/** A case's name, "Label: option · Label: option", with the language's punctuation. */
export function caseNameIn(lang: string, Scene: ExplainerClass, values: Settings): string {
  const t = chromeFor(lang);
  return (Scene.settings ?? [])
    .map((s) => t.setting(s.label, s.options.find((o) => o.value === values[s.id])?.label ?? values[s.id]!))
    .join(' · ');
}
/** One watched change as a reader reads it: "Tokens: 5 → 0", "Tokens: 5" (it appeared), "Tokens: removed". */
export const changeText = (t: Chrome, c: WatchedChange): string =>
  t.setting(c.label, c.after === undefined ? t.removed : c.before === undefined ? c.after : `${c.before} → ${c.after}`);
