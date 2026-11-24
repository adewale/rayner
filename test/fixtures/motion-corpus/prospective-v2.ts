// Prospective assessment only. Never amend CORPUS targets or the historical metric here.
// Declared from historical fix claims/current source and independent native proof,
// before opening this audit's detector receipts. Missing bindings stay unassessed.
import { CORPUS } from './corpus.ts';
import type { CorpusEntry } from './corpus.ts';

export interface FindingTarget {
  type: 'finding'; scenario: string; transition: RegExp; kind: string;
  path: string; subjects: readonly string[]; requirement?: 'present' | 'absent';
  victim?: string; masks?: readonly string[];
}
export interface RefusalTarget {
  type: 'refusal'; kind: 'duration guard' | 'authored pacing guard'; name: string;
  message: RegExp; event?: string;
}
export interface Target {
  version: string;
  basis: string;
  phase: string;
  finding?: FindingTarget;
  prevention?: RefusalTarget;
  /** A changed victim is a new observation, never a gain against an old target. */
  replacesObservation?: string;
}
export interface ProspectiveCase {
  id: string;
  claim: { actor: string; subject: string; phase: string; events: readonly string[] | 'all authored transitions' };
  source: string;
  targets: readonly Target[];
  unresolved?: string;
}

// Each row states observable intent independently of warnings. Broad claims such as
// "across the stage" do not invent a named victim; they require blind review first.
const claims: readonly (readonly [string, string, string, string])[] = [
  ["poppy-ticket-over-lane-names", "ticket", "lane names", "ticket traverses lane"],
  ["poppy-key-over-station-name", "key", "station name and lane names", "sign-in and sign-out flight"],
  ["poppy-last-object-lingers", "ticket", "previous exhibit and closed door", "next ticket in flight"],
  ["refusals-ticket-over-station", "ticket", "station", "launch from seal to lane"],
  ["refusals-ticket-over-lane-name", "ticket", "lane name", "ticket launch"],
  ["refusals-lanes-slide", "API lane", "API lane position", "MCP lane appears or disappears"],
  ["refusals-lanes-gone-in-flight", "ticket", "lane line", "ticket in flight after relay"],
  ["refusals-delegation-over-station", "delegation seal", "station name", "delegation arrives"],
  ["refusals-mcp-key-over-label", "MCP key", "for MCP", "key descends to hook"],
  ["refusals-key-over-lane-name", "refreshed key", "lane name", "return flight"],
  ["sessions-ticket-from-under-stamp", "ticket", "stamp", "ticket approaches stamp"],
  ["sessions-key-to-wax-after-check", "published key", "wax and resulting punches", "key transfer before ticket check"],
  ["sessions-key-in-two-places", "published key flight", "chain key", "transfer to wax"],
  ["sessions-squeezed", "tamper sequence", "authored event budget", "complete tamper transition"],
  ["sessions-too-long", "tamper sequence", "reader response interval", "complete tamper transition"],
  ["sign-in-ask-people-slide", "you and agent", "resting layout positions", "page opens"],
  ["sign-in-collect-people-slide", "you and agent", "resting layout positions", "page closes after collection"],
  ["sign-in-collect-too-long", "code and tokens", "reader response interval", "collect after successful approval"],
  ["sign-in-tokens-over-labels", "request and poll", "agent-side labels", "outgoing and returning held-device routes"],
  ["sign-in-password-before-card", "password card", "page password field", "second approval before card arrival"],
  ["sign-in-ask-squeezed", "request", "authored event budget", "ask transition"],
  ["sign-in-pages-overlap", "new page", "previous page", "new page enters"],
  ["sign-in-card-from-desk", "device card", "departure origin", "device card arrival"],
  ["sign-in-poll-over-card", "poll", "Example Company; separately versioned current example.com", "outgoing device poll crosses card"],
  ["sign-in-password-hand-and-flight", "password card flight", "password card in hand", "approval flight"],
  ["sign-in-code-tiny-words", "code slip", "c_5Rm2", "collect flight"],
  ["sign-in-password-route", "password card", "page edge", "approval route"],
  ["sign-in-tag-over-scopes", "returning tag", "scopes; key and cord lifetime", "sign-out or disconnect"],
  ["browser-ticket-over-road-name", "ticket", "agent’s requests", "agent road traversal"],
  ["browser-halves-together", "code and cookie half", "each other", "simultaneous departure from counter"],
  ["browser-read-across-page", "read code", "window content", "reading flight from page to seal"],
  ["browser-forge-across-stage", "forged stub", "page content", "forged stub crosses browser"],
  ["browser-message-across-stage", "attacker message", "unbound stage subjects", "message flight"],
  ["browser-message-lingers", "next event traveller", "declined message and no codes yet", "next event flight"],
  ["browser-submit-meet-on-top", "submitted code and cookie half", "each other at counter stop", "trip endpoints and session departure"],
  ["browser-forge-ends-on-stop", "forged stub", "counter stop and barrier", "arrival before barrier descends"],
  ["browser-record-after-halves", "code and cookie half", "company rack record", "record must precede distribution"],
  ["browser-read-over-its-copy", "read code", "resting page stub with same code", "reading launch"],
  ["browser-legend-moves", "rack legend", "legend position", "record row addition"],
  ["browser-attacker-over-shelf", "attacker travellers", "attacker shelf and name", "departure toward counter"],
  ["browser-read-tiny-words", "read code", "Vn3q", "authorize flight"],
  ["browser-forge-tiny-words", "forged code", "K9wd", "forge flight"],
  ["conversations-layout-slides", "relocated parts", "resting composition positions", "direct opens or closes"],
  ["conversations-turn-over-seat-name", "turn", "writer seat name", "turn launch"],
  ["conversations-words-dissolve", "ledger words", "whole readable words", "two authored sync transitions"],
  ["conversations-person-over-ledger", "joining person", "ledger rows", "person arrival"],
  ["conversations-table-block-blinks", "turn", "On the table heading and unchanged labels", "message flight"],
  ["conversations-block-crossfades", "On the table block", "unchanged heading and labels", "direct opens or closes"],
  ["coverage-strips-cross", "note strips", "other note strips", "sorting groups"],
  ["coverage-report-too-long", "report", "reader response interval", "report round trip"],
  ["coverage-skill-card-twice", "skill card flight", "skill card on hook", "trip to desk"],
  ["coverage-reach-over-strips", "secret request strip", "settled strips", "reach toward station"],
  ["coverage-desk-blinks", "desk", "unchanged desk words", "event transition"],
  ["coverage-user-line-blinks", "user speech", "unchanged user line", "event transition"],
  ["coverage-list-over-labels", "shop list", "counter labels", "board to tray flight"],
  ["discovery-arm-over-register", "issuer arm", "closed register", "arm drawn before register closes"],
  ["discovery-sheet-over-shop", "fetched sheet", "shop fascia and changing address", "fetch descent"],
  ["discovery-fetch-squeezed", "fetch document and barrier", "authored event budget", "fetch transition"],
  ["discovery-path-slides", "URL path", "URL path position", "redirect shortens host"],
];

