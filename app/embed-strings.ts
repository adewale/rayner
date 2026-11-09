// The page's own words (player controls, notices, transcript headings), by the language of
// the scene (`meta.lang`). A language without a table here gets English. The generated picture
// descriptions have their own vocabulary (explain/words.ts); a page in a language it lacks
// shows them in English and marks them lang="en".
import type { ExplainerClass, Settings } from '../explain/index.ts';
import type { SettingsProblem, WatchedChange } from '../explain/internal.ts';
import { scenarioName } from '../explain/testing.ts';
import { describedIn, primaryLanguage, wordsFor } from '../explain/internal.ts';
export type { SettingsProblem } from '../explain/internal.ts';


export interface Chrome {
  details: string;
  backToStory: string;
  /** Back to the explanation's visible word, short so the stepper row never wraps; its name and tooltip stay backToStory. */
  backToStoryShort: string;
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
  /** The footer's way out of a frame: this page, at the reader's step and scenario, in a new tab. */
  open: string;
  /** The loader's name for the frame when the host gives none. */
  frame: string;
  reducedMotion: string;
  copied: string;
  /** A notice when the URL names a step this scenario does not have. */
  noStep: (step: string) => string;
  /** A notice when the URL's settings are invalid. */
  fallback: (problem: SettingsProblem) => string;
  /** A notice when the scenario the reader chose could not be shown, so the player keeps the one it had. */
  scenarioFailed: string;
  /** The stage's accessible name: the explainer's title, the step's, and the line under it. */
  stageLabel: (title: string, step: string, line: string) => string;
  /** "Label: option", the way a scenario is named in headings. */
  setting: (label: string, option: string) => string;
  transcript: string;
  sources: string;
  /** What the explainer's model is checked against, from its script, first under Sources. */
  checkedAgainst: (what: string) => string;
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
  tryScenario: (label: string) => string;
  /** The footer's one quiet line on how to move: with a keyboard and pointer, or by touch. */
  hintKeys: string;
  hintTouch: string;
  /** A rail entry for a step the reader has not reached: its title stays hidden until then. */
  notYet: (i: number) => string;
  /** The heading over the scene's reader questions after the last step, and in the transcript. */
  checkYourself: string;
  /** Under the reader questions' heading: answer before opening. */
  questionsHint: string;
  /** The disclosure that holds a reader question's answer. */
  showAnswer: string;
  /** Accessible name of a live step's event buttons (docs/MACHINES.md, "The player"). */
  liveControls: string;
  /** Over the event buttons: sending from the step's picture, or again from the machine's start. */
  liveFromRest: string;
  liveFromStart: string;
  /** Takes back the last event sent. */
  undo: string;
  /** Clears the events sent: the step's own picture again. */
  reset: string;
  resetLabel: string;
  /** A refused event's reason when the model gives none. */
  notPossible: string;
  /** An event past where the explainer's story stops, with the story's reason. */
  storyStops: (reason: string) => string;
  /** Announced after an event: the event, then the picture it lands on. */
  sentSaid: (event: string, picture: string) => string;
  /** Announced when a refused event's button is pressed: the event and why. */
  refusedSaid: (event: string, reason: string) => string;
  /** Announced after Reset. */
  resetSaid: string;
  /** A notice when a link's events stop at one the machine does not take there. */
  sentFallback: (event: string, reason: string) => string;
  /** A notice when a link sends events to a step without a machine. */
  notLive: string;
  /** The transcript's line of a live step: the events a reader can send there. */
  liveEvents: (events: string, fromStart: boolean) => string;
}

