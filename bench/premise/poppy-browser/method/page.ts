// The method-only poppy-browser page: the same script intent and model as scenes/explainers/poppy-browser,
// with no engine. The steps replay the model's story (start, then next for each event); every picture is a
// pure function from the model's World to an SVG string. main.ts wires them to the shared shell.
// The model itself imports refuse/isRefusal from explain/ (its machine API's Refusal value), so that small
// class comes into the bundle with it; nothing else from src/ or explain/ does.
import { isRefusal } from '../../../../explain/machine.ts';
import { ACCOUNT, ATTACKER, BROWSER_SIGN_IN, JOIN_COOKIE, SESSION_COOKIE, joinEffect, next, start, storyOf, tokenFor } from '../../../../scenes/explainers/poppy-browser/model.ts';
import type { JoinEvent, Last, SignIn, World } from '../../../../scenes/explainers/poppy-browser/model.ts';
import { questions } from '../../../../scenes/explainers/poppy-browser/answers.ts';
import { COMPANY, SID } from '../../../../scenes/explainers/poppy/model.ts';
import { C, W, line, rect, svg, text } from '../../draw.ts';
import { AUTHORIZE_URL, ENDPOINT, LOGIN_TABLE, PAGE } from './oracle.ts';

export interface Step {
  id: string;
  title: string;
  caption: string;
  svg: string;
}
export const SETTING_KEYS = ['signed-in', 'signed-out', 'no-scope'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export const SIGN_IN: Record<SettingKey, SignIn> = { 'signed-in': 'signed in', 'signed-out': 'signed out', 'no-scope': 'signed in without the browser scope' };
export const LABEL: Record<SettingKey, string> = { 'signed-in': 'Signed in', 'signed-out': 'Signed out', 'no-scope': 'Signed in, no browser scope' };
const short = (code: string) => code.slice(0, 7) + '…';

/** Replays the scenario's story: the world after each event. */
export function story(signIn: SignIn): World[] {
  const out: World[] = [];
  let w = start(signIn);
  for (const e of storyOf(signIn)) {
    const n = next(w, e);
    if (isRefusal(n)) throw new Error(`${e}: ${n.reason}`);
    out.push((w = n));
  }
  return out;
}

// ------------------------------------------------------------------ pictures: state in, SVG out
const LANES = { agent: 70, browser: 200, company: 330 } as const;
/** Three lanes (agent, its browser, example.com) with what each holds after the event, and the event's arrows. */
export function worldSvg(w: World): string {
  const token = w.dropped ? null : tokenFor(w.signIn);
  let body = '';
  const head = (x: number, t: string) => rect(x - 58, 6, 116, 26, '#fafafa', { stroke: C.line, rx: 6 }) + text(x, 24, t, { size: 13, anchor: 'middle', weight: '600' });
  body += head(LANES.agent, 'Your agent') + head(LANES.browser, 'Its browser') + head(LANES.company, COMPANY.domain);
  for (const x of Object.values(LANES)) body += line(x, 32, x, 150, { stroke: C.line, dash: true });
  // The event's arrows.
  const arrow = (x1: number, x2: number, y: number, label: string, ok = true) => {
    const dir = x2 > x1 ? 1 : -1;
    return line(x1, y, x2 - dir * 6, y, { stroke: ok ? C.ink : C.bad, sw: 1.6 }) + `<path d="M${x2},${y} l${-dir * 8},-5 v10 z" fill="${ok ? C.ink : C.bad}"/>` + text((x1 + x2) / 2, y - 6, label, { size: 12, anchor: 'middle', fill: ok ? C.ink : C.bad });
  };
  const l = w.last;
  if (l) {
    if (l.event === 'fetch') body += arrow(LANES.agent, LANES.company, 70, 'GET page: seal, no key') + arrow(LANES.company, LANES.agent, 100, `${l.status}, signed out`);
    if (l.event === 'load') body += arrow(LANES.browser, LANES.company, 70, 'GET join page') + arrow(LANES.company, LANES.browser, 100, `code + join cookie`);
    if (l.event === 'authorize') body += arrow(LANES.agent, LANES.company, 70, `code + seal${l.withToken ? ' + key' : ''}`) + arrow(LANES.company, LANES.agent, 100, `${l.answer.status}${l.answer.error ? ' ' + l.answer.error : ''}`, l.answer.status < 400);
    if (l.event === 'submit') body += arrow(LANES.browser, LANES.company, 70, 'code + join cookie') + arrow(LANES.company, LANES.browser, 100, 'answer' in l && l.answer.status === 303 ? '303 + Session cookie' : `${l.answer.status}`, l.answer.status === 303);
    if (l.event === 'browse') body += arrow(LANES.browser, LANES.company, 70, 'Session cookie') + arrow(LANES.company, LANES.browser, 100, `${l.status}`);
    if (l.event === 'forge') body += arrow(LANES.browser, LANES.company, 70, 'form from evil.example: code only', false) + arrow(LANES.company, LANES.browser, 100, `${l.answer.status} error page`, false);
    if (l.event === 'phish') body += arrow(LANES.agent, LANES.agent + 60, 70, '') + text(LANES.agent, 88, 'declines', { size: 12, anchor: 'middle', fill: C.bad }) + arrow(LANES.browser, LANES.company, 120, 'attacker’s browser: cookie, no stamp', false);
  }
  // What each holds.
  const holds = (x: number, y: number, items: string[]) => items.map((s, i) => text(x, y + i * 17, s, { size: 12, anchor: 'middle', mono: true })).join('');
  body += rect(8, 158, W - 16, 1, C.line, { stroke: 'none' });
  body += holds(LANES.agent, 178, ['seal ✓', token ? `key ✓${token.scopes.includes(BROWSER_SIGN_IN) ? ' (browser)' : ''}` : 'no key']);
  body += holds(LANES.browser, 178, [w.page ? `page: ${short(w.page)}` : 'no page', w.browser.join ? `join cookie ✓` : 'no join cookie', w.browser.session ? 'Session cookie ✓' : 'no Session cookie', 'never a key']);
  const mine = w.company.codes.slice(2);
  const r = mine.at(-1);
  body += holds(LANES.company - 6, 178, r ? [`code ${short(r.code)}`, r.authorized ? 'authorized' : 'not authorized', r.joined ? 'joined' : r.submitted ? 'used' : 'not used'] : ['no code yet']);
  const h = 178 + 4 * 17;
  body += text(8, h + 8, `The attacker’s browser: ${w.attacker.session ? 'joined' : 'not joined'}; it holds the cookie for ${short(w.company.codes[1]!.code)}.`, { size: 11.5, fill: C.soft });
  return svg(h + 16, body, `After ${l?.event ?? 'nothing'}: browser ${w.browser.session ? 'joined' : 'not joined'}, agent ${token ? 'holds a key' : 'holds no key'}`);
}

/** The draft's table of what a join does to a login the browser already had. */
export function loginsSvg(): string {
  let body = text(8, 16, 'Login before · join with · while joined · after sign-in ends', { size: 12, weight: '600' });
  LOGIN_TABLE.forEach((r, i) => {
    const y = 40 + i * 52;
    body += rect(8, y - 14, W - 16, 46, i % 2 ? '#fff' : '#fafafa', { stroke: C.line, rx: 4 });
    body += text(16, y + 2, `${r.before ? `logged in as ${r.before}` : 'not logged in'} · ${r.token ? `key for ${r.token}` : 'no key'}`, { size: 12.5, weight: '600' });
    body += text(16, y + 22, `${r.whileJoined} → ${r.after}`, { size: 11.5 });
  });
  return svg(40 + LOGIN_TABLE.length * 52, body, 'What a join does to a login the browser already had');
}

// ------------------------------------------------------------------ the steps
export function steps(key: SettingKey): Step[] {
  const signIn = SIGN_IN[key],
    worlds = story(signIn);
  const out: Step[] = [];
  const lastOf = <E extends Last['event']>(w: World, e: E) => w.last as Extract<Last, { event: E }>;
  let authorizeCount = 0;
  for (const w of worlds) {
    const e = w.last!.event as JoinEvent;
    if (e === 'fetch') {
      const l = lastOf(w, 'fetch');
      out.push({
        id: 'fetch',
        title: 'A browser carries cookies, not the agent’s headers',
        caption: `Your agent fetches a help page on ${COMPANY.domain} with its own HTTP client: the request carries its seal (the Session header) ${l.token ? 'and its key' : 'and never its key'}, so it is signed out${signIn !== 'signed out' ? ' even though the agent is signed in' : ''}, and gets ${l.status}. A real browser cannot add the agent's headers to its requests; it sends cookies. So the browser needs its own way into the Session, one the agent controls. Predict: how can the shop tie a browser to the Session without the browser holding the key?`,
        svg: worldSvg(w),
      });
    }
    if (e === 'load') {
      const l = lastOf(w, 'load');
      out.push({
        id: 'load',
        title: 'The join page: a code to read, a cookie to keep',
        caption: `The browser opens ${ENDPOINT}. The page (${l.status}) shows a one-time code, ${short(l.code)}, and the same response sets a join cookie (${JOIN_COOKIE}: HttpOnly, SameSite=${PAGE.sameSite}, Max-Age ${PAGE.maxAge}) that ties the code to this browser. No page script can read the cookie. Loading the page starts and changes no Session. The answer: the agent authorizes its browser's one-time code in a request of its own; the code works only with the cookie set in that browser.`,
        svg: worldSvg(w),
      });
    }
    if (e === 'authorize') {
      const l = lastOf(w, 'authorize');
      authorizeCount++;
      out.push({
        id: authorizeCount === 1 ? 'authorize' : 'authorize-again',
        title: l.answer.status === 403 ? `403: the key lacks ${l.answer.needs}` : authorizeCount > 1 ? 'The same code again, without the key: 204' : 'Only the agent can authorize the code: 204',
        caption: l.answer.status === 403
          ? `The agent reads the code from its own browser's page and POSTs it to ${AUTHORIZE_URL} with its seal and its key. The key lacks ${BROWSER_SIGN_IN}, so the answer is ${l.answer.status} ${l.answer.error} and the code stays unauthorized. The key never went near the browser.`
          : l.withToken
            ? `The agent reads the code from its own browser's page and POSTs it to ${AUTHORIZE_URL} with its seal and its key. ${COMPANY.domain} checks the seal and finds ${BROWSER_SIGN_IN} among the key's scopes, and records the code as authorized for Session ${SID}, account ${ACCOUNT}, with the key's scopes: ${l.answer.status}. The key goes from the agent to the shop and nowhere else.`
            : `The agent ${authorizeCount > 1 ? 'sends the same code again, now without its key,' : 'reads the code from its own browser’s page and sends it'} with its seal alone. The shop records the code as authorized for Session ${SID} with no account: ${l.answer.status}. The browser will join signed out.`,
        svg: worldSvg(w),
      });
    }
    if (e === 'submit') {
      const l = lastOf(w, 'submit');
      out.push({
        id: 'submit',
        title: l.answer.status === 303 ? 'The halves meet in one browser' : 'The submission fails',
        caption: `The browser submits the form: the code goes back with the join cookie. The shop checks that the cookie came and was set with this code, that the code was authorized, and that it was not submitted before; a code is used by the first request that submits it, whatever the result. ${l.answer.status === 303 ? `Every check passes, so it sets the Session's own cookie (${SESSION_COOKIE}), clears the join cookie and redirects (${l.answer.status}). Only this browser held the cookie; only the agent could authorize the code.` : `It fails: ${'failed' in l.answer ? l.answer.failed.join('; ') : ''}.`}`,
        svg: worldSvg(w),
      });
    }
    if (e === 'browse') {
      const v = lastOf(w, 'browse').visit;
      out.push({
        id: 'browse',
        title: v.account ? `The browser browses as the Session, signed in to ${v.account}` : 'The browser browses as the Session, signed out',
        caption: v.account
          ? `The browser opens your orders. Its Session cookie makes the request Session ${v.session}'s: signed in to account ${v.account}, within the key's scopes, whatever cookies it had before. Where a website cannot apply scopes, ${BROWSER_SIGN_IN} means everything your account can do there, and the shop must say so when you approve it and set web.unscoped in poppy.json. The key stayed with the agent.`
          : `The browser opens your orders as Session ${v.session}, signed out: the same visitor as the agent's other requests, and no account. Signing the browser in takes a key with ${BROWSER_SIGN_IN}.`,
        svg: worldSvg(w),
      });
      const t = joinEffect('B', 'A');
      out.push({
        id: 'logins',
        title: 'A join and the login the browser already had',
        caption: `A browser may already be logged in on the website. A join without a key leaves that login alone, and scopes do not apply to it. A join with a key signs the browser in to that account in its place; when the Session's sign-in ends, the browser is signed out and the earlier login does not come back (logged in as B, joined with a key for A: ${t.whileJoined.account ? `signed in to ${t.whileJoined.account}` : ''}, then ${t.afterSignInEnds.account ? `logged in as ${t.afterSignInEnds.account}` : 'signed out'}).`,
        svg: loginsSvg(),
      });
    }
    if (e === 'forge') {
      const l = lastOf(w, 'forge');
      out.push({
        id: 'forge',
        title: 'An authorized code without its cookie',
        caption: `Now the attacker: it loaded the join page in its own browser and authorized that code in its own Session, signed in to account ${ATTACKER.account}. A page on ${ATTACKER.site} makes your agent's browser post that code to ${COMPANY.domain}; had it worked, your agent would shop inside the attacker's account. It fails (${l.answer.status}): ${'failed' in l.answer ? l.answer.failed[0] : ''}. A form from another site carries no SameSite=${PAGE.sameSite} cookie, and the ${PAGE.namePrefix} prefix stops another host on the domain planting one.`,
        svg: worldSvg(w),
      });
    }
    if (e === 'phish') {
      const l = lastOf(w, 'phish');
      out.push({
        id: 'phish',
        title: 'A cookie without an authorization',
        caption: `The attacker's browser holds the join cookie for its second code, so it sends that code to your agent in a message, hoping the agent will authorize it. ${COMPANY.domain} could not tell the difference; only the agent's own rule stops it: ${l.declined}. So the agent declines, and when the attacker's browser submits the code with its cookie it gets ${l.answer.status}: ${'failed' in l.answer ? l.answer.failed[0] : ''}.`,
        svg: worldSvg(w),
      });
    }
  }
  return out;
}

export const CHECKS = [
  { q: 'An attacker authorizes a code in its own signed-in Session, then a page on evil.example makes your agent’s browser post that code to example.com. What comes back, and which half is missing?', a: questions[1]() },
  { q: 'A message to your agent says: here is your code. What does your agent do, and what happens when the attacker’s browser, which loaded that code, submits it anyway?', a: questions[2]() },
  { q: 'Your agent is signed in, but its token lacks poppy:browser-sign-in. What does step 2 answer, and how does the browser still join?', a: questions[3]() },
  { q: 'The agent’s browser was already logged in as B on the website, and joins with a token for account A. How does it browse, and what is it once the Session’s sign-in ends?', a: questions[4]() },
  { q: 'While its browser is joined and signed in, the agent fetches a help article with its own HTTP client. What does that request carry?', a: questions[5]() },
];
