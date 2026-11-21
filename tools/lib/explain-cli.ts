// One command vocabulary for parsing, help and examples. Options are parsed before any scene loads.
import { parseArgs } from 'node:util';
import { extname } from 'node:path';
import { manifest } from './roots.ts';
import { DIAGRAM_PACKAGES, installCommand } from './addons.ts';

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
  out: { type: 'string' },
  scenario: { type: 'string', multiple: true },
  port: { type: 'string' },
  refresh: { type: 'boolean' },
  watch: { type: 'boolean' },
  subjects: { type: 'string' },
  machine: { type: 'boolean' },
  blank: { type: 'boolean' },
  question: { type: 'string' },
} as const;
type Option = Exclude<keyof typeof OPTIONS, 'help' | 'version'>;
const OPTION_HELP: Record<Option, string> = {
  out: '--out <path>         Artifact destination (see the command description)',
  scenario: '--scenario id=value  Select one scenario; repeat for different settings',
  port: '--port <integer>     Local server port, 0–65535 (default 5174; 0 chooses a free port)',
  refresh: '--refresh            Recapture pinned diagrams instead of reusing them',
  watch: '--watch              Rebuild after source or script changes; reload the browser',
  subjects: '--subjects <path>    Review subjects JSON, instead of <scene>.review.json',
  machine: '--machine            Write the machine starter (a door that locks)',
  blank: '--blank              Write a blank explainer with TODOs for your own question',
  question: '--question <text>    With --blank, set the reader’s question in script.md',
};
interface CommandSpec {
  args: string;
  summary: string;
  details: string;
  options: readonly Option[];
  examples: readonly string[];
}
const COMMANDS = {
  init: {
    args: '<directory>', summary: 'Create an explainer in a new directory',
    details: 'Writes script.md, scene.ts, model.ts and model.test.ts. The default is the\ntutorial’s LRU/MRU explainer. --machine adds a machine picture and review subjects.\n--blank leaves TODOs; check lists the work still needed, in order.',
    options: ['machine', 'blank', 'question'],
    examples: ['rayner init my-explainer', 'rayner init my-explainer --blank --question "Why does this happen?"', 'rayner init door --machine'],
  },
  snapshots: {
    args: '<scene>', summary: 'Prepare pinned diagram and lettering assets',
    details: 'Runs every scenario, captures missing diagrams and requested lettering, verifies\nmorph edits, and removes unused diagram snapshots. Commit scene.snapshots/ and\nscene.lettering.json when present. --refresh recaptures every diagram.\nRun this after changing a diagram or lettering that other commands cannot load.',
    options: ['refresh'], examples: ['rayner snapshots my-explainer/scene.ts', 'rayner snapshots my-explainer/scene.ts --refresh'],
  },
  check: {
    args: '<scene>', summary: 'Run model tests and scene checks in Node',
    details: 'Checks every scenario: model tests, state and picture agreement, seeking, motion,\ntext, legibility and authoring requirements. Writes reports under out/checks/<id>/\nor --out <directory>. Consumes pinned assets; does not prepare them.\ncheck does not test the served browser page. Use review for that.',
    options: ['out'], examples: ['rayner check my-explainer/scene.ts', 'rayner check my-explainer/scene.ts --out out/checks/my-explainer'],
  },
  build: {
    args: '<scene>', summary: 'Write the HTML page and its receipt',
    details: 'Writes HTML, its build receipt, a response-header recipe and loader.js.\nDefaults to out/explainers/<id>.html; --out names the HTML file. Consumes pinned\nassets. build does not run check or the browser review. To save a page after both,\nuse review --out page.html.',
    options: ['out'], examples: ['rayner build my-explainer/scene.ts --out public/my-explainer.html', 'rayner review my-explainer/scene.ts --out public/my-explainer.html'],
  },
  review: {
    args: '<scene>', summary: 'Run check, build, and review the served page in Chromium',
    details: 'Runs check, builds the page and checks its served reader at phone and desktop\nwidths. Consumes pinned assets. Keeps HTML, screenshots and review.json under\nout/review/<id>/. --out <directory> moves those artifacts; --out page.html saves\nthe exact reviewed HTML there and keeps reports in the default directory.\nA passing review covers these checks; the author still checks the explanation\nagainst its sources. Chromium is required.',
    options: ['out', 'subjects'], examples: ['rayner review my-explainer/scene.ts', 'rayner review my-explainer/scene.ts --out public/my-explainer.html'],
  },
  preview: {
    args: '<scene>', summary: 'Prepare assets, build, and serve locally',
    details: 'Prepares diagram and lettering assets, builds the page, then serves it on\nlocalhost. --watch rebuilds on save; reload the browser to see the new page.\n--out names the built HTML (default out/explainers/<id>.html).\npreview does not run check or review. Stop the server with Ctrl-C.',
    options: ['out', 'refresh', 'port', 'watch'], examples: ['rayner preview my-explainer/scene.ts --watch', 'rayner preview my-explainer/scene.ts --port 5175'],
  },
  'contact-sheet': {
    args: '<scene>', summary: 'Write one scenario’s resting steps as a PNG and SVG sheet',
    details: 'Draws every step’s resting picture in one contact sheet. Uses the default\nscenario unless --scenario selects settings. Consumes pinned assets. --out names\nthe PNG, with an SVG beside it; defaults to out/contact-sheets/<id>.png.',
    options: ['out', 'scenario'], examples: ['rayner contact-sheet my-explainer/scene.ts --out out/steps.png', 'rayner contact-sheet my-explainer/scene.ts --scenario next=reuse'],
  },
  describe: {
    args: '<scene>', summary: 'Print every scenario and step as JSON',
    details: 'Prints words, state, changes and text drawings for every scenario and step.\n--out writes the JSON to a file instead. Consumes pinned assets.\nUse see for one selected step’s readable terminal output.',
    options: ['out'], examples: ['rayner describe my-explainer/scene.ts', 'rayner describe my-explainer/scene.ts --out description.json'],
  },
  see: {
    args: '<scene> [step]', summary: 'Print one resting step as text in the terminal',
    details: 'Prints the resting picture as text, its caption, description and state changes.\nDefaults to the last step of the default scenario. Choose a step by name and\nsettings with --scenario. --out also writes the picture as SVG. Consumes pinned\nassets. Use describe for every scenario and step as JSON.',
    options: ['out', 'scenario'], examples: ['rayner see my-explainer/scene.ts', 'rayner see my-explainer/scene.ts verdict --scenario next=reuse --out verdict.svg'],
  },
  version: { args: '', summary: 'Print the version (also --version)', details: 'Prints the installed Rayner package version.', options: [], examples: ['rayner version'] },
  help: { args: '[command]', summary: 'Show help (also -h or --help)', details: 'Show the workflow, or the usage, options and examples for one command.', options: [], examples: ['rayner help', 'rayner help review', 'rayner review --help'] },
} as const satisfies Record<string, CommandSpec>;
type Command = keyof typeof COMMANDS;
const commandNames = Object.keys(COMMANDS) as Command[];