const EN: Chrome = {
  details: 'Details and sources',
  backToStory: 'Back to the explanation',
  backToStoryShort: 'Back',
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
  noStep: (step) => `This scenario has no “${step}” step, so it opens at the first step.`,
  fallback: (p) =>
    `${p.kind === 'option' ? `The setting “${p.label}” has no option “${p.value}”` : p.kind === 'setting' ? `This explanation has no setting “${p.id}”` : p.message}. Showing the default scenario.`,
  scenarioFailed: 'That scenario could not be shown, so the player keeps the one it had.',
  stageLabel: (title, step, line) => `${title}: ${step}${line ? ` — ${line}` : ''}`,
  setting: (label, option) => `${label}: ${option}`,
  transcript: 'Transcript',
  sources: 'Sources',
  checkedAgainst: (what) => `The model is checked against: ${what}`,
  failed: 'The interactive player could not start. The transcript is available below.',
  changed: 'What changed',
  yes: wordsFor('en').yes,
  no: wordsFor('en').no,
  removed: 'removed',
  changes: (...items) => `What changed: ${items.join('; ')}`,
  startAgain: 'Start again',
  startAgainLabel: 'Start again from step 1',
  tryScenario: (label) => `Try ‘${label}’`,
  hintKeys: '← → to step · click a segment to jump',
  hintTouch: 'Tap a segment to jump; tap the current one to finish it',
  notYet: (i) => `Step ${i}`,
  checkYourself: 'Check yourself',
  questionsHint: 'Answer each one before you open it.',
  showAnswer: 'Show the answer',
  liveControls: 'Try it yourself',
  liveFromRest: 'Try it yourself: carry on from this picture',
  liveFromStart: 'Try it yourself, from the beginning',
  undo: 'Undo',
  reset: 'Reset',
  resetLabel: 'Reset: the step’s own picture',
  notPossible: 'Not possible here',
  storyStops: (reason) => `The story stops here: ${reason}`,
  sentSaid: (event, picture) => `${event}. ${picture}`,
  refusedSaid: (event, reason) => `${event}: ${reason}`,
  resetSaid: 'Back to the step’s own picture.',
  sentFallback: (event, reason) => `This link’s event “${event}” cannot be sent there (${reason}), so the picture stops before it.`,
  notLive: 'This step has no events to send, so the link’s events are left out.',
  liveEvents: (events, fromStart) => `Try it yourself: ${fromStart ? 'from the beginning, press ' : 'press '}${events}.`,
};
/** French typography: a narrow no-break space (U+202F) before : ; ! ? and inside « ». */
const FR: Chrome = {
  details: 'Détails et sources',
  backToStory: 'Revenir à l’explication',
  backToStoryShort: 'Retour',
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
  noStep: (step) => `Ce scénario n’a pas d’étape « ${step} » : il s’ouvre à la première étape.`,
  fallback: (p) =>
    `${
      p.kind === 'option'
        ? `Le réglage « ${p.label} » n’a pas d’option « ${p.value} »`
        : p.kind === 'setting'
          ? `Cette explication n’a pas de réglage « ${p.id} »`
          : 'Les réglages de l’adresse ne sont pas valides'
    }. Le scénario par défaut est affiché.`,
  scenarioFailed: 'Ce scénario n’a pas pu être affiché\u202f: le lecteur garde le précédent.',
  stageLabel: (title, step, line) => `${title} : ${step}${line ? ` — ${line}` : ''}`,
  setting: (label, option) => `${label} : ${option}`,
  transcript: 'Transcription',
  sources: 'Sources',
  checkedAgainst: (what) => `Le modèle est vérifié par\u202f: ${what}`,
  failed: 'Le lecteur interactif n’a pas pu démarrer. La transcription se trouve plus bas.',
  changed: 'Ce qui a changé',
  yes: wordsFor('fr').yes,
  no: wordsFor('fr').no,
  removed: 'supprimé',
  changes: (...items) => `Ce qui a changé\u202f: ${items.join('\u202f; ')}`,
  startAgain: 'Recommencer',
  startAgainLabel: 'Recommencer à l’étape 1',
  tryScenario: (label) => `Essayer «\u202f${label}\u202f»`,
  hintKeys: '← → pour changer d’étape · cliquez un segment pour y aller',
  hintTouch: 'Touchez un segment pour y aller\u202f; touchez celui en cours pour le terminer',
  notYet: (i) => `Étape ${i}`,
  checkYourself: 'Vérifiez vos connaissances',
  questionsHint: 'Répondez à chaque question avant d’ouvrir la réponse.',
  showAnswer: 'Voir la réponse',
  liveControls: 'À vous de jouer',
  liveFromRest: 'À vous de jouer\u202f: continuez à partir de cette image',
  liveFromStart: 'À vous de jouer, depuis le début',
  undo: 'Annuler',
  reset: 'Réinitialiser',
  resetLabel: 'Réinitialiser\u202f: l’image de l’étape',
  notPossible: 'Impossible ici',
  storyStops: (reason) => `L’histoire s’arrête ici\u202f: ${reason}`,
  sentSaid: (event, picture) => `${event}. ${picture}`,
  refusedSaid: (event, reason) => `${event}\u202f: ${reason}`,
  resetSaid: 'Retour à l’image de l’étape.',
  sentFallback: (event, reason) => `L’événement «\u202f${event}\u202f» de ce lien ne peut pas être envoyé là (${reason})\u202f: l’image s’arrête avant lui.`,
  notLive: 'Cette étape n’a pas d’événements à envoyer\u202f: ceux du lien sont ignorés.',
  liveEvents: (events, fromStart) => `À vous de jouer\u202f: ${fromStart ? 'depuis le début, appuyez sur ' : 'appuyez sur '}${events}.`,
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
/** A scenario's name, "Label: option · Label: option", with the language's punctuation. */
export const scenarioNameIn = (lang: string, Scene: ExplainerClass, values: Settings): string =>
  scenarioName(Scene, values, chromeFor(lang).setting);
/** One watched change as a reader reads it: "Tokens: 5 → 0", "Tokens: 5" (it appeared), "Tokens: removed". */
export const changeText = (t: Chrome, c: WatchedChange): string =>
  t.setting(c.label, c.after === undefined ? t.removed : c.before === undefined ? c.after : `${c.before} → ${c.after}`);
