// An explainer folder's own evidence, which `rayner check` holds the scene to before anything else:
// the model's test (model.test.ts), the check answers computed from the model (answers.ts) and the
// files the script's Checked against line names. See docs/REFERENCE.md, "Checks".
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalise } from '../../explain/script.ts';
import { ROOT } from './explain-project.ts';

/** The model test beside the scene and what its run found: how many tests ran, and the names of those that failed. */
export interface ModelTestReport {
  file: string;
  tests: number;
  passed: number;
  failed: string[];
}

const exists = (file: string) => access(file).then(() => true, () => false);

/** The package's entry points, as the model test's imports name them, and the module each is. */
const ENTRY_POINTS: Record<string, string> = {
  rayner: 'src/index',
  'rayner/explain': 'explain/index',
  'rayner/drawing': 'explain/drawing',
  'rayner/lettering': 'src/lettering',
  'rayner/output': 'src/output',
  'rayner/testing': 'explain/testing',
};
/**
 * A module hook for the model test's process: a `rayner` import that Node cannot resolve from the
 * explainer's folder (one outside a project that installs Rayner) is this Rayner, the one running
 * the check. Where Node can resolve it, it is left alone.
 */
function raynerResolution(): string {
  const built = import.meta.url.endsWith('.js');
  const map = Object.fromEntries(
    Object.entries(ENTRY_POINTS).map(([name, path]) => [name, pathToFileURL(join(ROOT, built ? `dist/${path}.js` : `${path}.ts`)).href]),
  );
  const hook = `const map=${JSON.stringify(map)};export async function resolve(s,c,next){try{return await next(s,c)}catch(e){if(Object.hasOwn(map,s))return{url:map[s],shortCircuit:true};throw e}}`;
  const register = `import{register}from'node:module';register(${JSON.stringify('data:text/javascript,' + encodeURIComponent(hook))});`;
  return 'data:text/javascript,' + encodeURIComponent(register);
}

/**
 * A node:test reporter that writes each test that ended as a line of JSON: its name with its suites'
 * in front, whether it passed, and the first lines of its error. Suites and skipped tests are left out.
 */
const REPORTER =
  'data:text/javascript,' +
  encodeURIComponent(
    `export default async function*(events){const path=[];for await(const {type,data:d} of events){` +
      `if(type==='test:start')path[d.nesting]=d.name;` +
      `if((type==='test:pass'||type==='test:fail')&&d.details?.type!=='suite'&&!d.skip&&!d.todo){` +
      `const e=d.details?.error,c=e?.cause instanceof Error?e.cause.message:e?.cause?.message??e?.message;` +
      `yield JSON.stringify({name:[...path.slice(0,d.nesting),d.name].join(' > '),passed:type==='test:pass',error:typeof c==='string'?c:undefined})+'\\n'}}}`,
  );

/**
 * Run the `model.test.ts` beside `sceneFile` with `node --test` in a child process, and report it;
 * undefined when the folder has none. Only the model test: a folder's scene tests run the scene,
 * which check runs anyway, and are for the project's test suite.
 */
export async function runModelTest(sceneFile: string): Promise<ModelTestReport | undefined> {
  const file = join(dirname(sceneFile), 'model.test.ts');
  if (!(await exists(file))) return undefined;
  // A check run from inside a test run must not make the model test report to that run.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number | null }>((done, fail) => {
    const child = spawn(process.execPath, ['--import', raynerResolution(), '--test', `--test-reporter=${REPORTER}`, file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d));
    child.stderr.on('data', (d: Buffer) => (stderr += d));
    child.on('error', fail);
    child.on('close', (code) => done({ stdout, stderr, code }));
  });
  const results = stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as { name: string; passed: boolean; error?: string });
  const failed = results
    .filter((r) => !r.passed)
    .map((r) => {
      const said = r.error?.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3).join(' ');
      return said ? `${r.name} (${said})` : r.name;
    });
  // A run that fails with no test failing (it could not start) says why on its stderr.
  if (code !== 0 && !failed.length) failed.push(`node --test exited with ${code}: ${stderr.trim().split('\n').slice(-3).join(' ')}`);
  const shown = relative(process.cwd(), file);
  return { file: shown.startsWith('..') ? file : shown, tests: results.length, passed: results.filter((r) => r.passed).length, failed };
}

/** A check as answers.ts computes it: its answer, or its question, its answer or both. */
type Computed = string | { question?: string; answer?: string };
/** What answers.ts exports: the script's answer, and check answers by 1-based number or by question. */
export interface AnswersModule {
  answer?: () => string;
  checks?: Record<string, () => Computed>;
}
export interface AnswersReport {
  file: string;
  /** How many of the script's parts were computed from the model and compared: the answer counts as one. */
  compared: number;
  problems: string[];
}

