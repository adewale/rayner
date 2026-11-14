// The explainer layer's internal interface: what the player (app/), the rayner command (tools/) and
// diagram capture (integrations/) import from explain/ that no entry point exports. They import the
// layer through its entry points and this module only (test/layers.test.ts), so every name they depend
// on beyond the public API is listed here, where a change to it can be seen. Not an entry point: the
// package does not export it, and the command reaches it by its private specifier (docs/ENGINE.md, "Layers").
export { stepAudio } from './audio.ts';
export { captionLookProblems } from './caption-looks.ts';
export { checkClaimsMeta, claimsReport } from './claims.ts';
export { describeScenario, restingDrawing } from './describe.ts';
export { RENDERER, SVG_PX_PER_UNIT, diagramKey } from './diagram-snapshot.ts';
export type { ChartData, SnapshotPart, SnapshotShape, SnapshotTextRun } from './diagram-snapshot.ts';
export { importedText, outlineText } from './diagram-text.ts';
export { diagramsOn, isDiagramConnector } from './diagrams.ts';
export { labelOf, readingLabelSize } from './labels.ts';
export { LiveSink, liveBase, liveMachine, liveSteps, runLive } from './live.ts';
export { machinesOf } from './machine.ts';
export type { Live, LiveDraw, LiveExplore, LivePlace, LiveRun, LiveSession, LogStart } from './live.ts';
export { describesItself, emphasisOf, newlyEmphasised, openingOf, seenSource } from './look.ts';
export { PAGE_QUERY } from './page-query.ts';
export { adoptExplainer, readSnapshotStore, sceneIdOf, scriptOf, traceScenarios } from './project.ts';
export { checkScriptMeta, isDetail, normalise, offPath, predictionsOf, scriptReport, teachingIndices } from './script.ts';
export type { Prediction, TeachingStep } from './script.ts';
export { bindSnapshots, isIdentifier, scenarioName, scenariosOf, settingsProblem, stepQuery } from './settings.ts';
export type { SettingsProblem } from './settings.ts';
export { isFurniture, isHeading, paletteOf, paperOf, withoutHeading } from './stage.ts';
export { checkWatch, htmlEscape, pictureChange, pictureHtml, pictureSummary, stepWords, undescribed, watchedChanges, wordsHtml } from './trace.ts';
export type { WatchedChange } from './trace.ts';
export { isView, viewMismatch } from './view.ts';
export { describedIn, primaryLanguage, wordsFor } from './words.ts';