function frozenTarget(entry: CorpusEntry): Target[] {
  const targets: Target[] = [];
  if (entry.expectedFinding) targets.push({version: `${entry.id}@historical`,
    basis: 'Unchanged original CORPUS exact finding; retained for comparison, not rederived from current output.',
    phase: 'original target transition', finding: {type: 'finding', ...entry.expectedFinding}});
  if (entry.expectedRefusal) targets.push({version: `${entry.id}@historical`,
    basis: 'Unchanged original CORPUS typed refusal; prevention only in v2.',
    phase: 'original authored pacing refusal', prevention: {type: 'refusal', ...entry.expectedRefusal}});
  return targets;
}

// Explicit source bindings: pass() names the travelling keyed root and the source
// fixes name these exact printed codes. No choice here depends on emitted warnings.
const sourceTargets: Readonly<Record<string, Target>> = {
  'sessions-squeezed': {version: 'sessions-squeezed@source-2026-11-22.1',
    basis: 'Historical 2d181ce5 mutation fixes the tamper budget at 2.6 seconds despite longer beats; published is an independently named key-transfer event.',
    phase: 'published tamper cannot fit declared budget', prevention: {type: 'refusal', kind: 'duration guard', name: 'RangeError', event: 'published',
      message: /^machine\.send\("published"\): authored transition lasts [\d.]+ s but the event allows 2\.600 s;/}},
  'sign-in-ask-squeezed': {version: 'sign-in-ask-squeezed@source-2026-11-22.1',
    basis: 'Historical 58b06e8e mutation sets ask to 2.2 seconds despite longer authored beats.',
    phase: 'ask cannot fit declared budget', prevention: {type: 'refusal', kind: 'duration guard', name: 'RangeError', event: 'ask',
      message: /^machine\.send\("ask"\): authored transition lasts [\d.]+ s but the event allows 2\.200 s;/}},
  'discovery-fetch-squeezed': {version: 'discovery-fetch-squeezed@source-2026-11-22.1',
    basis: 'Historical bf773626 mutation restores a 1.3-second first-check budget and separate barrier beat.',
    phase: 'first check cannot fit declared budget', prevention: {type: 'refusal', kind: 'duration guard', name: 'RangeError', event: 'check',
      message: /^machine\.send\("check"\): authored transition lasts [\d.]+ s but the event allows 1\.300 s;/}},

  'sign-in-code-tiny-words': {version: 'sign-in-code-tiny-words@source-2026-11-22.1',
    basis: 'corpus cb20195a reversal; SignIn collect pass(code), codeSlip(c_5Rm2) at 0.6 scale.',
    phase: 'collect flight', finding: {type: 'finding', scenario: '{"flow":"direct"}',
      transition: /(?:event "collect"$|, collect$)/, kind: 'small words', path: 'code', subjects: ['c_5Rm2']}},
  'browser-read-tiny-words': {version: 'browser-read-tiny-words@source-2026-11-22.1',
    basis: 'corpus cb20195a reversal; Browser authorize pass(read), OWN_CODE=bc_Vn3q…; stub shortCode().',
    phase: 'authorize flight', finding: {type: 'finding', scenario: '{"signin":"signed-in"}',
      transition: /(?:event "authorize"$|, authorize$)/, kind: 'small words', path: 'read', subjects: ['Vn3q']}},
  'browser-forge-tiny-words': {version: 'browser-forge-tiny-words@source-2026-11-22.1',
    basis: 'corpus cb20195a reversal; Browser forge pass(forged), ATTACK_CODE=bc_K9wd…; stub shortCode().',
    phase: 'forge flight', finding: {type: 'finding', scenario: '{"signin":"signed-in"}',
      transition: /(?:event "forge"$|, forge$)/, kind: 'small words', path: 'forged', subjects: ['K9wd']}},
  'sign-in-poll-over-card': {version: 'sign-in-poll-over-card@domain-2026-11-22.1',
    replacesObservation: 'sign-in-poll-over-card@historical',
    basis: 'Independent native pixel proof tools/repo/motion-occlusion-proof.ts and restored card domain in picture.ts; changed victim explicitly separate from Example Company.',
    phase: 'outgoing device poll', finding: {type: 'finding', scenario: '{"flow":"device"}',
      transition: /^(?:step "ask", play 1, event 2|after .+, collect)$/, kind: 'occluded words', path: 'card', subjects: ['example.com', 'poll']}},
};

export const PROSPECTIVE_V2: readonly ProspectiveCase[] = claims.map(([id, actor, subject, phase]) => {
  const entry = CORPUS.find(entry => entry.id === id);
  if (!entry) throw new Error(`unknown prospective case ${id}`);
  const targets = [...frozenTarget(entry), ...(sourceTargets[id] ? [sourceTargets[id]!] : [])];
  return {id, claim: {actor, subject, phase, events: entry.events ?? 'all authored transitions'},
    source: `Historical fix ${entry.commit}: ${entry.what}`, targets,
    ...(!targets.length ? {unresolved: 'Observable claim declared; exact subject/path/scenario binding awaits independent visual evidence. No generic warning earns credit.'} : {})};
});