const SETUP = `Node 24+ is required. Scenes with no diagrams or lettering need Node alone,\nexcept review, which opens Chromium. PNG contact sheets are included.\nChromium: use an installed Chrome/Chromium, or npx playwright-core install chromium;\nCHROMIUM_EXECUTABLE_PATH can select an executable.\nDiagram preparation: ${installCommand(DIAGRAM_PACKAGES)}\nLettering preparation: Python and source fonts (docs/LETTERING.md).\nPinned diagram and lettering assets replay without their capture tools; morph\nedits still need the diagram add-on.`;

function usage(command: Command): string {
  return `Usage: rayner ${command}${COMMANDS[command].args ? ' ' + COMMANDS[command].args : ''}${COMMANDS[command].options.length ? ' [options]' : ''}`;
}
export function help(command?: Command): string {
  if (command) {
    const spec = COMMANDS[command];
    return `${usage(command)}\n\n${spec.details}\n\nOptions:\n${spec.options.map((name) => '  ' + OPTION_HELP[name]).join('\n')}${spec.options.length ? '\n' : ''}  -h, --help          Show this help\n\nExamples:\n${spec.examples.map((line) => '  ' + line).join('\n')}\n${['init', 'version', 'help'].includes(command) ? '' : '\nA scene is a scene.ts file or a directory containing scene.ts.\n'}`;
  }
  return `Rayner ${manifest.version} (Node 24+)\n\nUsage: rayner <command> [arguments] [options]\n\nCommands:\n${commandNames.map((name) => '  ' + name.padEnd(16) + COMMANDS[name].summary).join('\n')}\n\nAuthoring workflow:\n  init → edit → snapshots (when assets need preparation) → check\n  build writes a page; review runs check + build + browser checks.\n  review --out public/page.html saves the exact reviewed page.\n  preview --watch prepares assets, builds and serves while you edit.\n  see reads one step as text; describe reads all steps as JSON.\n\nOnly snapshots and preview prepare or prune pinned assets. Other scene commands\nconsume them and explain when preparation is needed.\nRun rayner <command> --help for its options and examples.\n\n${SETUP}\n`;
}

