import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIntent, intentMeta } from '../tools/lib/explain-intent.ts';
import { listed, numberWord, percent } from '../scenes/explainers/lib/format.ts';
import * as password from '../scenes/explainers/2password/model.ts';
import * as bloom from '../scenes/explainers/bloom-filter/model.ts';
import * as cert from '../scenes/explainers/cert-renewal/model.ts';
import { secondCommit } from '../scenes/explainers/exgit/objects.ts';
import * as ext4 from '../scenes/explainers/ext4-space/model.ts';
import type { Size } from '../scenes/explainers/ext4-space/model.ts';
import { SAMPLE_FEED } from '../scenes/explainers/gtfs/feed.ts';
import { readFeed, tripsOn } from '../scenes/explainers/gtfs/model.ts';
import * as ical from '../scenes/explainers/ical-recurrence/model.ts';
import type { VEvent } from '../scenes/explainers/ical-recurrence/model.ts';
import { CHARS, SPACE, predicates, rewrite } from '../scenes/explainers/isdigit/model.ts';
import { exec } from '../scenes/explainers/just-bash/model.ts';
import type { Shell } from '../scenes/explainers/just-bash/model.ts';
import { oddsAfter } from '../scenes/explainers/monty-hall/model.ts';
import { INT4, INT8, TEXT_CHARS, fill, shortText, tuple } from '../scenes/explainers/pg-page/model.ts';
import type { Attr } from '../scenes/explainers/pg-page/model.ts';
import * as qf from '../scenes/explainers/quotient-familial/model.ts';
import { RingBuffer } from '../scenes/explainers/ring-buffer/model.ts';
import { arrayQueue } from '../scenes/explainers/ring-buffer/picture.ts';
import { CHECK_TYPES, INNERS, isSend, isSync, nameOf, t } from '../scenes/explainers/send-sync/model.ts';
import type { RustType } from '../scenes/explainers/send-sync/model.ts';
import { sessionAttempt } from '../scenes/explainers/state-machine/model.ts';
import * as charts from '../scenes/explainers/statecharts/model.ts';
import type { StateNode } from '../scenes/explainers/statecharts/model.ts';
import * as gamut from '../scenes/explainers/tailwind-gamut/model.ts';
import { frac, nodeShares, ruleShares, rules, shares, value } from '../scenes/explainers/traffic-policy/model.ts';
import { ADDR, TRUSTED_RANGES, TRUST_CODE, reqIp } from '../scenes/explainers/trust-proxy/model.ts';

// Each explainer's answer and check answers used to be computed from its model inside the scene's
// static meta. They now live as fixed text in script.md, so each test below recomputes them from the
// model, with the expressions the scene used before the move (commit 8ed1dbbd), and holds the script's
// text to the result. A failure means the model and the script disagree: fix whichever is wrong.

/** The script's intent as the page's metadata takes it (title, answer without its full stop, checks). */
const script = (id: string) => {
  const file = `scenes/explainers/${id}/script.md`;
  const intent = parseIntent(readFileSync(file, 'utf8'), file);
  assert.ok(intent, `${file} has no intent header`);
  return intentMeta(intent);
};
/** The script's check questions and answers, at least `n` of them. */
const checksOf = (id: string, n: number) => {
  const checks = script(id).checks ?? [];
  assert.ok(checks.length >= n, `${id}: expected ${n} checks, the script has ${checks.length}`);
  return checks;
};

test('2password: the script’s check answers are find’s result on a query that matches no title', () => {
  const { ITEMS, SUGGESTION_THRESHOLD, closeness, find, terms } = password;
  const query = 'cloud key',
    result = find([query]);
  assert.equal(result.matches.length, 0);
  assert.ok(!result.suggestions);
  const best = Math.max(...ITEMS.map((i) => closeness(terms(query), i.title))).toFixed(3),
    calls = result.opCalls.length;
  const m = find(['cloud api']).matches[0]!,
    [vault, title, field] = m.ref.slice('op://'.length).split('/');
  const checks = checksOf('2password', 3);
  assert.equal(checks[0]!.question, `The agent searches for “${query}”, hoping to find the API key. What does find return, and why?`);
  assert.equal(
    checks[0]!.answer,
    `Nothing. No title contains “key”, so nothing matches, and no title is spelled close enough to be suggested (the closest scores ${best} against a cut-off of ${SUGGESTION_THRESHOLD}). find compares the query with titles only; it cannot know that ${title} holds a key, and it makes ${calls} op call, the item list, without fetching any item.`,
  );
  assert.equal(checks[2]!.question, `The agent’s transcript, containing ${m.ref}, is pasted into a team chat. What does the team learn, and can they read the key?`);
  assert.equal(
    checks[2]!.answer,
    `They learn names: a vault called ${vault}, an item titled ${title} and a field called ${field}. Reading the value still needs an op session with access to that vault; the reference carries no permission. The names themselves can still be sensitive, since they say which vaults and items exist.`,
  );
});

