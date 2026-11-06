// Runs the ical-recurrence model's stored objects through sabre/vobject 4.5.7 in Docker
// (composer:2.8 image): validate(PROFILE_CALDAV), expand(), and the iTIP Broker that sabre/dav
// uses to deliver to a local attendee. Used by test/explain-ical-recurrence.test.ts.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ics, SERIES, INVITED, organiserCopy, copyOf, ORGANISER, GUEST, MASTER, MOVE_OVERRIDE, SERVER_CASES } from '../../scenes/explainers/ical-recurrence/model.ts';
import type { Change, Copy, VEvent } from '../../scenes/explainers/ical-recurrence/model.ts';

export const SABRE_VERSION = '4.5.7';
export const IMAGE = 'composer:2.8';

/** A stored VEVENT as sabre reads it back: the fields the model has. */
export interface Stored {
  recurrenceId: string | null;
  dtstart: string;
  rrules: string[];
  exdates: string[];
  attendees: string[];
  status: string | null;
}
export interface CalendarAnswer {
  /** validate(PROFILE_CALDAV) messages, level and text. */
  validate: [number, string][];
  /** DTSTART of each VEVENT expand() returns, UTC, in sabre's order. */
  starts: string[];
}
export interface ScheduleAnswer {
  messages: { method: string; components: Stored[] }[];
  copy: Stored[];
  starts: string[];
}
export interface SabreAnswers {
  calendars: Record<string, CalendarAnswer>;
  schedules: Record<string, ScheduleAnswer>;
}

const CHANGES: Change[] = ['none', 'move', 'skip'];
/** RFC 5545 §3.8.5.3's weekly examples (lines 6927–6958), with DTSTART read as UTC. */
export const RFC_EXAMPLES: Record<string, { dtstart: string; rrule: string }> = {
  'weekly, 10 occurrences': { dtstart: '19970902T090000Z', rrule: 'FREQ=WEEKLY;COUNT=10' },
  'weekly until 24 December 1997': { dtstart: '19970902T090000Z', rrule: 'FREQ=WEEKLY;UNTIL=19971224T000000Z' },
};

/** Every input the test sends: each scenario's copy, the series before and after the invitation, the refusals, the RFC examples. */
export function inputs() {
  const calendars: Record<string, { ics: string; from: string; to: string }> = {};
  const window = { from: '2026-01-01', to: '2028-01-01' };
  calendars['series'] = { ics: ics(SERIES), ...window };
  calendars['invited'] = { ics: ics(INVITED), ...window };
  for (const change of CHANGES) for (const copy of ['organiser', 'guest'] as Copy[]) calendars[`${change}/${copy}`] = { ics: ics(copyOf(change, copy)), ...window };
  for (const [name, cs] of Object.entries(SERVER_CASES)) calendars[name] = { ics: ics(cs), ...window };
  // sabre's expand() with no master takes the first override as the master after recording its
  // RECURRENCE-ID as an exception (EventIterator.php:121–142); this one's RECURRENCE-ID differs from its DTSTART.
  calendars['moved override only'] = { ics: ics([MOVE_OVERRIDE]), ...window };
  for (const [name, ex] of Object.entries(RFC_EXAMPLES))
    calendars[name] = { ics: ics([{ ...MASTER, dtstart: ex.dtstart, rrules: [ex.rrule] }]), from: '1997-01-01', to: '1999-01-01' };
  // The organiser's saves for each change: the series, the invitation, then the change.
  const schedules: Record<string, { saves: string[]; organiser: string; attendee: string }> = {};
  for (const change of CHANGES)
    schedules[change] = {
      saves: [SERIES, INVITED, ...(change === 'none' ? [] : [organiserCopy(change)])].map(ics),
      organiser: ORGANISER,
      attendee: GUEST,
    };
  return { calendars, schedules };
}