/** Suggest a nearby spelling without accepting abbreviations as commands. */
function suggest(word: string): Command | undefined {
  const distance = (other: string) => {
    let row = Array.from({ length: other.length + 1 }, (_, i) => i);
    for (let i = 0; i < word.length; i++) {
      const next = [i + 1];
      for (let j = 0; j < other.length; j++) next.push(Math.min(next[j]! + 1, row[j + 1]! + 1, row[j]! + (word[i] === other[j] ? 0 : 1)));
      row = next;
    }
    return row[other.length]!;
  };
  const ranked = commandNames.map((name) => ({ name, distance: distance(name) })).sort((a, b) => a.distance - b.distance);
  return ranked[0]!.distance <= 2 && ranked[0]!.distance < ranked[1]!.distance ? ranked[0]!.name : undefined;
}
function commandNamed(word: string): Command {
  if (Object.hasOwn(COMMANDS, word)) return word as Command;
  const near = suggest(word);
  throw new RangeError(`${JSON.stringify(word)} is not a command; ${near ? `did you mean rayner ${near}? ` : ''}run rayner --help to list commands`);
}

export function invocation(args: string[]) {
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options: OPTIONS }); }
  catch (error) {
    const first = args[0];
    throw new TypeError(`${(error as Error).message}; run rayner ${first && Object.hasOwn(COMMANDS, first) ? first + ' ' : ''}--help for usage`);
  }
  const { values: flags, positionals } = parsed;
  const [word, ...operands] = positionals;
  if (!word) {
    const extra = Object.keys(flags).find((key) => key !== 'help' && key !== 'version');
    if (extra) throw new TypeError(`--${extra} needs a command; run rayner --help to choose one`);
    if (flags.help && flags.version) throw new TypeError('choose rayner --help or rayner --version');
    return flags.version ? { command: 'version' as const } : { command: 'help' as const, text: help() };
  }
  const command = commandNamed(word);
  for (const name of Object.keys(flags)) {
    if (name === 'help') continue;
    if (!(COMMANDS[command].options as readonly string[]).includes(name)) {
      const owners = commandNames.filter((c) => (COMMANDS[c].options as readonly string[]).includes(name));
      throw new TypeError(`--${name} is not an option of rayner ${command}; ${name === 'version' ? 'run rayner --version' : `use it with ${owners.map((c) => 'rayner ' + c).join(' or ')}; run rayner ${command} --help`}`);
    }
  }
  const maximum = command === 'see' ? 2 : command === 'version' ? 0 : 1;
  if (operands.length > maximum) throw new TypeError(`${JSON.stringify(operands[maximum])} is one argument too many\n${usage(command)}\nRun rayner ${command} --help for examples`);
  if (flags.help) return { command: 'help' as const, text: help(command) };
  if (command === 'help') return { command: 'help' as const, text: help(operands[0] ? commandNamed(operands[0]) : undefined) };
  if (command === 'version') return { command };
  const [input, step] = operands;
  if (!input) throw new TypeError(`rayner ${command} needs ${command === 'init' ? 'a new directory' : 'a scene file or directory'}\n${usage(command)}\nRun rayner ${command} --help for examples`);
  if (flags.question !== undefined && !flags.blank) throw new TypeError('--question needs rayner init --blank; run rayner init --help');
  if (flags.blank && flags.machine) throw new TypeError('rayner init takes --blank or --machine, not both');
  if (command === 'contact-sheet' && flags.out && extname(flags.out) && extname(flags.out).toLowerCase() !== '.png')
    throw new TypeError('--out names a PNG file (or a name without an extension); an SVG is written beside it; run rayner contact-sheet --help');
  if (flags.port !== undefined && (!/^\d+$/.test(flags.port) || Number(flags.port) > 65535))
    throw new TypeError('--port must be an integer from 0 to 65535; run rayner preview --help');
  for (const assignment of flags.scenario ?? []) if (assignment.indexOf('=') < 1)
    throw new TypeError('--scenario takes id=value, such as --scenario request=miss');
  return { command, input, step, flags };
}
