// The motion defect corpus: motion defects that filming the eight Poppy chapters at 200 ms found after
// `rayner check` and `rayner review` had passed them (issue #101, item 14; the glyph dissolve of item
// 12), each brought back as a few text edits to the current Poppy scenes (scenes/explainers/poppy*).
//
// Issue #101 counts 63 defects and names their kinds, but lists none of them one by one, and the
// branch that fixed them (claude/focused-newton-s7zxou, PR #102) records the fixes only as hunks in
// work-in-progress commits ("motion audit"). Each entry here is one fix in those commits, read from
// its hunk and the comment it added, and undone on the current scene: `edits` replace the fixed code
// with the code before the fix (adapted where later commits changed the lines around it). `commit` is
// the commit whose hunk made the fix. `kind` is #101's kind for it, from the fix's own comment.
// tools/repo/motion-corpus.ts builds each variant in a copy of the Poppy folders under out/ and runs
// the keyed motion check on it; test/motion-corpus.test.ts holds the recall measured there.

/** One text edit to a file of a Poppy folder: `find` (the current scene's text, exactly once) becomes `replace`. */
export interface Edit { file: string; find: string; replace: string }

/** #101's kinds (item 14, and item 12's glyph-by-glyph dissolve), and the two the fixes show that it does not name. */
export type DefectKind =
  | 'passes over' // a moving part passes over a label or another part
  | 'two copies' // two copies of one thing are visible at once
  | 'result before cause' // an answer or changed value is readable before its cause arrives, or a cause shown after its result
  | 'layout motion' // motion that carries layout, not meaning
  | 'too long' // a transition too long to sit through
  | 'small label in flight' // a scaled-down travelling label, under the phone's legible size mid-flight
  | 'squeezed' // a transition longer than its event's runTime, squeezed into it, so its fades pop (#101 item 12)
  | 'glyph dissolve' // words morphed glyph by glyph into rows of dots (#101 item 12)
  | 'flicker'; // an unchanged part faded out and back (a fix in the audit commits; not one of #101's named kinds)

export interface CorpusEntry {
  id: string;
  /** The Poppy folder whose scene shows the defect. */
  chapter: string;
  kind: DefectKind;
  /** The short SHA of the commit on claude/focused-newton-s7zxou whose hunk fixed it. */
  commit: string;
  /** What a reader saw, and what the fix did. */
  what: string;
  /** 'reverted': the fix's hunk undone on the current scene as it stands; 'adapted': undone by hand where later commits moved the lines. */
  method: 'reverted' | 'adapted';
  edits: readonly Edit[];
  /**
   * The machine events whose transitions the edits change: a focused run (the test's) plays only
   * these from every reachable state, with every play of the run. Absent: every event, as `rayner check`.
   */
  events?: readonly string[];
}

