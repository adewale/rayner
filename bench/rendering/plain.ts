// The native SVG arm reads the same frozen packet, without importing Rayner's engine or player.
import { cells, summary } from './shared.ts';
import type { Packet } from './shared.ts';
declare global { interface Window { packet: Packet } }
const packet = window.packet;
const params = new URLSearchParams(location.search);
const selected = packet.cases.find((c) => c.id === params.get('case')) ?? packet.cases[0]!;
let index = Math.max(0, selected.steps.findIndex((s) => s.id === params.get('step')));
const svg = document.querySelector('svg')!;
const ns = 'http://www.w3.org/2000/svg';
document.querySelector('#transcript')!.replaceChildren(...selected.steps.map((s) => {
  const p = document.createElement('p');
  p.textContent = `${s.title}. ${s.caption} ${summary(s.state)}. Slots: ${cells(s.state).map((c) => c.label).join(', ')}.`;
  return p;
}));
const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
  const node = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  svg.append(node);
};
function render() {
  const step = selected.steps[index]!;
  document.querySelector('.caption')!.textContent = step.caption;
  document.querySelector('#step-title')!.textContent = step.title;
  document.querySelector('#line')!.textContent = step.line;
  svg.replaceChildren();
  el('text', { x: 0, y: -3.4, 'font-size': 0.65, 'text-anchor': 'middle' }, step.title);
  el('text', { x: 0, y: -2.4, 'font-size': 0.62, 'text-anchor': 'middle' }, summary(step.state));
  const tiles = cells(step.state), start = -(tiles.length - 1) * 1.1;
  for (const [i, tile] of tiles.entries()) {
    const x = start + i * 2.2;
    el('rect', { x: x - 1, y: -0.7, width: 2, height: 1.4, fill: tile.active ? '#dbeafe' : '#ffffff', stroke: '#334155', 'stroke-width': 0.035 });
    el('text', { x, y: 0, 'font-size': 0.65, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, tile.label);
    el('text', { x, y: 1.3, 'font-size': 0.6, 'text-anchor': 'middle' }, String(i));
  }
  document.querySelector<HTMLButtonElement>('#back')!.disabled = index === 0;
  document.querySelector<HTMLButtonElement>('#next')!.disabled = index === selected.steps.length - 1;
  history.replaceState(null, '', `?case=${selected.id}&step=${step.id}`);
  document.dispatchEvent(new CustomEvent('rayner:step', { detail: { step: step.id, settings: { case: selected.id } } }));
}
document.querySelector('#back')!.addEventListener('click', () => { index--; render(); });
document.querySelector('#next')!.addEventListener('click', () => { index++; render(); });
const picker = document.querySelector<HTMLSelectElement>('#case')!;
for (const c of packet.cases) picker.add(new Option(c.label, c.id));
picker.value = selected.id;
picker.addEventListener('change', () => { location.search = `case=${picker.value}`; });
render();