test('bloom-filter: the script’s check answers are the filter’s verdicts after eel joins and after dog’s bits are cleared', () => {
  const { TAKEN, locations, makeFilter, membership } = bloom;
  const bits = makeFilter([...TAKEN, 'eel'], 32);
  const EEL = { at: locations('eel', 32), wolf: membership(bits, 'wolf'), owl: membership(bits, 'owl'), owlZeros: locations('owl', 32).filter((i) => !bits[i]) };
  const CLEARED = ([16, 32] as const).map((size) => {
    const row = makeFilter([...TAKEN], size);
    for (const i of locations('dog', size)) row[i] = 0;
    return { size, cat: membership(row, 'cat'), shared: locations('dog', size).filter((i) => locations('cat', size).includes(i)) };
  });
  const checks = checksOf('bloom-filter', 2);
  assert.equal(checks[0]!.question, `In the 32-bit filter, someone also takes eel, whose hashes are ${listed(EEL.at)}. What does the filter now say about wolf, and about owl?`);
  assert.equal(
    checks[0]!.answer,
    `wolf gets ${EEL.wolf ? 'maybe' : 'definitely not'}, a false positive: bit 23 now comes from eel, 22 from cat and 1 from dog and eel. owl still gets ${EEL.owl ? 'maybe' : 'definitely not'}: eel set bit 20, but bits ${listed(EEL.owlZeros)} are still 0.`,
  );
  // The answer's words take the verdicts as given: cat refused at 16 bits, still maybe at 32.
  assert.deepEqual(CLEARED.map((c) => c.cat), [false, true]);
  assert.equal(
    checks[1]!.answer,
    `At 16 bits, definitely not: bit ${listed(CLEARED[0]!.shared)} was shared, so clearing dog’s bits cleared one of cat’s, and the filter turns away a taken name, which a Bloom filter must never do. At 32 bits it still says maybe, but only because dog’s bits there happen to miss cat’s. The row cannot tell which names set a bit, so clearing a departing name’s bits can erase evidence of another name.`,
  );
});

test('cert-renewal: the script’s check answers are the renewal model’s counts for 20-day certificates and a 10-day setting', () => {
  const { DAY, LIFETIMES, RUN_EVERY, YEAR, dueAt, dueByInterval, issue, simulate, summarize } = cert;
  const days = (hours: number) => +(hours / DAY).toFixed(1);
  const twenty = 20 * DAY,
    year = (r: Parameters<typeof simulate>[0]) => simulate(r, twenty, YEAR),
    c20 = issue(0, twenty),
    shortLived = summarize('fixed30', '160h');
  const c45 = issue(0, LIFETIMES['45d'].hours),
    interval = 10 * DAY;
  let tenDay = RUN_EVERY;
  while (!dueByInterval(c45.notAfter, tenDay, interval)) tenDay += RUN_EVERY;
  let tenDayRetries = 0;
  for (let at = tenDay; at < c45.notAfter; at += RUN_EVERY) tenDayRetries++;
  const CHECK = {
    twenty: {
      fixed: { renewals: year('fixed30').issued.length - 1, refused: year('fixed30').refused.length, first: year('fixed30').refused[0] },
      share: { due: dueAt('fraction', c20) - c20.notBefore, renewals: year('fraction').issued.length - 1 },
      sameAsShort: year('fixed30').issued.length - 1 === shortLived.renewalsPerYear && year('fixed30').refused.length === shortLived.refusedPerYear,
    },
    tenDay: { at: tenDay, retries: tenDayRetries, fraction: summarize('fraction', '45d') },
  };
  const checks = checksOf('cert-renewal', 2);
  assert.equal(
    checks[0]!.answer,
    `With the 30-day setting, ${CHECK.twenty.fixed.renewals} renewed and ${CHECK.twenty.fixed.refused} runs refused, the first at hour ${CHECK.twenty.fixed.first}${CHECK.twenty.sameAsShort ? ', exactly as for 160-hour certificates' : ''}: any certificate shorter than 30 days is due from issue, so every run asks until the limit refuses. The default renews two thirds of the way through, since 20 days is not under ten: at day ${days(CHECK.twenty.share.due)}, ${CHECK.twenty.share.renewals} times a year.`,
  );
  assert.equal(
    checks[1]!.answer,
    `At day ${days(CHECK.tenDay.at)}, the first twice-daily run within 10 days of expiry, leaving ${CHECK.tenDay.retries} runs to retry. The setting replaces the default rather than adding to it: without it Certbot would renew at day ${days(CHECK.tenDay.fraction.due)} with ${CHECK.tenDay.fraction.retries} runs to spare.`,
  );
});

test('exgit: the script’s check answers name the objects and ids the model writes for a rename and a copy', () => {
  const short = (id: string) => id.slice(0, 7);
  const RENAMED = secondCommit('rename'),
    COPIED = secondCommit('copy');
  const kinds = (c: ReturnType<typeof secondCommit>) => {
    const types = c.written.map((id) => c.repo.objects[id]!.type);
    return ['blob', 'tree', 'commit']
      .filter((k) => types.includes(k))
      .map((k) => `a ${k}`)
      .join(' and ');
  };
  const checks = checksOf('exgit', 3);
  assert.equal(
    checks[0]!.answer,
    `${RENAMED.written.length} objects, ${kinds(RENAMED)}. The name lives in the tree’s bytes, so the tree changes, and so does the commit that names it. The file’s bytes are unchanged, so its id is still ${short(RENAMED.hello)} and the new tree names the stored blob.`,
  );
  assert.equal(
    checks[1]!.answer,
    `None. Its bytes hash to ${short(COPIED.hello)}, which is already stored, so the new tree lists both names against that one blob. The commit writes ${COPIED.written.length} objects, ${kinds(COPIED)}.`,
  );
  assert.equal(
    checks[2]!.answer,
    `The blobs do: both are ${short(COPIED.hello)}, because a blob’s id depends only on its bytes. Commits match only if all their bytes match, including the tree, the parents, the author and committer lines with their timestamps, and the message, so in practice they differ.`,
  );
});

