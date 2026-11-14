// The method-only pages' whole player: a scenario switch, prev/next, the step's title, caption and SVG.
// No engine, no timeline, no animation: each step is recomputed from (settings, index) on every change.
export interface Step {
  id: string;
  title: string;
  caption: string;
  svg: string;
}
export interface Setting {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  default: string;
}
export interface PageSpec {
  settings: Setting[];
  steps: (values: Record<string, string>) => Step[];
  checks: { q: string; a: string }[];
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

export function mount(root: HTMLElement, spec: PageSpec): void {
  const values: Record<string, string> = Object.fromEntries(spec.settings.map((s) => [s.id, s.default]));
  let index = 0;
  const controls = el('div', { class: 'controls' });
  for (const s of spec.settings) {
    const label = el('label', {}, `${s.label} `);
    const select = el('select', { 'aria-label': s.label });
    for (const o of s.options) {
      const opt = el('option', { value: o.value }, o.label);
      if (o.value === s.default) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => {
      values[s.id] = select.value;
      render();
    });
    label.append(select);
    controls.append(label);
  }
  const nav = el('div', { class: 'nav' });
  const prev = el('button', { type: 'button' }, '← Prev');
  const counter = el('span', { class: 'counter', 'aria-live': 'polite' });
  const next = el('button', { type: 'button' }, 'Next →');
  nav.append(prev, counter, next);
  const title = el('h2');
  const figure = el('div', { class: 'figure' });
  const caption = el('p', { class: 'caption' });
  const checks = el('section', { class: 'checks' });
  checks.append(el('h2', {}, 'Check yourself'));
  for (const c of spec.checks) {
    const d = el('details');
    d.append(el('summary', {}, c.q), el('p', {}, c.a));
    checks.append(d);
  }
  root.append(controls, nav, title, figure, caption, checks);

  function render() {
    const all = spec.steps(values);
    index = Math.max(0, Math.min(index, all.length - 1));
    const s = all[index]!;
    title.textContent = s.title;
    figure.innerHTML = s.svg;
    caption.textContent = s.caption;
    counter.textContent = `Step ${index + 1} of ${all.length}`;
    prev.disabled = index === 0;
    next.disabled = index === all.length - 1;
    checks.hidden = index !== all.length - 1;
  }
  prev.addEventListener('click', () => {
    index--;
    render();
  });
  next.addEventListener('click', () => {
    index++;
    render();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'SELECT') return;
    if (e.key === 'ArrowRight') next.click();
    if (e.key === 'ArrowLeft') prev.click();
  });
  render();
}
