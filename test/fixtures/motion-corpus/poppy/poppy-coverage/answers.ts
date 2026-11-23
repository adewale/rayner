// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { isRefusal } from '../../../explain/index.ts';
import { COMPANY, answer } from '../poppy/model.ts';
import type { Scope } from '../poppy/model.ts';
import {
  POPPY_JSON_WITH_TASKS, SKILL_BYTES, TASKS, asksOf, coverageOf, exchangeRequest, keyOf, mayReport, reportFor, reportProblems, start,
  tasksResponse, verifies, weigh,
} from './model.ts';
import type { Ask, Context, Use } from './model.ts';

const from = (task: keyof typeof TASKS): Context => ({ task: TASKS[task], from: COMPANY.domain, doc: POPPY_JSON_WITH_TASKS, allowScripts: false });
const because = (u: Use) => { if (u.use) throw new Error('expected the agent to ignore this ask'); return u.because; };
const ask = (source: 'alternative' | 'skill', kind: Ask['kind'], says?: string) => {
  const found = asksOf(source, 'hostile').find((a) => a.kind === kind && (!says || a.says.includes(says)));
  if (!found) throw new Error(`no ${kind} ask in the hostile ${source}`);
  return found;
};

export const questions = {
  1: () => {
    const way = ask('alternative', 'way', 'applyGiftCard'), send = ask('alternative', 'send');
    if (!weigh(way, from('gift')).use) throw new Error('applyGiftCard should be used');
    return `It uses applyGiftCard, an API listed in example.com’s poppy.json, and ignores the address book: ${because(weigh(send, from('gift')))}.`;
  },
  2: () => {
    const readOnly: readonly Scope[] = ['orders:read'];
    const a = answer(exchangeRequest(keyOf(start('hostile', readOnly))));
    const script = ask('skill', 'script');
    return `The exchange gets ${a.status} ${a.error}, naming ${a.needs}, because a skill grants no scope; and ${script.kind === 'script' ? script.path : ''} is not run, since neither you nor the agent’s configuration allowed it.`;
  },
  3: () => `Its model was never given it: ${because(weigh(ask('skill', 'reveal'), from('exchange')))}. Requests are signed and sent in code the model cannot read.`,
  4: () => {
    const coverage = coverageOf(tasksResponse('honest')), report = reportFor('gift');
    if (reportProblems(report).length) throw new Error('the report names something it should not');
    const close = mayReport('close', coverage, []);
    if (!isRefusal(close) || mayReport('gift', coverage, []) !== true) throw new Error('expected one report');
    return `One, “${report.task}”, naming no order, name or ID. None for closing the account: ${close.reason}.`;
  },
  5: () => {
    const [entry] = coverageOf(tasksResponse('hostile')).skills;
    return verifies(entry!, SKILL_BYTES.hostile)
      ? 'No. The digest proves the bytes are the ones the Company listed, so a hostile Company’s own skill verifies too. Its steps are still advice, used only for your task.'
      : 'Yes.';
  },
};