test('ext4-space: the script’s answer and check answers are the layout model’s reserve, metadata and journal counts', () => {
  const { BLOCK, BLOCKS_PER_GROUP, DEFAULT_RESERVE, GiB, SIZES, TiB, bytesOf, count, space } = ext4;
  const keys = Object.keys(SIZES) as Size[];
  const RATIOS = keys.map((k) => {
    const x = space(SIZES[k].bytes, DEFAULT_RESERVE);
    return (x.root / x.layout.metadata).toFixed(1);
  });
  const meta = script('ext4-space');
  assert.equal(
    meta.answer,
    `Much of it is free space held back for root: the default 5% reserve is ${RATIOS.slice(0, -1).join(', ')} and ${RATIOS.at(-1)} times all the metadata on the ${keys.map((k) => SIZES[k].label).join(', ').replace(/, ([^,]*)$/, ' and $1')} disks`,
  );
  const TWO = space(2 * GiB, DEFAULT_RESERVE),
    ONE = space(GiB, DEFAULT_RESERVE),
    BELOW = space(4 * TiB - BLOCKS_PER_GROUP * BLOCK, DEFAULT_RESERVE),
    BIG = space(4 * TiB, DEFAULT_RESERVE),
    T5 = space(TiB, DEFAULT_RESERVE),
    T0 = space(TiB, 0);
  const checks = checksOf('ext4-space', 3);
  assert.equal(
    checks[0]!.question,
    `On the 1 GiB disk the default reserve just covers the metadata. Going to 2 GiB doubles the reserve, and also doubles the journal, from ${bytesOf(ONE.layout.journal)} to ${bytesOf(TWO.layout.journal)}. Does the 5% reserve still cover all the metadata?`,
  );
  assert.equal(
    checks[0]!.answer,
    `No, it falls just short: ${count(TWO.root)} reserved blocks against ${count(TWO.layout.metadata)} of metadata, ${(TWO.root / TWO.layout.metadata).toFixed(3)} times. The journal is most of the metadata on a disk this small, so doubling it grows the metadata about as fast as the 5% reserve. These are the counts a recorded mkfs.ext4 1.47.3 run at 2 GiB gives.`,
  );
  assert.equal(
    checks[1]!.answer,
    `The bigger disk has less. Its inode tables are about half the size, so its metadata is ${count(BIG.layout.metadata)} blocks against ${count(BELOW.layout.metadata)}, and users can write ${bytesOf(BIG.users - BELOW.users)} more although the disk grew by only 128 MiB.`,
  );
  assert.equal(
    checks[2]!.answer,
    `They get back the root reserve, ${count(T5.root)} blocks or ${bytesOf(T5.root)}, which was free all along. The ${count(T5.layout.metadata)} blocks of inode tables, journal and other metadata stay, and so do the kernel’s ${count(T0.kernel)}.`,
  );
});

test('gtfs: the script’s check answers are the trips the model runs on the sample feed with one more calendar_dates.txt row', () => {
  const FEED = readFeed(SAMPLE_FEED);
  const plus = (row: string) => readFeed({ ...SAMPLE_FEED, 'calendar_dates.txt': SAMPLE_FEED['calendar_dates.txt'] + '\n' + row });
  const ADD_WE = 'WE,20070604,1',
    CUT_WE = 'WE,20070609,2',
    ADDED = tripsOn(plus(ADD_WE), '20070604').map((trip) => trip.trip_id!),
    CUT_DAY = tripsOn(plus(CUT_WE), '20070609').length,
    CUT_NEXT = tripsOn(plus(CUT_WE), '20070616').length,
    TUESDAY = tripsOn(plus('FULLW,20070605,2'), '20070605').length;
  const checks = checksOf('gtfs', 3);
  assert.equal(
    checks[0]!.answer,
    `calendar_dates.txt: ${ADD_WE}. exception_type 1 adds service WE on that date, so ${listed(ADDED)} run, ${ADDED.length} of the ${FEED.trips.length} trips; routes.txt, trips.txt and stop_times.txt stay as they are.`,
  );
  assert.equal(
    checks[1]!.answer,
    `Deleting the route would remove it from every date and leave four trips whose route_id names nothing. The row ${CUT_WE} in calendar_dates.txt removes WE on that one date: ${CUT_DAY} of the ${FEED.trips.length} trips still run, and the next Saturday keeps all ${CUT_NEXT}.`,
  );
  assert.equal(
    checks[2]!.answer,
    `Like Monday: FULLW would be removed for the day and WE does not run on Tuesdays, so ${TUESDAY ? `${TUESDAY} trips would run` : `none of the ${FEED.trips.length} trips would run`}, though all ${FEED.routes.length} routes stay in routes.txt.`,
  );
});