export const CORPUS: readonly CorpusEntry[] = [
  // ------------------------------------------------------------------------------------- chapter 1
  {
    id: 'poppy-ticket-over-lane-names', chapter: 'poppy', kind: 'passes over', commit: '0a887ad4', method: 'adapted', events: ['cart', 'browse', 'chat', 'exchange', 'thief'],
    what: 'A full-size ticket rode each lane over the lane’s name, which sat on the line on a plate; the fix set names above the lines and sent a token at 0.28 scale under them.',
    edits: [
      { file: 'poppy/picture.ts', find: 'fan: FAN, nameAt: \'above\', active', replace: 'fan: FAN, active' },
      { file: 'poppy/scene.ts', find: 'const LEAD = LANES.flatMap((name) => [`lane:${name}:line`, `lane:${name}:name`]);', replace: 'const LEAD = LANES.flatMap((name) => [`lane:${name}:line`, `lane:${name}:name`, `lane:${name}:plate`]);' },
      { file: 'poppy/scene.ts', find: 'const TOKEN = { scale: 0.28 };', replace: 'const TOKEN = { scale: 1 };' },
    ],
  },
  {
    id: 'poppy-key-over-station-name', chapter: 'poppy', kind: 'passes over', commit: '0a887ad4', method: 'reverted', events: ['sign-in', 'sign-out'],
    what: 'The key flew to the agent, and back at sign-out, at full size over the station’s name and the lane names; the fix flies it at half size.',
    edits: [
      { file: 'poppy/scene.ts', find: 'flight(c, \'agent:key\', keyRoute().slice(0, -1), { scale: 0.5 })', replace: 'flight(c, \'agent:key\', keyRoute().slice(0, -1))' },
      { file: 'poppy/scene.ts', find: 'c.from(\'agent:key\').copy().scale(0.5)', replace: 'c.from(\'agent:key\').copy()' },
    ],
  },
  {
    id: 'poppy-last-object-lingers', chapter: 'poppy', kind: 'result before cause', commit: '0a887ad4', method: 'reverted',
    what: 'The last event’s exhibit and closed door stayed while the next ticket travelled, and changed only when it had landed; the fix lists them in beats’ fresh, so they go before it sets off.',
    edits: [
      { file: 'poppy/scene.ts', find: 'const FRESH = [\'answer:\', \'ticket\', \'barrier\', \'exhibit:\', \'door:\'];', replace: 'const FRESH = [\'answer:\', \'ticket\', \'barrier\'];' },
    ],
  },
  // ---------------------------------------------------------------------------------- refusals (5)
  {
    id: 'refusals-ticket-over-station', chapter: 'poppy-refusals', kind: 'passes over', commit: 'd4392856', method: 'adapted', events: ['expire', 'read-only', 'delegation', 'end', 'old-copy', 'too-fast', 'mcp', 'answer'],
    what: 'A request’s ticket set off from the agent’s seal and crossed the station on its way to the lane; the fix launches it on its lane, clear of the station.',
    edits: [
      { file: 'poppy-refusals/scene.ts', find: '  DELEGATION_ROUTE, FIX_NAME, MCP_KEY_AT, PALETTE, RAIL,\n', replace: '  DELEGATION_ROUTE, FIX_NAME, MCP_KEY_AT, PALETTE, RAIL, SEAL_AT,\n' },
      { file: 'poppy-refusals/scene.ts', find: 'const go = flight(c, \'ticket\', [launchAt(y)]);', replace: 'const go = flight(c, \'ticket\', [SEAL_AT, ...laneOfWorld(t.after).route.slice(1, 3)]);' },
      { file: 'poppy-refusals/scene.ts', find: 'const sendAgain = flight(c, \'ticket\', [launchAt(y)], { move: 0.8 });', replace: 'const sendAgain = flight(c, \'ticket\', [SEAL_AT, ...route.slice(1, 3)], { move: 0.9 });' },
    ],
  },
  {
    id: 'refusals-ticket-over-lane-name', chapter: 'poppy-refusals', kind: 'passes over', commit: '0a887ad4', method: 'reverted', events: ['expire', 'read-only', 'delegation', 'end', 'old-copy', 'too-fast', 'mcp', 'answer'],
    what: 'The ticket was launched just clear of the station, so it set off over the lane’s name; the fix launches it past the name.',
    edits: [
      { file: 'poppy-refusals/picture.ts', find: 'export const launchAt = (y: number): Vec => [NAME_X + 1.3 + TW / 2, y];', replace: 'export const launchAt = (y: number): Vec => [STATION[0] + STATION_R + 0.2 + TW / 2, y];' },
    ],
  },
  {
    id: 'refusals-lanes-slide', chapter: 'poppy-refusals', kind: 'layout motion', commit: '0a887ad4', method: 'adapted', events: ['expire', 'read-only', 'delegation', 'end', 'old-copy', 'too-fast', 'mcp', 'answer'],
    what: 'When the MCP lane came or went, the API lane slid to its new height: motion for the layout; the fix keys the lanes apart in the two layouts and cross-fades them.',
    edits: [
      { file: 'poppy-refusals/picture.ts', find: 'id: mcpShown ? `mcp-${id}` : id, name:', replace: 'id, name:' },
      { file: 'poppy-refusals/scene.ts', find: 'const LANE_PARTS = [\'api\', \'mcp-api\', \'mcp-mcp\']', replace: 'const LANE_PARTS = [\'api\', \'mcp\']' },
    ],
  },
  {
    id: 'refusals-lanes-gone-in-flight', chapter: 'poppy-refusals', kind: 'layout motion', commit: '82eb9c03', method: 'adapted', events: ['expire', 'read-only', 'delegation', 'end', 'old-copy', 'too-fast', 'mcp', 'answer'],
    what: 'The first fix for the sliding lanes listed them in beats’ fresh: they faded out and came back only after the ticket had travelled, so it flew on no lane; the second cross-faded them before it set off.',
    edits: [
      { file: 'poppy-refusals/scene.ts', find: 'return beats(c, () => [...relay(), ...go()], { fresh, then: [\'barrier\'], lead: [...LANE_PARTS, ...RAIL_PARTS] });', replace: 'return beats(c, go, { fresh: relaid ? [...fresh, \'lane\'] : fresh, then: [\'barrier\'], lead: relaid ? RAIL_PARTS : [...LANE_PARTS, ...RAIL_PARTS] });' },
    ],
  },
  {
    id: 'refusals-delegation-over-station', chapter: 'poppy-refusals', kind: 'passes over', commit: '0a887ad4', method: 'reverted', events: ['answer'],
    what: 'A new delegation (or seal) came up from under the station, across its name, to the seal; the fix brings it from off the stage above.',
    edits: [
      { file: 'poppy-refusals/picture.ts', find: 'export const DELEGATION_ROUTE: Vec[] = [[MARGIN.left, 4.3], SEAL_AT];', replace: 'export const DELEGATION_ROUTE: Vec[] = [[STATION[0], 0.9], SEAL_AT];' },
    ],
  },
  {
    id: 'refusals-mcp-key-over-label', chapter: 'poppy-refusals', kind: 'passes over', commit: '0a887ad4', method: 'reverted', events: ['answer'],
    what: 'The MCP key came down 1.2 units right of its hook, over the words “for MCP”; the fix brings it down 2.6 units right, past them.',
    edits: [
      { file: 'poppy-refusals/scene.ts', find: '[MCP_KEY_AT[0] + 2.6, y], [MCP_KEY_AT[0] + 2.6, MCP_KEY_AT[1]]', replace: '[MCP_KEY_AT[0] + 1.2, y], [MCP_KEY_AT[0] + 1.2, MCP_KEY_AT[1]]' },
    ],
  },
  {
    id: 'refusals-key-over-lane-name', chapter: 'poppy-refusals', kind: 'passes over', commit: 'd99c9195', method: 'reverted', events: ['answer'],
    what: 'A refreshed key came back along the lane over the lane’s name; the fix routes it under the name.',
    edits: [
      { file: 'poppy-refusals/picture.ts', find: 'export const keyRoute = (y: number): Vec[] => [[STOP_X, y], [NAME_X + 1.3, y], [NAME_X + 1.0, y - 0.55], [STATION[0] + STATION_R + 0.4, y - 0.55], KEY_AT];', replace: 'export const keyRoute = (y: number): Vec[] => [[STOP_X, y], [STATION[0] + STATION_R, y], KEY_AT];' },
    ],
  },
  // -------------------------------------------------------------------------------------- sessions
  {
    id: 'sessions-ticket-from-under-stamp', chapter: 'poppy-sessions', kind: 'passes over', commit: 'd99c9195', method: 'reverted',
    what: 'The agent’s ticket came in diagonally from under the stamp, across it; the fix brings it in level from the stamp’s side.',
    edits: [
      { file: 'poppy-sessions/picture.ts', find: 'agent: [TICKET_AT[0] + 1.4, TICKET_AT[1]]', replace: 'agent: [TICKET_AT[0] + 0.9, TICKET_AT[1] + 0.7]' },
    ],
  },
  {
    id: 'sessions-key-to-wax-after-check', chapter: 'poppy-sessions', kind: 'result before cause', commit: 'd99c9195', method: 'adapted',
    what: 'When the published key pressed the seal, nothing showed it moving: it left the chain and appeared on the wax only as the picture settled, after the punches it caused; the fix sends it down first.',
    edits: [
      { file: 'poppy-sessions/scene.ts', find: 'const moved = [...hand(), ...flight(c, \'ticket\'', replace: 'const moved = [...flight(c, \'ticket\'' },
      { file: 'poppy-sessions/scene.ts', find: '}, { fresh: [\'verdict:\', \'ticket\', \'hole\', \'tear\', \'link\'], lead: [\'chain:\'] });', replace: '}, { fresh: [\'verdict:\', \'ticket\', \'hole\', \'tear\', \'link\'] });' },
    ],
  },
  {
    id: 'sessions-key-in-two-places', chapter: 'poppy-sessions', kind: 'two copies', commit: 'cb20195a', method: 'adapted',
    what: 'The published key flew to the wax while it still hung in the chain, so it was in two places; the fix takes it out of the chain as the trip begins.',
    edits: [
      { file: 'poppy-sessions/scene.ts', find: 'return [new AnimationGroup([appear!, c.leave(fromKey, { runTime: 0.25 }), ...also', replace: 'return [new AnimationGroup([appear!, ...also' },
    ],
  },
  {
    id: 'sessions-squeezed', chapter: 'poppy-sessions', kind: 'squeezed', commit: '2d181ce5', method: 'adapted',
    what: 'Every tamper ran in a fixed 2.6 s runTime, while its beats lasted 3.1 s (4.35 s with the published key’s trip), so they were squeezed into it; the fix gives each transition its own length. Undone with the beats as they were then.',
    edits: [
      { file: 'poppy-sessions/scene.ts', find: '{ appear: 0.25, move: 0.35, leave: 0.2 })();', replace: '{ appear: 0.25, move: 0.45, leave: 0.25 })();' },
      { file: 'poppy-sessions/scene.ts', find: '.map((k) => c.enter(k, {}, { runTime: 0.25 }));\n          return here.length', replace: '.map((k) => c.enter(k, {}, { runTime: 0.3 }));\n          return here.length' },
      { file: 'poppy-sessions/scene.ts', find: 'flight(c, \'ticket\', [from], { appear: 0.25, move: 0.45, leave: 0.2 })()];', replace: 'flight(c, \'ticket\', [from], { appear: 0.25, move: 0.5, leave: 0.2 })()];' },
      { file: 'poppy-sessions/scene.ts', find: '[c.enter(\'ticket:arrived\', {}, { runTime: 0.2 })]', replace: '[c.enter(\'ticket:arrived\', {}, { runTime: 0.25 })]' },
      { file: 'poppy-sessions/scene.ts', find: '.map((k) => c.enter(k, {}, { runTime: 0.25 }));\n        return [...moved', replace: '.map((k) => c.enter(k, {}, { runTime: 0.3 }));\n        return [...moved' },
      { file: 'poppy-sessions/scene.ts', find: 'return 2.85 + (toWax || fromWax ? 1.05 : 0);', replace: 'return 2.6;' },
    ],
  },
  {
    id: 'sessions-too-long', chapter: 'poppy-sessions', kind: 'too long', commit: '9e7d166a', method: 'reverted',
    what: 'A tamper took 3.1 s, and 4.35 s with the published key’s trip; the last audit commit shortened every beat.',
    edits: [
      { file: 'poppy-sessions/scene.ts', find: '{ appear: 0.25, move: 0.35, leave: 0.2 })();', replace: '{ appear: 0.25, move: 0.45, leave: 0.25 })();' },
      { file: 'poppy-sessions/scene.ts', find: '.map((k) => c.enter(k, {}, { runTime: 0.25 }));\n          return here.length', replace: '.map((k) => c.enter(k, {}, { runTime: 0.3 }));\n          return here.length' },
      { file: 'poppy-sessions/scene.ts', find: 'flight(c, \'ticket\', [from], { appear: 0.25, move: 0.45, leave: 0.2 })()];', replace: 'flight(c, \'ticket\', [from], { appear: 0.25, move: 0.5, leave: 0.2 })()];' },
      { file: 'poppy-sessions/scene.ts', find: '[c.enter(\'ticket:arrived\', {}, { runTime: 0.2 })]', replace: '[c.enter(\'ticket:arrived\', {}, { runTime: 0.25 })]' },
      { file: 'poppy-sessions/scene.ts', find: '.map((k) => c.enter(k, {}, { runTime: 0.25 }));\n        return [...moved', replace: '.map((k) => c.enter(k, {}, { runTime: 0.3 }));\n        return [...moved' },
      { file: 'poppy-sessions/scene.ts', find: 'return 2.85 + (toWax || fromWax ? 1.05 : 0);', replace: 'return 3.1 + (toWax || fromWax ? 1.25 : 0);' },
    ],
  },
  // --------------------------------------------------------------------------------------- sign-in
  {
    id: 'sign-in-ask-people-slide', chapter: 'poppy-sign-in', kind: 'layout motion', commit: '3038108f', method: 'adapted', events: ['ask'],
    what: 'When the page opened, you and the agent slid to your places beside it, motion that says nothing about the protocol; the fix cross-fades them.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: 'const c = t.choreograph(world), seal = centre(c, \'agent:seal\', \'to\'), moved = relaid(c);', replace: 'const c = t.choreograph(world), seal = centre(c, \'agent:seal\', \'to\'), moved: string[] = [];' },
    ],
  },
  {
    id: 'sign-in-collect-people-slide', chapter: 'poppy-sign-in', kind: 'layout motion', commit: '3038108f', method: 'adapted', events: ['collect'],
    what: 'When the page closed after the code came back, you and the agent slid back across the stage; the fix cross-fades them.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: 'const moved = relaid(c, [\'agent:key\', \'tag\']);', replace: 'const moved: string[] = [];' },
    ],
  },
  {
    id: 'sign-in-collect-too-long', chapter: 'poppy-sign-in', kind: 'too long', commit: '3038108f', method: 'adapted', events: ['collect'],
    what: 'A code coming back with tokens took 4.8 s; the fix brought it to 3.3 s.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: '(a.last?.kind === \'tokens\' ? 4.45 : 2.8)', replace: '(a.last?.kind === \'tokens\' ? 4.8 : 2.8)' },
    ],
  },
  {
    id: 'sign-in-tokens-over-labels', chapter: 'poppy-sign-in', kind: 'passes over', commit: 'bf773626', method: 'adapted', events: ['ask', 'collect'],
    what: 'The request and the poll went straight from the seal to the desk or the address bar, full size, over the labels of the agent’s side; the fix routes small tokens along the gap between the strip and the keyring.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: 'const toDesk = (seal: Pt): Pt[] => [seal, [seal[0] + 0.55, LANE], [DESK[0] - 0.4, LANE], DESK];', replace: 'const toDesk = (seal: Pt): Pt[] => [seal, [seal[0] + 1.2, DESK[1]], DESK];' },
      { file: 'poppy-sign-in/scene.ts', find: 'const toAddress = (seal: Pt): Pt[] => [seal, [seal[0] + 0.55, LANE], [-3.9, LANE], [-3.9, ADDRESS_AT[1]], ADDRESS_AT];', replace: 'const toAddress = (seal: Pt): Pt[] => [seal, [-4.6, seal[1] + 0.6], [-4.6, ADDRESS_AT[1]], ADDRESS_AT];' },
      { file: 'poppy-sign-in/scene.ts', find: 'const request = () => requestToken(s).scale(0.55);', replace: 'const request = () => requestToken(s);' },
    ],
  },
  {
    id: 'sign-in-password-before-card', chapter: 'poppy-sign-in', kind: 'result before cause', commit: 'bf773626', method: 'adapted', events: ['approve-all', 'approve-read'],
    what: 'The password in the page was not listed in beats’ fresh, so on a second approval it stayed in the field while your card was still on its way to it; the fix lists it.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: '\'page:by\', \'page:password\', \'sees\'', replace: '\'page:by\', \'sees\'' },
    ],
  },
  {
    id: 'sign-in-ask-squeezed', chapter: 'poppy-sign-in', kind: 'squeezed', commit: '58b06e8e', method: 'adapted', events: ['ask'],
    what: 'The request’s token appeared and left in 0.15 s, inside a 2.2 s runTime its beats overran, so they popped; the fix gives them 0.25 s and the event 2.6 s.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: 'event === \'ask\' ? 4.1 : 2.35', replace: 'event === \'ask\' ? 2.2 : 2.35' },
      { file: 'poppy-sign-in/scene.ts', find: 'pass(c, \'request\', request(), toAddress(seal), { appear: 0.25, move: 0.9, leave: 0.25 })', replace: 'pass(c, \'request\', request(), toAddress(seal), { appear: 0.15, move: 0.9, leave: 0.15 })' },
      { file: 'poppy-sign-in/scene.ts', find: 'pass(c, \'request\', request(), toDesk(seal), { appear: 0.25, move: 0.6, leave: 0.25 })', replace: 'pass(c, \'request\', request(), toDesk(seal), { appear: 0.15, move: 0.6, leave: 0.15 })' },
    ],
  },
  {
    id: 'sign-in-pages-overlap', chapter: 'poppy-sign-in', kind: 'passes over', commit: 'd99c9195', method: 'adapted', events: ['ask'],
    what: 'A page of another shape (the website before the phone) was still there while the new one faded in over it; the fix takes the old page away first.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: 'const reopen = stale.filter((k) => c.has(k, \'to\'));', replace: 'const reopen: string[] = [];' },
      { file: 'poppy-sign-in/scene.ts', find: '[new AnimationGroup([...fadeOut(c, moved), ...fadeOut(c, stale)]),', replace: '[new AnimationGroup([...fadeOut(c, moved), ...fadeOut(c, stale.filter((k) => !c.has(k, \'to\')))]),' },
    ],
  },
  {
    id: 'sign-in-card-from-desk', chapter: 'poppy-sign-in', kind: 'layout motion', commit: 'd99c9195', method: 'adapted', events: ['ask'],
    what: 'The device card came from the Company’s desk, where it does not come from; the fix brings it from the agent’s seal.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: '...fly(c, \'card\', [seal]), ...frame()', replace: '...flight(c, \'card\', [DESK], { appear: 0.25, move: 0.5, leave: 0.25 })(), ...frame()' },
    ],
  },
  {
    id: 'sign-in-poll-over-card', chapter: 'poppy-sign-in', kind: 'passes over', commit: 'd99c9195', method: 'reverted', events: ['collect'],
    what: 'With the device card on the stage, the poll ran over it to the desk; the fix sends it along a lower line.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: 'const poll = (p: Pt) => (c.has(\'card\', \'from\') ? low(p) : toDesk(p));', replace: 'const poll = (p: Pt) => toDesk(p);' },
    ],
  },
  {
    id: 'sign-in-password-hand-and-flight', chapter: 'poppy-sign-in', kind: 'two copies', commit: 'd99c9195', method: 'adapted', events: ['approve-all', 'approve-read'],
    what: 'Your password card flew into the page while it was still in your hand, and across the page’s lines; the fix takes it from your hand as it sets off, round the page.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: '        const side = device ? [from, to] as Pt[] : [from, [-1.7, from[1]], [-1.7, to[1]], to] as Pt[];\n        const card = pass(c, \'password:travel\', c.from(\'you:password\').copy(), side, { appear: 0.2, move: 0.9, leave: 0.25 });\n        return [new AnimationGroup([c.leave(\'you:password\', { runTime: 0.2 }), card[0]!]), card[1]!, new AnimationGroup([card[2]!, c.enter(\'page:password\', {}, { runTime: 0.25 })])];', replace: '        return flight(c, \'page:password\', [from], { move: 0.8 })();' },
    ],
  },
  {
    id: 'sign-in-code-tiny-words', chapter: 'poppy-sign-in', kind: 'small label in flight', commit: 'cb20195a', method: 'adapted', events: ['collect'],
    what: 'The code travelled as the kit’s code slip, with its words, at 0.6 scale: words far under a phone’s legible size in flight; the fix draws a slip too small to carry words.',
    edits: [
      { file: 'poppy-sign-in/picture.ts', find: 'export const codeToken = (_s: Stage): Mobject => {', replace: 'export const codeToken = (s: Stage): Mobject => codeSlip(s, { code: \'c_5Rm2\' });\nexport const wordlessSlip = (_s: Stage): Mobject => {' },
      { file: 'poppy-sign-in/scene.ts', find: 'const code = () => codeToken(s);', replace: 'const code = () => codeToken(s).scale(0.6);' },
    ],
  },
  {
    id: 'sign-in-password-route', chapter: 'poppy-sign-in', kind: 'passes over', commit: 'cb20195a', method: 'reverted', events: ['approve-all', 'approve-read'],
    what: 'The password card’s way round the page ran at x −2.05, over the page’s edge; the fix moves it to −1.7.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: '[from, [-1.7, from[1]], [-1.7, to[1]], to]', replace: '[from, [-2.05, from[1]], [-2.05, to[1]], to]' },
    ],
  },
  {
    id: 'sign-in-tag-over-scopes', chapter: 'poppy-sign-in', kind: 'passes over', commit: 'cb20195a', method: 'adapted', events: ['sign-out', 'disconnect'],
    what: 'At sign-out the tag went back onto the desk over the scopes, and the key and cord stayed until it had gone; the fix stops it at the counter’s edge and fades them as it sets off.',
    edits: [
      { file: 'poppy-sign-in/scene.ts', find: 'const back = pass(c, \'tag:return\', c.from(\'tag\').copy(), [from, [to[0], from[1]], to], { appear: 0.25, move: 0.7, leave: 0.25 });\n        return [new AnimationGroup([c.leave(\'tag\', { runTime: 0.25 }), ...going.map((k) => c.leave(k, { runTime: 0.3 })), back[0]!]), ...back.slice(1)];', replace: 'const back = pass(c, \'tag:return\', c.from(\'tag\').copy(), [from, [from[0] + 0.8, DESK[1]], DESK], { appear: 0.2, move: 0.8 });\n        return [new AnimationGroup([c.leave(\'tag\', { runTime: 0.2 }), back[0]!]), ...back.slice(1)];' },
    ],
  },
  // --------------------------------------------------------------------------------------- browser
  {
    id: 'browser-ticket-over-road-name', chapter: 'poppy-browser', kind: 'passes over', commit: '0a887ad4', method: 'adapted', events: ['fetch', 'authorize'],
    what: 'The agent’s road carried its name, “agent’s requests”, on the line, and every ticket ran over it; the fix draws the road without a name.',
    edits: [
      { file: 'poppy-browser/picture.ts', find: 'cookie, person, counter, key, seal,', replace: 'cookie, person, counter, key, lane, seal,' },
      { file: 'poppy-browser/picture.ts', find: '  parts.add(new Line(ROAD_A_FROM, [COUNTER_X, ROAD_A], { stroke: agentRoad ? TONE.ink : TONE.steel, strokeWidth: agentRoad ? STROKE.bold : STROKE.line }), \'lane:agent:line\');\n  parts.add(stop(s, { at: [COUNTER_X, ROAD_A], active: agentReached }), \'lane:agent:stop\');', replace: '  addAll(parts, lane(s, { id: \'agent\', name: \'agent’s requests\', y: ROAD_A, from: ROAD_A_FROM, trunk: ROAD_A_FROM[0], to: COUNTER_X, nameX: -5.0, active: agentRoad, reached: agentReached, fan: 0 }));' },
    ],
  },
  {
    id: 'browser-halves-together', chapter: 'poppy-browser', kind: 'passes over', commit: '0a887ad4', method: 'adapted', events: ['load'],
    what: 'At the join page the code and its cookie half left the counter together from one point, one over the other; the fix sends them one after the other from their own places.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: '            ...flight(c, \'page:stub\', [[COUNTER_X - 1.2, ROAD_B], PAGE_AT], { appear: 0.2, move: 0.6, leave: 0.25 })(),\n            ...flight(c, \'shelf:join\', [MEET_HALF, [SIDE_X, ROAD_B], [SIDE_X, JOIN_AT[1]], JOIN_AT], { appear: 0.2, move: 0.7, leave: 0.25 })(),', replace: '            ...together(\n              flight(c, \'page:stub\', [COUNTER_B, ROAD_B_FROM, PAGE_AT], { move: 0.9 })(),\n              flight(c, \'shelf:join\', [COUNTER_B, [ROAD_B_FROM[0] + 0.4, ROAD_B], [ROAD_B_FROM[0] + 0.4, JOIN_AT[1]], JOIN_AT], { move: 0.9 })(),\n            ),' },
    ],
  },
  {
    id: 'browser-read-across-page', chapter: 'poppy-browser', kind: 'passes over', commit: '0a887ad4', method: 'adapted', events: ['authorize'],
    what: 'The code the agent reads went diagonally across the page to the seal, over the window’s content; the fix sends it along the agent’s dotted reading line.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: '[[WIN_LEFT + 1.0, PAGE_AT[1]], [WIN_LEFT, 1.95], READ_FROM, SEAL_AT]', replace: '[[WIN_LEFT + 1.0, PAGE_AT[1]], [PAGE_AT[0] - 2.2, 1.95], SEAL_AT]' },
    ],
  },
  {
    id: 'browser-forge-across-stage', chapter: 'poppy-browser', kind: 'passes over', commit: '0a887ad4', method: 'adapted', events: ['forge'],
    what: 'The attacker’s forged stub, full size, crossed from its browser through yours on a diagonal over the page; the fix routes it round the windows.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: '[EVIL_OUT, [EVIL_SIDE_X, 0.95], [WIN_RIGHT - 0.6, 0.95], ROAD_B_FROM, [COUNTER_X - 0.75, ROAD_B]]', replace: '[[EVIL_HALF_AT[0] - 1.6, EVIL_HALF_AT[1] + 0.9], [PAGE_AT[0] + 1.0, PAGE_AT[1] - 0.2], ROAD_B_FROM, COUNTER_B]' },
    ],
  },
  {
    id: 'browser-message-across-stage', chapter: 'poppy-browser', kind: 'passes over', commit: '0a887ad4', method: 'reverted', events: ['phish'],
    what: 'The attacker’s message crossed the stage diagonally to your agent; the fix brings it along the bottom of the stage.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: 'flight(c, \'message\', [MESSAGE_FROM, [MESSAGE_AT[0], MESSAGE_FROM[1]]], { appear: 0.2, move: 0.8, leave: 0.25 })', replace: 'flight(c, \'message\', [[EVIL_HALF_AT[0] - 1.6, EVIL_HALF_AT[1] + 0.9], [MESSAGE_AT[0] + 2.0, MESSAGE_AT[1] - 0.6]], { move: 0.9 })' },
    ],
  },
  {
    id: 'browser-message-lingers', chapter: 'poppy-browser', kind: 'result before cause', commit: '0a887ad4', method: 'reverted',
    what: 'The declined message and the rack’s “no codes yet” were not listed in beats’ fresh, so they stayed through the next event’s flight; the fix lists them.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: 'const FRESH = [\'answer:\', \'ticket\', \'barrier\', \'message\', \'rack:none\'];', replace: 'const FRESH = [\'answer:\', \'ticket\', \'barrier\'];' },
    ],
  },
  {
    id: 'browser-submit-meet-on-top', chapter: 'poppy-browser', kind: 'passes over', commit: '58b06e8e', method: 'reverted', events: ['submit'],
    what: 'The submitted code and its cookie half both ended their trips on the counter’s stop, one on top of the other, and the Session’s cookie left from there; the fix sets them side by side.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: '[PAGE_AT, MEET_STUB], { appear: 0.2, move: 0.8, leave: 0.25 }', replace: '[PAGE_AT, ROAD_B_FROM, COUNTER_B], { appear: 0.2, move: 0.8, leave: 0.2 }' },
      { file: 'poppy-browser/scene.ts', find: '[SIDE_X, ROAD_B], MEET_HALF], { appear: 0.2, move: 0.8, leave: 0.25 }', replace: '[SIDE_X, ROAD_B], COUNTER_B], { appear: 0.2, move: 0.8, leave: 0.2 }' },
      { file: 'poppy-browser/scene.ts', find: 'flight(c, \'shelf:session\', [MEET_HALF,', replace: 'flight(c, \'shelf:session\', [COUNTER_B,' },
    ],
  },
  {
    id: 'browser-forge-ends-on-stop', chapter: 'poppy-browser', kind: 'passes over', commit: '58b06e8e', method: 'reverted', events: ['forge'],
    what: 'The forged stub ended its trip on the counter’s stop, under the barrier that then dropped; the fix stops it short.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: 'ROAD_B_FROM, [COUNTER_X - 0.75, ROAD_B]], { appear: 0.25, move: 1.3, leave: 0.2 }', replace: 'ROAD_B_FROM, COUNTER_B], { appear: 0.25, move: 1.3, leave: 0.2 }' },
    ],
  },
  {
    id: 'browser-record-after-halves', chapter: 'poppy-browser', kind: 'result before cause', commit: 'd99c9195', method: 'reverted', events: ['load'],
    what: 'The Company’s record of the new code appeared on the rack only after the two halves had been handed out; the fix shows it first.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: '            // The Company keeps its record of the new code before handing out the two halves.\n            new AnimationGroup([c.enter(`row:${id}:stub`, {}, { runTime: 0.3 }), c.enter(`row:${id}:ring`, {}, { runTime: 0.3 })]),\n', replace: '' },
      { file: 'poppy-browser/scene.ts', find: '          ], { fresh: [...FRESH, \'page:error\'], lead: BROWSER_ROAD });', replace: '          ], { fresh: [...FRESH, \'page:error\'], lead: BROWSER_ROAD, then: [`row:${id}:stub`, `row:${id}:ring`] });' },
    ],
  },
  {
    id: 'browser-read-over-its-copy', chapter: 'poppy-browser', kind: 'two copies', commit: 'd99c9195', method: 'adapted', events: ['authorize'],
    what: 'The code the agent reads set off from the page’s stub, over it, so the code showed twice at once (“Vn3q3q”); the fix starts it beside the page.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: '[[WIN_LEFT + 1.0, PAGE_AT[1]], [WIN_LEFT, 1.95], READ_FROM, SEAL_AT]', replace: '[PAGE_AT, [WIN_LEFT + 1.0, PAGE_AT[1]], [WIN_LEFT, 1.95], READ_FROM, SEAL_AT]' },
    ],
  },
  {
    id: 'browser-legend-moves', chapter: 'poppy-browser', kind: 'layout motion', commit: 'd99c9195', method: 'reverted',
    what: 'The rack’s legend sat under the last row, so it slid down each time a row was added; the fix pins it.',
    edits: [
      { file: 'poppy-browser/picture.ts', find: 'const y0 = ROW_Y[1] + 0.1;', replace: 'const y0 = ROW_Y[Math.max(1, ordered.length)]! + 0.1;' },
    ],
  },
  {
    id: 'browser-attacker-over-shelf', chapter: 'poppy-browser', kind: 'passes over', commit: 'ffc39ca0', method: 'reverted', events: ['forge', 'phish'],
    what: 'The attacker’s things left its browser on the right, over its shelf and its name, on their way to the counter; the fix moves the shelf left and sends them out of the window’s left side.',
    edits: [
      { file: 'poppy-browser/picture.ts', find: 'export const EVIL_HALF_AT: Vec = [EVIL[0] - 1.75, EVIL[1] - 0.45];', replace: 'export const EVIL_HALF_AT: Vec = [EVIL[0] + 0.9, EVIL[1] - 0.45];' },
      { file: 'poppy-browser/picture.ts', find: 'export const EVIL_OUT: Vec = [EVIL[0] - WIN_W / 2 - 0.35, EVIL[1] + 0.2];', replace: 'export const EVIL_OUT: Vec = [EVIL[0] + 2.2, EVIL[1] - 0.05];' },
      { file: 'poppy-browser/picture.ts', find: 'at: [EVIL_HALF_AT[0] + 0.75, EVIL_HALF_AT[1]], color: TONE.soft, align: \'start\' }), \'evil:shelf\'', replace: 'at: [EVIL[0] - 2.6, EVIL_HALF_AT[1]], color: TONE.soft, align: \'start\' }), \'evil:shelf\'' },
      { file: 'poppy-browser/scene.ts', find: '[EVIL_OUT, [EVIL_SIDE_X, 0.95], [WIN_RIGHT - 0.6, 0.95]', replace: '[EVIL_OUT, [EVIL_OUT[0], ATTACK_Y], [SIDE_X, ATTACK_Y], [WIN_RIGHT - 0.6, 0.95]' },
      { file: 'poppy-browser/scene.ts', find: '[EVIL_HALF_AT, [EVIL_SIDE_X, EVIL_HALF_AT[1]], [EVIL_SIDE_X, ATTACK_Y], [COUNTER_X + 0.35, ATTACK_Y]]', replace: '[EVIL_HALF_AT, [EVIL_HALF_AT[0], ATTACK_Y], [COUNTER_X + 0.35, ATTACK_Y]]' },
    ],
  },
  {
    id: 'browser-read-tiny-words', chapter: 'poppy-browser', kind: 'small label in flight', commit: 'cb20195a', method: 'adapted', events: ['authorize'],
    what: 'The code the agent reads travelled as a copy of the page’s stub at 0.6 scale, its code far under a phone’s legible size; the fix sends a code slip.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: 'const read = codeSlip(s, { code: shortCode(t.after.page ?? \'\') });', replace: 'const read = c.from(\'page:stub\').copy().scale(0.6);' },
    ],
  },
  {
    id: 'browser-forge-tiny-words', chapter: 'poppy-browser', kind: 'small label in flight', commit: 'cb20195a', method: 'adapted', events: ['forge'],
    what: 'The forged stub travelled as a stub at 0.6 scale, its code far under a phone’s legible size; the fix sends a code slip.',
    edits: [
      { file: 'poppy-browser/scene.ts', find: '  drawLogins, drawWorld, sayLogins, sayWorld, shortCode,\n', replace: '  drawLogins, drawWorld, sayLogins, sayWorld, shortCode, stub,\n' },
      { file: 'poppy-browser/scene.ts', find: 'const token = codeSlip(s, { code: shortCode(ATTACK_CODE) });', replace: 'const token = stub(s, { at: [0, 0], code: ATTACK_CODE, width: 2.3 }).scale(0.6);' },
    ],
  },
  // --------------------------------------------------------------------------------- conversations
  {
    id: 'conversations-layout-slides', chapter: 'poppy-conversations', kind: 'layout motion', commit: 'f3a705cf', method: 'adapted', events: ['direct', 'close'],
    what: 'Opening or closing the Direct Conversation slid every part that only changed place for the composition; the fix moves only the travellers and cross-fades the rest.',
    edits: [
      { file: 'poppy-conversations/scene.ts', find: 'return !TRAVELS.has(k) && Math.hypot(ax! - bx!, ay! - by!) > 0.5;', replace: 'return false;' },
    ],
  },
  {
    id: 'conversations-turn-over-seat-name', chapter: 'poppy-conversations', kind: 'passes over', commit: '0a887ad4', method: 'adapted', events: ['ask', 'you', 'read'],
    what: 'A turn of speech set off from its writer’s seat, so the travelling copy covered the seat’s name; the fix starts it a third of the way out.',
    edits: [
      { file: 'poppy-conversations/scene.ts', find: 'from: Vec = [rx! + 0.3 * (seat[0] - rx!), ry! + 0.3 * (seat[1] - ry!)];', replace: 'from: Vec = [rx! + 1.0 * (seat[0] - rx!), ry! + 1.0 * (seat[1] - ry!)];' },
      { file: 'poppy-conversations/scene.ts', find: 'flight(c, \'turn\', [from], { appear: 0.2, move: 0.5, leave: 0.2 })', replace: 'flight(c, \'turn\', [from], { appear: 0.2, move: 0.7, leave: 0.2 })' },
    ],
  },
  {
    id: 'conversations-words-dissolve', chapter: 'poppy-conversations', kind: 'glyph dissolve', commit: '0a887ad4', method: 'reverted', events: [],
    what: 'Two steps’ plain view.sync() morphed the ledger’s words glyph by glyph, so they dissolved into rows of dots (#101 item 12); the fix matches words whole.',
    edits: [
      { file: 'poppy-conversations/scene.ts', find: 'world.sync({ runTime: 0.8, match: { by: \'key\', text: \'whole\' } })', replace: 'world.sync({ runTime: 0.8 })' },
      { file: 'poppy-conversations/scene.ts', find: 'world.sync({ runTime: 0.6, match: { by: \'key\', text: \'whole\' } })', replace: 'world.sync({ runTime: 0.6 })' },
    ],
  },
  {
    id: 'conversations-person-over-ledger', chapter: 'poppy-conversations', kind: 'passes over', commit: '0a887ad4', method: 'reverted', events: ['joins'],
    what: 'A person joining came in level from the back office straight to the seat, across the ledger’s rows; the fix brings them along the stage’s foot, under the ledger.',
    edits: [
      { file: 'poppy-conversations/scene.ts', find: 'arrives(c, key, [BACK_OFFICE_X, -3.95], [seatAt[0] + 1.5, -3.95])', replace: 'arrives(c, key, [BACK_OFFICE_X, seatAt[1]])' },
    ],
  },
  {
    id: 'conversations-table-block-blinks', chapter: 'poppy-conversations', kind: 'flicker', commit: '46cdb7e6', method: 'reverted', events: ['ask', 'you', 'read'],
    what: 'Filmed after the audit (origin/claude/film-fixes): the whole “On the table” block (heading, rules, labels) went out from about 0.2 s to 1.1 s on every message, because beats’ fresh named its prefix; only the two values change. The fix lists just the values.',
    edits: [
      { file: 'poppy-conversations/scene.ts', find: "const SAID = ['turn', 'written:author.type:value', 'written:role:value'];", replace: "const SAID = ['turn', 'written:'];" },
    ],
  },
  {
    id: 'conversations-block-crossfades', chapter: 'poppy-conversations', kind: 'flicker', commit: '46cdb7e6', method: 'reverted', events: ['direct', 'close'],
    what: 'Filmed after the audit: opening or closing the Direct Conversation shifted the “On the table” block 0.1 units, just over the reflow’s 0.1 threshold, so it was cross-faded and gone from 0.4 s to 1.0 s. The fix morphs shifts under 0.5 units.',
    edits: [
      { file: 'poppy-conversations/scene.ts', find: 'return !TRAVELS.has(k) && Math.hypot(ax! - bx!, ay! - by!) > 0.5;', replace: 'return !TRAVELS.has(k) && Math.hypot(ax! - bx!, ay! - by!) > 0.1;' },
    ],
  },
  // -------------------------------------------------------------------------------------- coverage
  {
    id: 'coverage-strips-cross', chapter: 'poppy-coverage', kind: 'passes over', commit: 'f3a705cf', method: 'adapted', events: ['use alternative', 'use skill'],
    what: 'The note’s strips all flew to their places at once, the followed ones into the model and the others to the shop’s side, crossing over one another; the fix moves each group alone.',
    edits: [
      { file: 'poppy-coverage/scene.ts', find: '      const kept = group((x) => x.key.startsWith(\'strip:used:\'));\n      const left = group((x) => x.key.startsWith(\'strip:aside:\') && !x.reveal);\n', replace: '      const strips = group((x) => !x.reveal);\n' },
      { file: 'poppy-coverage/scene.ts', find: 'return [...laid, ...kept, ...reaching, ...together([left, ticket])];', replace: 'return [...laid, ...strips, ...reaching, ...ticket];' },
    ],
  },
  {
    id: 'coverage-report-too-long', chapter: 'poppy-coverage', kind: 'too long', commit: 'f3a705cf', method: 'adapted', events: ['report'],
    what: 'A report went in three legs (to the station, to the slot, back to the desk) over a 4.0 s event; the fix drops the first leg and runs it in 2.75 s.',
    edits: [
      { file: 'poppy-coverage/scene.ts', find: '  drawWorld, kindOf, noteToken, probeToken, requestToken, routeOf, sayWorld, stripKeys,\n', replace: '  drawWorld, kindOf, noteToken, probeToken, requestToken, routeOf, sayWorld, slipToken, stripKeys, TRAY_AT,\n' },
      { file: 'poppy-coverage/scene.ts', find: '            ...pass(c, \'report:sent\', requestToken(s).scale(0.28), [SEAL_AT, SLOT_AT], { appear: 0.15, move: 0.7, leave: 0.2 }),\n            ...pass(c, \'report:reply\', noteToken(s), [SLOT_AT, NOTE_AT], { appear: 0.15, move: 0.6, leave: 0.2 }),', replace: '            ...pass(c, \'report:slip\', slipToken(s), [TRAY_AT, SEAL_AT], { appear: 0.2, move: 0.6, leave: 0.15 }),\n            ...pass(c, \'report:sent\', requestToken(s).scale(0.28), [SEAL_AT, SLOT_AT], { appear: 0.15, move: 0.8, leave: 0.2 }),\n            ...pass(c, \'report:reply\', noteToken(s), [SLOT_AT, NOTE_AT], { appear: 0.2, move: 0.8, leave: 0.2 }),' },
      { file: 'poppy-coverage/scene.ts', find: 'read: 2.2, report: 2.75, sort', replace: 'read: 2.2, report: 4.0, sort' },
    ],
  },
  {
    id: 'coverage-skill-card-twice', chapter: 'poppy-coverage', kind: 'two copies', commit: '0a887ad4', method: 'adapted', events: ['use skill'],
    what: 'A copy of the skill card was carried down to the desk while the card stayed on its hook, so it showed twice; the fix takes the card itself down and puts it back as the ticket lands.',
    edits: [
      { file: 'poppy-coverage/scene.ts', find: 'const laid = carried.length ? [new AnimationGroup([c.leave(\'skill:card\', { runTime: 0.2 }), carried[0] as Animation]), ...carried.slice(1)] : [];', replace: 'const laid = carried;' },
      { file: 'poppy-coverage/scene.ts', find: 'const ticket = card ? [...sent.slice(0, -1), new AnimationGroup([sent.at(-1) as Animation, c.enter(\'skill:card\', {}, { runTime: 0.2 })])] : sent;', replace: 'const ticket = sent;' },
    ],
  },
  {
    id: 'coverage-reach-over-strips', chapter: 'poppy-coverage', kind: 'passes over', commit: 'bf773626', method: 'adapted', events: ['use alternative', 'use skill'],
    what: 'The strip that asks for a secret reached straight from the note toward the station, over the strips already settled; the fix sends it alone, first, along a corridor under the rule.',
    edits: [
      { file: 'poppy-coverage/picture.ts', find: 'export const REACH_AT: Vec = [-4.4, RULE_Y - 0.47];', replace: 'export const REACH_AT: Vec = [-5.2, RULE_Y - 0.45];' },
      { file: 'poppy-coverage/scene.ts', find: '        const [lx, ly] = noteLineAt(x.line), corridor: [number, number] = [lx, REACH_AT[1]];\n        return flight(c, x.key, [[lx, ly], corridor, REACH_AT, corridor], { appear: 0.2, move: 1.4, leave: 0.2 })();', replace: '        return flight(c, x.key, [noteLineAt(x.line), REACH_AT], { appear: 0.2, move: 0.8, leave: 0.2 })();' },
      { file: 'poppy-coverage/scene.ts', find: 'return [...laid, ...kept, ...reaching, ...together([left, ticket])];', replace: 'return [...laid, ...kept, ...left, ...reaching, ...ticket];' },
      { file: 'poppy-coverage/scene.ts', find: 'const beat = 0.8, sort = 0.75 + beat + beat + (event === \'use skill\' ? 0.75 + (a.company === \'hostile\' ? 1.8 : 0) : 0);', replace: 'const beat = 0.8, sort = 0.75 + beat + (a.company === \'hostile\' ? beat : 0) + beat + (event === \'use skill\' ? 0.75 + (a.company === \'hostile\' ? 1.2 : 0) : 0);' },
    ],
  },
  {
    id: 'coverage-desk-blinks', chapter: 'poppy-coverage', kind: 'flicker', commit: 'd99c9195', method: 'reverted',
    what: 'The shop’s desk was listed in beats’ fresh, so its unchanged words faded out and came back on every event; the fix drops it from fresh.',
    edits: [
      { file: 'poppy-coverage/scene.ts', find: 'const FRESH = [\'tray:\', \'strip:\'', replace: 'const FRESH = [\'tray:\', \'desk:\', \'strip:\'' },
    ],
  },
  {
    id: 'coverage-user-line-blinks', chapter: 'poppy-coverage', kind: 'flicker', commit: 'd99c9195', method: 'reverted',
    what: 'What the User says was keyed under the tray, which beats’ fresh fades out and back, so the unchanged line blinked on each event; the fix keys it apart.',
    edits: [
      { file: 'poppy-coverage/picture.ts', find: 'who: \'person\' }), `user:${task}`);', replace: 'who: \'person\' }), `tray:user:${task}`);' },
      { file: 'poppy-coverage/scene.ts', find: 'c.keys(\'to\').find((k) => k.startsWith(\'user:\'))!', replace: 'c.keys(\'to\').find((k) => k.startsWith(\'tray:user:\'))!' },
    ],
  },
  {
    id: 'coverage-list-over-labels', chapter: 'poppy-coverage', kind: 'passes over', commit: 'd99c9195', method: 'adapted', events: ['read tasks'],
    what: 'The shop’s list crossed straight from the board to the agent’s tray, over the counter’s labels; the fix brings it down and under the rule.',
    edits: [
      { file: 'poppy-coverage/scene.ts', find: '[[BOARD_AT[0], 2.0], [BOARD_AT[0], REACH_AT[1]], [-1.9, REACH_AT[1]]]', replace: '[BOARD_AT, [-3.4, -2.0]]' },
    ],
  },
  // ------------------------------------------------------------------------------------- discovery
  {
    id: 'discovery-arm-over-register', chapter: 'poppy-discovery', kind: 'passes over', commit: '3038108f', method: 'adapted', events: ['check'],
    what: 'The arm to the issuer was drawn out over the closed register, which gave way only afterwards; the fix closes the register as the arm is drawn.',
    edits: [
      { file: 'poppy-discovery/scene.ts', find: 'if (gate === 3) return [...together([...g([\'out:line\'], [\'out:line\']), ...shut]), ...together(g([\'out:head\', \'out:plate\', \'out:label\', \'out:code\', \'out:note\', \'register:title\', \'register:page\', \'register:none\']))];', replace: 'if (gate === 3) return [...together(g([\'out:line\'], [\'out:line\'])), ...together(shut), ...together(g([\'out:head\', \'out:plate\', \'out:label\', \'out:code\', \'out:note\'])), ...together(g([\'register:title\', \'register:page\', \'register:none\']))];' },
    ],
  },
  {
    id: 'discovery-sheet-over-shop', chapter: 'poppy-discovery', kind: 'passes over', commit: '0a887ad4', method: 'adapted', events: ['check'],
    what: 'The fetched sheet dropped from the address bar straight down over the shop’s fascia to the doorstep, while the address was still changing; the fix changes the address first and brings a document down the street beside the shop.',
    edits: [
      { file: 'poppy-discovery/scene.ts', find: 'const route: [number, number][] = onBoard ? [from, to] : [from, [STREET_X, from[1]], [STREET_X, to[1]], to];', replace: 'const route: [number, number][] = onBoard ? [from, to] : [from, to];' },
    ],
  },
  {
    id: 'discovery-fetch-squeezed', chapter: 'poppy-discovery', kind: 'squeezed', commit: 'bf773626', method: 'adapted', events: ['check'],
    what: 'The fetch’s document appeared and left in 0.15 s and the barrier had a beat of its own, in a 1.3 s runTime the beats overran; the fix gives the token 0.25 s, folds the barrier into the settle and the event 1.5 s.',
    edits: [
      { file: 'poppy-discovery/scene.ts', find: 'route, { appear: 0.25, move: 0.6, leave: 0.25 });', replace: 'route, { appear: 0.15, move: 0.6, leave: 0.15 });\n      const barrier = bring(c, [\'rail:barrier\']) as Animation[];' },
      { file: 'poppy-discovery/scene.ts', find: '        ...token,\n        c.rest({ runTime: 0.35 }),', replace: '        ...token,\n        ...together(barrier),\n        c.rest({ runTime: 0.35 }),' },
      { file: 'poppy-discovery/scene.ts', find: 'after.ran === 1 ? 1.95 : after.ran === 2 ? 1.35 : 1.55', replace: 'after.ran === 1 ? 1.3 : after.ran === 2 ? 0.8 : 1.0' },
    ],
  },
  {
    id: 'discovery-path-slides', chapter: 'poppy-discovery', kind: 'layout motion', commit: 'd99c9195', method: 'reverted', events: ['check'],
    what: 'When a redirect shortened the host, the URL’s path slid left; the fix replaces the whole URL.',
    edits: [
      { file: 'poppy-discovery/scene.ts', find: ' || k === \'url:host\' || k === \'url:path\'));', replace: '));' },
    ],
  },
];