/**
 * Hold the script's answer and check answers to those `answers.ts` computes from the model, compared
 * as the answer gate compares (explain/script.ts normalise). `load` imports answers.ts.
 */
export async function compareAnswers(
  sceneFile: string,
  meta: { answer?: unknown; checks?: unknown } | undefined,
  load: (file: string) => Promise<Record<string, unknown>>,
): Promise<AnswersReport | undefined> {
  const file = join(dirname(sceneFile), 'answers.ts');
  if (!(await exists(file))) return undefined;
  const module = (await load(file)) as AnswersModule;
  const shown = relative(process.cwd(), file) || file;
  const problems: string[] = [];
  let compared = 0;
  if (module.answer === undefined && module.checks === undefined)
    problems.push('answers.ts exports neither answer nor checks');
  const differs = (what: string, script: string, model: string) =>
    problems.push(`${what}: script.md says "${script}", the model gives "${model}"`);
  if (module.answer !== undefined) {
    if (typeof module.answer !== 'function') problems.push('answers.ts: answer must be a function of the model');
    else {
      compared++;
      const model = module.answer();
      if (typeof meta?.answer !== 'string') problems.push('answers.ts computes an answer, and the script has none');
      else if (normalise(meta.answer) !== normalise(model)) differs('The answer', meta.answer, model);
    }
  }
  const checks = (Array.isArray(meta?.checks) ? meta.checks : []) as { question: string; answer: string }[];
  for (const [key, compute] of Object.entries(module.checks ?? {})) {
    if (typeof compute !== 'function') {
      problems.push(`answers.ts: checks[${JSON.stringify(key)}] must be a function of the model`);
      continue;
    }
    // A number is the question's place in ## Check yourself, from 1; any other key is the question itself.
    const at = /^[1-9]\d*$/.test(key) ? Number(key) - 1 : checks.findIndex((c) => normalise(c.question) === normalise(key));
    const check = checks[at];
    if (!check) {
      problems.push(/^\d+$/.test(key) ? `answers.ts computes check ${key}, and the script asks ${checks.length}` : `answers.ts computes the answer to "${key}", and the script asks no such question`);
      continue;
    }
    compared++;
    const computed = compute();
    const model = typeof computed === 'string' ? { answer: computed } : computed;
    if (typeof model.question !== 'string' && typeof model.answer !== 'string') {
      problems.push(`answers.ts: check ${at + 1} gives neither a question nor an answer`);
      continue;
    }
    if (typeof model.question === 'string' && normalise(check.question) !== normalise(model.question)) differs(`Check ${at + 1}'s question`, check.question, model.question);
    if (typeof model.answer === 'string' && normalise(check.answer) !== normalise(model.answer)) differs(`Check ${at + 1} ("${check.question}")`, check.answer, model.answer);
  }
  return { file: shown, compared, problems };
}

/** Text in backticks that reads as a file path: no spaces or code punctuation, and a slash or a file extension. */
const PATHLIKE = /^(?![a-z]+:\/\/)[^\s()'"=,;<>`]+$/;
const EXTENSION = /\.(?:ts|js|mjs|cjs|json|py|go|mod|sum|md|txt|csv|tsv|html|svg|c|h|rs|toml|ya?ml|xml|ics|sh|geojson|otf|ttf|woff2?)$/;
/** The backticked file paths in a Checked against line, as written. */
export function namedPaths(checkedAgainst: string): string[] {
  return [...checkedAgainst.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1]!)
    .filter((text) => PATHLIKE.test(text) && (text.includes('/') || EXTENSION.test(text)));
}
export interface CheckedAgainstReport {
  /** Each backticked path the line names, all of them there. */
  files: string[];
  problems: string[];
}
/** Every backticked relative path in the script's Checked against line must be a file or folder in the explainer's folder. */
export async function checkedAgainstFiles(sceneFile: string, checkedAgainst: unknown): Promise<CheckedAgainstReport | undefined> {
  if (typeof checkedAgainst !== 'string') return undefined;
  const folder = dirname(sceneFile),
    files = namedPaths(checkedAgainst),
    problems: string[] = [];
  for (const path of files) {
    const target = resolve(folder, path);
    if (isAbsolute(path) || relative(folder, target).startsWith('..' + sep) || relative(folder, target) === '..')
      problems.push(`\`${path}\` is outside the explainer's folder; name a file in it, relative to script.md`);
    else if (!(await exists(target))) problems.push(`\`${path}\` is not in the explainer's folder (${relative(process.cwd(), folder) || '.'})`);
  }
  return { files, problems };
}