test('ical-recurrence: the script’s check answers are the series the model expands with the fifth meeting skipped, and Bob’s copy', () => {
  const { DTSTART, GUEST_MEETING, INVITED, MASTER, counts, expand, guestCopy, long, occurrences, parseRule } = ical;
  const plural = (n: number, word: string) => `${numberWord(n)} ${word}${n === 1 ? '' : 's'}`;
  const RULE_STARTS = occurrences(DTSTART, parseRule(MASTER.rrules[0]!));
  const FIFTH = RULE_STARTS[4]!;
  const SKIP_FIFTH: VEvent[] = [{ ...MASTER, exdates: [FIFTH] }, ...INVITED.slice(1)];
  const FIFTH_LEFT = expand(SKIP_FIFTH);
  const BOB = counts(guestCopy('skip').copy);
  const checks = checksOf('ical-recurrence', 3);
  assert.equal(
    checks[0]!.question,
    `Alice skips the fifth meeting, ${long(FIFTH)}, instead of Bob’s, by adding EXDATE:${FIFTH}. How many meetings does her calendar show, and when is the last? What does Bob’s calendar show?`,
  );
  assert.equal(
    checks[0]!.answer,
    `Alice’s shows ${numberWord(FIFTH_LEFT.length)}, the last still on ${long(FIFTH_LEFT.at(-1)!.start)}: COUNT=6 counts the excluded start, so the series does not run a week longer. Bob is still in the third meeting’s override, so any update the server sends him carries that override again, and his calendar keeps ${long(GUEST_MEETING)}, not cancelled.`,
  );
  assert.equal(
    checks[2]!.answer,
    `The master’s DTSTART and RRULE. His copy holds ${plural(BOB.overrides, 'override')} and ${plural(BOB.masters, 'master')}, so it has no rule to generate the other weeks from; only the organiser’s object has one.`,
  );
});

test('isdigit: the script’s answer and check answers are the model’s predicates and rewrites', () => {
  const TF = (b: boolean) => (b ? 'True' : 'False');
  const SPACED = rewrite([SPACE, '7']),
    FLOATS = { arabic: rewrite([CHARS.arabic, '.5']), super: rewrite(['2.', CHARS.super]) };
  assert.equal(script('isdigit').answer, `No: isdigit() is True for ${CHARS.super.char}, and int('${CHARS.super.char}') raises ValueError`);
  const checks = checksOf('isdigit', 2);
  assert.equal(
    checks[0]!.question,
    `s is two characters: ${SPACE.code}, IDEOGRAPHIC SPACE, then an ASCII 7. Its line in UnicodeData.txt is ${SPACE.ucd}. Does the isdigit() guard let s through, and what would int(s) do?`,
  );
  assert.equal(
    checks[0]!.answer,
    `The guard turns s away: ${SPACE.code} has nothing in field 7, so s.isdigit() is ${TF(predicates(SPACE).isdigit)}. Yet int(s) returns 7. Its category Zs makes it whitespace to Python, so the rewrite turns it into a space, '${SPACED}', and int() ignores surrounding spaces. The isdigit() guard also refuses text that int() can parse.`,
  );
  assert.equal(
    checks[1]!.question,
    `float() runs the same rewrite as int() before it parses. What do float('${CHARS.arabic.char}.5') and float('2.${CHARS.super.char}') do?`,
  );
  assert.equal(
    checks[1]!.answer,
    `float('${CHARS.arabic.char}.5') returns 3.5: ${CHARS.arabic.char} has a decimal digit value, so the text becomes '${FLOATS.arabic}'. float('2.${CHARS.super.char}') raises ValueError: ${CHARS.super.char} has none, so the text becomes '${FLOATS.super}', for the same reason int('${CHARS.super.char}') fails.`,
  );
});

test('just-bash: the script’s check answers are what exec returns for two writes from one shell, a bare pipeline and ls', () => {
  const q = (v: string) => JSON.stringify(v);
  const files = (sh: Shell) => Object.keys(sh.fs).join(', ') || 'none';
  const empty: Shell = { fs: {}, steps: 0 },
    first = exec(empty, [['echo', 'hi']], 'a.txt').shell,
    second = exec(empty, [['echo', 'bye']], 'b.txt').shell,
    plain = exec(empty, [
      ['echo', 'hello'],
      ['tr', 'a-z', 'A-Z'],
    ]);
  let ls = '';
  try {
    exec(first, [['ls']]);
  } catch (error) {
    ls = error instanceof Error ? error.message : String(error);
  }
  const CHECK = { branch: { second: files(second) }, plain: { stdout: plain.stdout, files: files(plain.shell) }, ls };
  const checks = checksOf('just-bash', 3);
  assert.equal(
    checks[0]!.answer,
    `The second result holds ${CHECK.branch.second} and nothing else. a.txt is in the first result, because the second command started from the empty shell, which never received the first write.`,
  );
  assert.equal(
    checks[1]!.answer,
    `It prints ${q(CHECK.plain.stdout)}, and the returned shell holds ${CHECK.plain.files === 'none' ? 'no files' : CHECK.plain.files}. Without a redirect the text stays on standard output, so there is no write for the returned shell to carry.`,
  );
  assert.equal(
    checks[2]!.answer,
    `exec throws “${CHECK.ls}”, because this model has branches only for echo, tr and cat. The error says nothing about shout.txt; cat on the returned shell would print its contents.`,
  );
});