const PHP = String.raw`<?php
require 'vendor/autoload.php';
use Sabre\VObject;
$in = json_decode(file_get_contents('in.json'), true);
function utc($dt) { return $dt->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z'); }
function summary($cal) {
  $out = [];
  foreach ($cal->select('VEVENT') as $e) $out[] = [
    'recurrenceId' => isset($e->{'RECURRENCE-ID'}) ? (string) $e->{'RECURRENCE-ID'} : null,
    'dtstart' => (string) $e->DTSTART,
    'rrules' => array_map('strval', $e->select('RRULE')),
    'exdates' => array_map('strval', $e->select('EXDATE')),
    'attendees' => array_map(fn($a) => (string) $a, $e->select('ATTENDEE')),
    'status' => isset($e->STATUS) ? (string) $e->STATUS : null,
  ];
  return $out;
}
function starts($cal, $from, $to) {
  $x = $cal->expand(new DateTime($from), new DateTime($to));
  return array_map(fn($e) => utc($e->DTSTART->getDateTime()), $x->select('VEVENT'));
}
$out = ['calendars' => [], 'schedules' => []];
foreach ($in['calendars'] as $name => $c) {
  $cal = VObject\Reader::read($c['ics']);
  $out['calendars'][$name] = [
    'validate' => array_map(fn($w) => [$w['level'], $w['message']], $cal->validate(VObject\Node::PROFILE_CALDAV)),
    'starts' => starts($cal, $c['from'], $c['to']),
  ];
}
foreach ($in['schedules'] as $name => $s) {
  $broker = new VObject\ITip\Broker();
  $copy = null;
  $messages = [];
  for ($i = 1; $i < count($s['saves']); $i++) {
    $old = VObject\Reader::read($s['saves'][$i - 1]);
    $new = VObject\Reader::read($s['saves'][$i]);
    foreach ($broker->parseEvent($new, [$s['organiser']], $old) as $m) {
      if ($m->recipient !== $s['attendee']) continue;
      $messages[] = ['method' => $m->method, 'components' => summary($m->message)];
      $copy = $broker->processMessage($m, $copy);
    }
  }
  $out['schedules'][$name] = ['messages' => $messages, 'copy' => $copy ? summary($copy) : [], 'starts' => $copy ? starts($copy, '2026-01-01', '2028-01-01') : []];
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
`;

/** A digest of every input, so a frozen answer can say which inputs it answers. */
export const inputsDigest = () => createHash('sha256').update(JSON.stringify(inputs())).digest('hex');

/** The shell script piped into `docker run --rm -i composer:2.8 sh -s`. */
export function script(): string {
  return [
    'set -e',
    'cd /tmp',
    `composer require -q sabre/vobject:${SABRE_VERSION} >/dev/null 2>&1`,
    "cat > in.json <<'JSON_EOF'",
    JSON.stringify(inputs()),
    'JSON_EOF',
    "cat > t.php <<'PHP_EOF'",
    PHP,
    'PHP_EOF',
    'php t.php',
  ].join('\n');
}

/** Run sabre/vobject now; null with a reason when Docker cannot. */
export function runSabre(): { answers: SabreAnswers } | { skip: string } {
  const r = spawnSync('docker', ['run', '--rm', '-i', IMAGE, 'sh', '-s'], { input: script(), encoding: 'utf8', timeout: 600e3 });
  if (r.error || r.status !== 0) return { skip: `docker run ${IMAGE} failed: ${r.error?.message ?? r.stderr.slice(-500)}` };
  return { answers: JSON.parse(r.stdout) as SabreAnswers };
}

/** The answers frozen in ical-recurrence-sabre.json, with the image, version and inputs they answer. */
export interface Frozen {
  image: string;
  sabre: string;
  inputsDigest: string;
  answers: SabreAnswers;
}

// `node test/lib/ical-recurrence-sabre.ts > test/lib/ical-recurrence-sabre.json` refreshes the frozen copy.
if (import.meta.main) {
  const r = runSabre();
  if ('skip' in r) {
    console.error(r.skip);
    process.exit(1);
  }
  const frozen: Frozen = { image: IMAGE, sabre: SABRE_VERSION, inputsDigest: inputsDigest(), answers: r.answers };
  console.log(JSON.stringify(frozen, null, 1));
}