/**
 * Fixes in the audit commits that are not in the corpus, and why. With these, the corpus accounts for
 * every scene and picture hunk of the motion audit commits (d4392856 to 9e7d166a, with 0a887ad4).
 */
export const NOT_IN_CORPUS: readonly { commit: string; chapter: string; what: string; why: string }[] = [
  { commit: '46cdb7e6', chapter: 'poppy-conversations', what: 'filmed after the audit: the owner step’s place card drawn over its own words from 0.5 s until they popped in at the end', why: 'the cause was the engine’s (TransformMatching’s drawing order, fixed in src/animation.ts), not the scene, so no scene edit brings it back; measured by hand instead (docs/TESTING.md)' },
  { commit: '0a887ad4', chapter: 'poppy-browser', what: 'submit rewritten: the code and its half travel as copies and the half is seated after', why: 'the transition was rewritten whole; no one defect can be told from the hunk' },
  { commit: 'd99c9195', chapter: 'poppy-sessions', what: 'the validator’s stamp enters on its own beat; punches lag 0.3 to 0.4', why: 'a re-timing inside the same rewrite as the key’s trip (sessions-key-to-wax-after-check); no separate defect can be told' },
  { commit: 'f3a705cf', chapter: 'poppy-sessions', what: 'the detail step “If the leaked key comes first”, keyed afresh so its change cross-fades', why: 'a new step (#101 item 6), not a fix of an existing one; it has no defective before-state' },
  { commit: 'f3a705cf, 3038108f', chapter: 'poppy-discovery', what: 'runTimes trimmed (0.6/1.7/1.1 s to 0.4/1.2/0.8/1.0 s)', why: 'trims well under any length a reader would find too long; no defect can be told' },
  { commit: '0a887ad4', chapter: 'poppy-conversations', what: 'fades 0.3 to 0.25 s and a settle 0.8 to 0.7 s', why: 're-timing; no defect can be told' },
  { commit: 'bf773626', chapter: 'poppy-sign-in', what: 'on a new sign-in the old key and tag fade with the page, since they are replaced', why: 'before the fix the kit’s flight took the old key away as the new one appeared; what the fix changed on screen cannot be told, and undoing it alone makes a transition the engine refuses' },
  { commit: 'cb20195a', chapter: 'poppy-sessions', what: '“the ticket is brought in first”: a comment and a variable, the order unchanged', why: 'no change of motion' },
  { commit: 'several', chapter: 'poppy, poppy-refusals, poppy-sessions, poppy-conversations, poppy-browser', what: 'layout, wording and drawing changes in the same commits (“chapter 1 design round”, schema fixes)', why: 'not motion' },
];