test('monty-hall: the script’s check answers are the model’s odds for the coin host and the uneven prior', () => {
  const PRIOR = [4, 3, 3];
  const checks = checksOf('monty-hall', 2);
  assert.equal(
    checks[0]!.answer,
    `${percent(oddsAfter(0, 'coin', 'B').switchChance)}. His strip is the random host’s, cell for cell: with the car behind B or C, he opens each unchosen door half the time, so one of the two sixths in each wrong-pick third shows the car. He knows where the car is, but his rule gives each round the random host’s chance, and those chances set the odds.`,
  );
  assert.equal(
    checks[1]!.answer,
    `With the host who knows, ${percent(oddsAfter(0, 'informed', 'B', PRIOR).switchChance)}: the car-behind-A rounds now fill 40% of the strip and he opens B in half of them, 20%, while all of the car-behind-C rounds, 30%, open B. With the random host, ${percent(oddsAfter(0, 'random', 'B', PRIOR).switchChance)}: he opens B in only half of the car-behind-C rounds, 15%, against the same 20%.`,
  );
});

test('pg-page: the script’s check answers are the tuple model’s sizes for two int4s, an int2 and a 15-character text', () => {
  const INT2: Attr = { name: 'int2', len: 2, align: 2 };
  const rowOf = (attrs: readonly Attr[]) => {
    const tu = tuple(attrs);
    return { ...tu, rows: fill(tu.stored, 100).rows };
  };
  const ONE = rowOf([INT4]),
    TWO = rowOf([INT4, INT4]),
    SMALL_INT = rowOf([INT2]),
    T15 = 15,
    NARROW15 = rowOf([INT4, shortText(T15)]),
    WIDE15 = rowOf([INT8, shortText(T15)]);
  // The answers' wording assumes each changed row costs what its comparison row costs.
  assert.equal(TWO.perRow, ONE.perRow);
  assert.equal(SMALL_INT.perRow, ONE.perRow);
  assert.equal(NARROW15.perRow, WIDE15.perRow);
  const checks = checksOf('pg-page', 3);
  assert.equal(
    checks[0]!.answer,
    `No. The first int4 ends at byte ${ONE.lpLen}, and the second fills bytes ${ONE.lpLen} to ${TWO.lpLen - 1}, the padding one int4 leaves. Both tuples take ${ONE.stored} bytes, so both rows cost ${ONE.perRow} and a page holds ${TWO.rows} of either.`,
  );
  assert.equal(
    checks[1]!.answer,
    `No. Its tuple is ${SMALL_INT.hoff} + 2 = ${SMALL_INT.lpLen} bytes, which the page rounds up to ${SMALL_INT.stored}, the same as int4’s ${ONE.lpLen}. Both rows cost ${ONE.perRow} bytes and a page holds ${SMALL_INT.rows}.`,
  );
  assert.equal(checks[2]!.question, `With a ${T15}-character text after the integer instead of an ${TEXT_CHARS}-character one, does int4 still fit more rows than int8?`);
  assert.equal(
    checks[2]!.answer,
    `No. After an int4 the tuple is ${NARROW15.lpLen} bytes, rounded up to ${NARROW15.stored}; after an int8 it is ${WIDE15.lpLen}, already a multiple of 8. Both rows cost ${NARROW15.perRow} bytes, so the saving the ${TEXT_CHARS}-character text showed disappears.`,
  );
});

test('quotient-familial: the script’s answer and check answers are the impôt model’s figures', () => {
  const { BAREME, NNBSP, PARAMS, euros, impot, partsTexte, pourcent, tranche } = qf;
  const nb = NNBSP,
    deux = `${nb}:`,
    pv = `${nb};`;
  const eur2 = (x: number) => euros(x, 2);
  const tauxTexte = (q: number) => pourcent(BAREME[2024][tranche(q)]!.rate);
  const DEFAUT = impot(65673.88, 1),
    UN30 = impot(30000, 1),
    UN150 = impot(150000, 1),
    BAS = impot(30000, 0),
    PLAT = BAREME[2024][1]!.rate,
    FIN_DECOTE = Math.ceil((PARAMS[2024].decoteSeuil - 0.5) / PARAMS[2024].decoteTaux);
  const meta = script('quotient-familial');
  assert.equal(
    meta.answer,
    `Diviser change l’impôt parce que le barème est progressif${deux} chaque part repart du bas du barème, donc moins d’euros atteignent les tranches les plus taxées que sur le revenu entier`,
  );
  const checks = checksOf('quotient-familial', 3);
  assert.equal(
    checks[0]!.question,
    `Si l’impôt prenait ${pourcent(PLAT)} de chaque euro, sans tranches, un enfant de plus changerait-il l’impôt du couple à ${eur2(65673.88)}${nb}? Pourquoi${nb}?`,
  );
  assert.equal(
    checks[0]!.answer,
    `Non${deux} ${pourcent(PLAT)} × (${eur2(65673.88)} ÷ ${partsTexte(DEFAUT.parts)}) × ${partsTexte(DEFAUT.parts)} = ${pourcent(PLAT)} × ${eur2(65673.88)} = ${eur2(PLAT * 65673.88)}, quel que soit le nombre de parts. Diviser ne change l’impôt que parce que le taux monte avec le revenu${deux} avec un seul taux, aucune part ne fait redescendre d’euros vers un taux plus bas.`,
  );
  assert.equal(
    checks[1]!.question,
    `Avec un enfant, l’avantage de la demi-part reste sous le plafond de ${euros(PARAMS[2024].plafond)} à ${euros(30000)} mais le dépasse à ${eur2(65673.88)}. Pourquoi grandit-il avec le revenu, alors que le plafond reste fixe${nb}?`,
  );
  assert.equal(
    checks[1]!.answer,
    `La demi-part retire des euros du haut du quotient. À ${euros(30000)}, ces euros étaient taxés à ${tauxTexte(30000 / 2)}, et l’avantage vaut ${eur2(UN30.avantage)}. À ${eur2(65673.88)}, le quotient sans enfant, ${eur2(65673.88 / 2)}, atteint la tranche à ${tauxTexte(65673.88 / 2)}${pv} la demi-part le ramène à ${eur2(DEFAUT.quotient)}, dans la tranche à ${tauxTexte(DEFAUT.quotient)}, et l’avantage vaut ${eur2(DEFAUT.avantage)}. Le plafond reprend donc ${eur2(DEFAUT.avantage - DEFAUT.plafond)} ici, et ${eur2(UN150.avantage - UN150.plafond)} à ${euros(150000)}.`,
  );
  assert.equal(
    checks[2]!.question,
    `À ${euros(30000)} sans enfant, le barème donne ${eur2(BAS.plafQf)} d’impôt, et le couple ne paie rien. Quelle étape annule cet impôt, et l’annulerait-elle s’il valait ${euros(4000)}${nb}?`,
  );
  assert.equal(
    checks[2]!.answer,
    `La décote${deux} ${euros(PARAMS[2024].decoteSeuil)} − ${pourcent(PARAMS[2024].decoteTaux)} × ${eur2(BAS.plafQf)} = ${euros(BAS.decote)}, plus que l’impôt, qui tombe à 0. Pour ${euros(4000)}, elle vaudrait ${euros(PARAMS[2024].decoteSeuil)} − ${euros(PARAMS[2024].decoteTaux * 4000)}, moins que zéro${deux} elle ne retire plus rien dès ${euros(FIN_DECOTE)} d’impôt.`,
  );
});

