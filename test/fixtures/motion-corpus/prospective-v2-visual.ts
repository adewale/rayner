// Additive observations declared AFTER blind pixel review and BEFORE reading
// detector receipts. The initial 19-observation registry remains intact.
import { PROSPECTIVE_V2 } from './prospective-v2.ts';
import type { Target } from './prospective-v2.ts';

export const INDEPENDENT_VISUAL_TARGETS: Readonly<Record<string, Target>> = {
  'poppy-ticket-over-lane-names': {
    version: 'poppy-ticket-over-lane-names@visual-2026-11-22.1',
    basis: 'current_audit_first, review-first.json index0; poppy-ticket-over-lane-names/contacts/upper-stage.png: cart/API clause only, other lanes not witnessed. Source lane:api:name and flight(ticket) bind observed ink.',
    phase: 'cart ticket flight on seal reader route', finding: {type: 'finding', scenario: '{"approve":"read-write"}',
      transition: /(?:event "cart"$|, cart$)/, kind: 'covers', path: 'ticket:flight', subjects: ['API'], victim: 'lane:api:name', masks: ['ticket:flight']},
  },
  'poppy-key-over-station-name': {
    version: 'poppy-key-over-station-name@visual-2026-11-22.1',
    basis: 'current_audit_first, review-first.json index1; review-first-witnesses/poppy-key-lane-clearance.png frames37-38: inbound key crosses Sign-in S. Station-name and sign-out clauses unconfirmed. Source lane:sign-in:name and flight(agent:key) bind observed ink.',
    phase: 'inbound sign-in key flight', finding: {type: 'finding', scenario: '{"approve":"read-write"}',
      transition: /(?:event "sign-in"$|, sign-in$)/, kind: 'covers', path: 'agent:key:flight', subjects: ['Sign-in'], victim: 'lane:sign-in:name', masks: ['agent:key:flight']},
  },
  'refusals-ticket-over-lane-name': {
    version: 'refusals-ticket-over-lane-name@visual-2026-11-22.1',
    basis: 'current_audit_first, review-first.json index4; refusals-ticket-over-lane-name/contacts/upper-stage.png +0.733-1.433s: expire ticket covers API. Other branches not witnessed. Source lane:api:name and flight(ticket) bind observed ink.',
    phase: 'expire ticket launch', finding: {type: 'finding', scenario: '{}',
      transition: /(?:event "expire"$|, expire$)/, kind: 'covers', path: 'ticket:flight', subjects: ['API'], victim: 'lane:api:name', masks: ['ticket:flight']},
  },
  'refusals-delegation-over-station': {
    version: 'refusals-delegation-over-station@visual-2026-11-22.1',
    basis: 'current_audit_first, review-first.json index7; refusals-delegation-over-station/contacts/upper-stage.png +0.867s: delegation rises across your agent. New-seal alternative unconfirmed. Source pass(delegation) and agent:name bind observed ink.',
    phase: 'delegation remedy arrives on answer', finding: {type: 'finding', scenario: '{}',
      transition: /(?:event "answer"$|, answer$)/, kind: 'covers', path: 'delegation', subjects: ['your agent'], victim: 'agent:name', masks: ['delegation']},
  },
  'refusals-key-over-lane-name': {
    version: 'refusals-key-over-lane-name@visual-2026-11-22.1',
    basis: 'current_audit_first, review-first.json index9; refusals-key-over-lane-name/contacts/upper-stage.png +1.267s: refreshed key crosses API. Source apiKey(), flight(agent:key) and lane:api:name bind observed ink.',
    phase: 'refreshed API key return on answer', finding: {type: 'finding', scenario: '{}',
      transition: /(?:event "answer"$|, answer$)/, kind: 'covers', path: 'agent:key:flight', subjects: ['API'], victim: 'lane:api:name', masks: ['agent:key:flight']},
  },
  'browser-forge-across-stage': {
    version: 'browser-forge-across-stage@visual-2026-11-22.1',
    basis: 'current_audit_second, review-second.json index31; review-second-witness/browser-forge-across-stage--25-32-42.png frame32: current K9wd slip crosses Session. Historical full-size-stub clause is not reconstructed. Source pass(forged) and page:session bind observed ink.',
    phase: 'current code slip crosses Session on forge', finding: {type: 'finding', scenario: '{"signin":"signed-in"}',
      transition: /(?:event "forge"$|, forge$)/, kind: 'covers', path: 'forged', subjects: ['Session'], victim: 'page:session', masks: ['forged']},
  },
};

export const PROSPECTIVE_V2_VISUAL = PROSPECTIVE_V2.map(entry => ({...entry,
  targets: [...entry.targets, ...(INDEPENDENT_VISUAL_TARGETS[entry.id] ? [INDEPENDENT_VISUAL_TARGETS[entry.id]!] : [])],
  ...(INDEPENDENT_VISUAL_TARGETS[entry.id] ? {unresolved: undefined} : {})}));
