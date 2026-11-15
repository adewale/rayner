import { mount } from '../../shell.ts';
import { CHECKS, DEFAULT, SHOWN, steps } from './page.ts';
import type { Shown } from './page.ts';
import { CHARS, PREDICATES } from '../../../../scenes/explainers/isdigit/model.ts';
import type { Predicate } from '../../../../scenes/explainers/isdigit/model.ts';

const NAMES: Record<Shown, string> = { arabic: 'Arabic-Indic', super: 'superscript', half: 'fraction', roman: 'Roman', han: 'Chinese' };
mount(document.getElementById('app')!, {
  settings: [
    { id: 'char', label: 'Character', default: DEFAULT.char, options: SHOWN.map((k) => ({ value: k, label: `${CHARS[k].char} ${NAMES[k]}` })) },
    { id: 'guard', label: 'Checked with', default: DEFAULT.guard, options: PREDICATES.map((p) => ({ value: p, label: `${p}()` })) },
  ],
  steps: (v) => steps(v.char as Shown, v.guard as Predicate),
  checks: CHECKS,
});