test('ring-buffer: the script’s check answers are the ring’s pops, pointers and copy counts', () => {
  const ring = new RingBuffer<number>(5);
  for (let v = 1; v <= 5; v++) ring.push(v);
  ring.pop();
  ring.pop();
  ring.push(6);
  ring.push(7);
  const out = [ring.pop(), ring.pop(), ring.pop()],
    slot8 = ring.tail;
  ring.push(8);
  const left = Array.from({ length: ring.length }, (_, k) => ring.data[(ring.head + k) % ring.capacity]!);
  const carry = { out, slot8, head: ring.head, left };
  const eight = new RingBuffer<number>(8);
  for (let v = 1; v <= 8; v++) eight.push(v);
  const full8 = eight.snapshot();
  for (let v = 1; v <= 8; v++) eight.pop();
  const empty8 = eight.snapshot();
  let queue = Array.from({ length: 1000 }, (_, i) => i + 1),
    arrayMoves = 0;
  while (queue.length) {
    const step = arrayQueue(queue);
    arrayMoves += step.moved;
    queue = step.after;
  }
  const checks = checksOf('ring-buffer', 3);
  assert.equal(
    checks[0]!.answer,
    `The pops return ${carry.out.join(', ')}, and head wraps to slot ${carry.head}. Tail is still at slot ${carry.slot8}, so 8 goes there. Reading from head gives ${carry.left.join(', ')}: the order comes from head, not from the slot numbers.`,
  );
  assert.equal(
    checks[1]!.answer,
    `Both are at slot ${empty8.head}, just where they were when it was full (head ${full8.head}, tail ${full8.tail}). Only length, ${empty8.length} now against ${full8.length} then, tells empty from full.`,
  );
  assert.equal(
    checks[2]!.answer,
    `The array makes ${arrayMoves.toLocaleString('en')}: each pop copies every value still behind the front, 999, then 998, down to 0. The ring makes none, because a pop moves only head.`,
  );
});

test('send-sync: the script’s check answers are the trait model’s verdicts on Cell, Rc<Mutex<i32>> and Arc<MutexGuard<i32>>', () => {
  const traits = (send: boolean, sync: boolean) =>
    send && sync ? 'Send and Sync' : send ? 'Send but not Sync' : sync ? 'Sync but not Send' : 'neither Send nor Sync';
  const CELL = { send: isSend(INNERS.cell), sync: isSync(INNERS.cell), spawn: isSend(INNERS.cell), scope: isSend(t('&', INNERS.cell)) };
  const [RC_MUTEX, ARC_GUARD] = CHECK_TYPES as [RustType, RustType];
  const checks = checksOf('send-sync', 3);
  assert.equal(
    checks[0]!.answer,
    `${CELL.spawn ? 'The move compiles' : 'The move is refused'}: it hands the whole Cell to the new thread, and Cell<i32> is ${CELL.send ? '' : 'not '}Send. The borrow ${CELL.scope ? 'compiles' : 'is refused'}: the scoped thread would share c with its parent through &c, and Cell<i32> is ${CELL.sync ? '' : 'not '}Sync.`,
  );
  assert.equal(
    checks[1]!.answer,
    `${isSend(RC_MUTEX) ? 'Yes' : 'No'}. Rc’s plain owner count is the problem, not the value inside, so Rc<T> is neither Send nor Sync whatever T is, and ${nameOf(RC_MUTEX)} is ${traits(isSend(RC_MUTEX), isSync(RC_MUTEX))}.`,
  );
  assert.equal(
    checks[2]!.answer,
    `${isSend(ARC_GUARD) ? 'Yes' : 'No'}. Arc needs T to be both Send and Sync, and MutexGuard<i32> is Sync but not Send, so ${nameOf(ARC_GUARD)} is neither.`,
  );
});

test('state-machine: the script’s first check answer is what the reducer does with CONNECT while open', () => {
  const SECOND_CONNECT = sessionAttempt('open', 'CONNECT');
  const checks = checksOf('state-machine', 1);
  assert.equal(
    checks[0]!.answer,
    `It ${SECOND_CONNECT.error ? `throws ${SECOND_CONNECT.error} and the session stays open` : `returns ${SECOND_CONNECT.state}`}, because the table has no open:CONNECT row. An event name the machine knows is still refused in a state with no row for it.`,
  );
});

test('statecharts: the script’s check answers are the flattened machines’ state and transition counts', () => {
  const { FROTHER, RUNS, chartCounts, coffee, coffeeWithFrother, flatCounts, flatten, run } = charts;
  // The check questions' machines, as the scene built them: no step draws them.
  const atomic = (id: string, on?: Record<string, string>): StateNode => ({ id, type: 'atomic', ...(on ? { on } : {}) });
  const frotherRegion = (): StateNode => ({
    id: FROTHER.region,
    type: 'compound',
    initial: FROTHER.states[0],
    children: [atomic(FROTHER.states[0], { [FROTHER.events[0]]: FROTHER.states[1] }), atomic(FROTHER.states[1], { [FROTHER.events[1]]: FROTHER.states[0] })],
  });
  const frotherOutside = (): StateNode => ({ id: 'kit', type: 'parallel', children: [coffee(), frotherRegion()] });
  const frotherInBrewing = (): StateNode => {
    const swap = (n: StateNode): StateNode =>
      n.id === 'brewing' ? { ...frotherRegion(), id: 'brewing', on: n.on } : { ...n, ...(n.children ? { children: n.children.map(swap) } : {}) };
    return swap(coffee());
  };
  const CHECKS = {
    machine: flatten(coffee()).states.length,
    inside: flatCounts(flatten(coffeeWithFrother())),
    outside: flatCounts(flatten(frotherOutside())),
    steam: { flat: flatCounts(flatten(frotherInBrewing())), chart: chartCounts(frotherInBrewing()) },
    again: run(coffeeWithFrother(), [...RUNS.frother, 'POWER_ON']).at(-1)!.config,
  };
  const checks = checksOf('statecharts', 3);
  assert.equal(
    checks[0]!.answer,
    `Outside on, beside the whole machine: since the frother works whether the machine is off or on, it becomes a region next to the off-and-on machine, and the statechart’s top level splits in two. Flat, every one of the machine’s ${CHECKS.machine} states pairs with still or frothing, off included: ${CHECKS.outside.states} states where the frother inside on needed ${CHECKS.inside.states}.`,
  );
  assert.equal(
    checks[1]!.answer,
    `The names are off, idle, grinding, brewing · still, brewing · frothing and ready: ${CHECKS.steam.flat.states} states. Only the brewing states have two words, so the words are not independent and the second sign does not apply. The frother goes inside brewing as a box of two states, which makes brewing a parent: the first idea again. The statechart draws ${CHECKS.steam.chart.transitions} transitions where the flat machine draws ${CHECKS.steam.flat.transitions}.`,
  );
  assert.equal(
    checks[2]!.answer,
    `No. POWER_OFF is taken by on, which leaves both regions; POWER_ON enters on again, and each region starts at its start dot: ${CHECKS.again.join(' and ')}. Nothing in the chart remembers where a region was when the machine went off.`,
  );
});

test('tailwind-gamut: the script’s check answers are the gamut model’s chromas, edges and shares', () => {
  const { cssMap, rows, summarize, swatch } = gamut;
  const pct = (v: number) => percent(v, { of: 100 });
  const deg = (h: number) => `${h.toFixed(1)}°`;
  const OPEN = summarize('500'),
    OPENING = swatch(OPEN.mostOfSrgb.family, '500'),
    OPEN_MAPPED = cssMap(OPENING.L, OPENING.C, OPENING.h, 'srgb'),
    OPEN_ROW = rows('500').find((r) => r.family === OPENING.family)!,
    RAW = rows('500').find((r) => r.family === OPEN.furthest.family)!,
    ROOMY = OPEN.leastOfSrgb.family,
    ROOMY_700 = rows('700').find((r) => r.family === ROOMY)!;
  const checks = checksOf('tailwind-gamut', 3);
  assert.equal(
    checks[0]!.question,
    `An sRGB screen paints ${OPENING.family}-500 with chroma ${OPEN_ROW.shown.toFixed(3)}. Suppose you write that chroma yourself, at ${OPENING.family}-500’s own lightness and hue: oklch(${(OPENING.L * 100).toFixed(1)}% ${OPEN_ROW.shown.toFixed(3)} ${OPENING.h}). Does it fit sRGB?`,
  );
  assert.equal(
    checks[0]!.answer,
    `No. The sRGB edge at that lightness and hue is ${OPEN_ROW.srgb.toFixed(3)}, below ${OPEN_ROW.shown.toFixed(3)}. The mapped colour fits because the final clip also moved it, to lightness ${(OPEN_MAPPED.L * 100).toFixed(1)}% and hue ${deg(OPEN_MAPPED.h)}, where the edge is higher. Whether a chroma fits depends on the lightness and hue it comes with.`,
  );
  assert.equal(
    checks[1]!.question,
    `In raw chroma, ${RAW.family}-500 is the 500 colour furthest past the sRGB edge. Why does the share view put ${OPENING.family}-500 first instead?`,
  );
  assert.equal(
    checks[1]!.answer,
    `The edge sits at a different chroma on every spoke. ${RAW.family}-500 overshoots by ${OPEN.furthest.value.toFixed(3)} on an edge at ${RAW.srgb.toFixed(3)}; ${OPENING.family}’s edge is ${OPEN_ROW.srgb.toFixed(3)}, so its smaller overshoot is a larger share of it.`,
  );
  assert.equal(
    checks[2]!.question,
    `${ROOMY}-500 has the most room of the 500 shades, at ${pct(OPEN.leastOfSrgb.value)} of its sRGB edge. Does that make ${ROOMY}-700 safe on an sRGB screen?`,
  );
  assert.equal(
    checks[2]!.answer,
    `No: ${ROOMY}-700 asks for ${pct(ROOMY_700.ofSrgb)} of its edge, so an sRGB screen maps it. The darker shade has its own lightness and chroma, and the edge moves with lightness, so a family’s name says nothing about whether it fits.`,
  );
});

test('traffic-policy: the script’s check answers are the model’s shares and rule probabilities', () => {
  const FOUR_ONE = shares([4, 1, 0], 'local'),
    FOUR_ONE_NODES = nodeShares([4, 1, 0], 'local'),
    CHAIN4 = rules(['a', 'b', 'c', 'd']);
  const EVEN4 = [0, 1, 2, 3, 4]
    .flatMap((x) => [0, 1, 2, 3, 4].map((y) => [x, y, 4 - x - y]))
    .filter((c) => c[2]! >= 0)
    .filter((c) => new Set(Object.values(shares(c, 'local')).map(frac)).size === 1);
  const EVEN4_SHAPES = [...new Set(EVEN4.map((c) => [...c].sort((a, b) => b - a).join(', ')))];
  const checks = checksOf('traffic-policy', 3);
  assert.equal(
    checks[0]!.answer,
    `Node 3 fails the health check, so Node 1 and Node 2 get ${frac(FOUR_ONE_NODES[0]!)} each. Node 2’s one pod keeps all of its ${frac(FOUR_ONE_NODES[1]!)}; Node 1 splits its ${frac(FOUR_ONE_NODES[0]!)} four ways, ${frac(FOUR_ONE.a!)} each. The lone pod gets ${value(FOUR_ONE.e!) / value(FOUR_ONE.a!)} times as many requests.`,
  );
  assert.equal(
    checks[1]!.answer,
    `${CHAIN4.map((r) => (r.probability ? `1/${Math.round(1 / Number(r.probability))}` : 'always')).join(', then ')}: each rule matches 1/(n−i) of the requests that reach it, so each pod gets ${frac(ruleShares(4)[0]!)} of what the node receives.`,
  );
  assert.equal(
    checks[2]!.answer,
    `Only ${EVEN4_SHAPES.join(' and ')}, in any order of the nodes. Under Local each healthy node gets an equal share and splits it among its own pods, so the shares are even exactly when every node with pods runs the same number.`,
  );
});

test('trust-proxy: the script’s check answers are the addresses reqIp gives for two made-up entries and a third proxy', () => {
  const TWO_FORGED = `5.6.7.8, ${ADDR.forged}`,
    TWO_FORGED_XFF = `${TWO_FORGED}, ${ADDR.attacker}`,
    TWO_FORGED_IP = { 2: reqIp(ADDR.balancer, TWO_FORGED_XFF, 2), true: reqIp(ADDR.balancer, TWO_FORGED_XFF, true) };
  const WAF = '100.64.0.20',
    WAF_XFF = `${ADDR.client}, ${WAF}, ${ADDR.edge}`,
    WAF_LIST_IP = reqIp(ADDR.balancer, WAF_XFF, [...TRUSTED_RANGES, WAF]);
  // The second answer's words: 2 reports the firewall, and the extended list the client.
  assert.equal(reqIp(ADDR.balancer, WAF_XFF, 2), WAF);
  const checks = checksOf('trust-proxy', 3);
  assert.equal(
    checks[0]!.question,
    `The attacker skips the CDN again, but writes two made-up entries: X-Forwarded-For: ${TWO_FORGED}. Which address becomes req.ip with trust proxy 2, and which with true?`,
  );
  assert.equal(
    checks[0]!.answer,
    `With 2, ${TWO_FORGED_IP[2]}: Express trusts the load balancer and the attacker’s real address by position, then stops at the next entry, the made-up one nearest to it. With true, ${TWO_FORGED_IP.true}: every address is trusted, so Express reaches the far end of the list and takes it without a test. Either way the attacker chose req.ip.`,
  );
  assert.equal(
    checks[1]!.question,
    `You put a firewall service at ${WAF} in front of the CDN, so a client’s request now passes three proxies. With trust proxy 2, whose address does req.ip report for a client? Which setting gives the client’s address and still stops the attacker who skips the CDN?`,
  );
  assert.equal(
    checks[1]!.answer,
    `The firewall’s: the two trusted positions now hold the load balancer and the CDN edge, so the third proxy is the first address left. A count of 3 gives the client, but on the route that skips the CDN it trusts every address, and the attacker’s made-up entry becomes req.ip. The address list with ${WAF} added gives the client, ${WAF_LIST_IP}, and the attacker’s real address on the short route.`,
  );
  assert.equal(checks[2]!.question, `What must hold for the address list ${TRUST_CODE.list} to keep req.ip right?`);
});
