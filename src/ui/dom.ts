// Tiny DOM construction helpers shared by the Phase D UI panels.
// No framework; just terse element builders. Keeps panel files focused.

export type Attrs = Record<string, string | number | boolean | undefined>;

/** Create an element with attributes/class/text and optional children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: {
    class?: string;
    text?: string;
    attrs?: Attrs;
    title?: string;
  } = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.title !== undefined) node.title = opts.title;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v === undefined || v === false) continue;
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) node.append(c);
  return node;
}

/** A styled button. */
export function button(
  label: string,
  onClick: () => void,
  cls = 'iso-btn'
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/** A small eye toggle button reflecting `visible`. */
export function eyeToggle(
  visible: boolean,
  onToggle: () => void
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'iso-eye';
  b.setAttribute('aria-pressed', String(visible));
  b.title = visible ? 'Hide' : 'Show';
  b.textContent = visible ? '◉' : '○'; // ◉ visible / ○ hidden
  b.classList.toggle('is-hidden', !visible);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onToggle();
  });
  return b;
}

/** Escape text for safe insertion into innerHTML contexts. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Remove all children of a node. */
export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** A labelled form row: <label> text </label> + control. */
export function field(labelText: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', { class: 'iso-field' });
  const span = el('span', { class: 'iso-field-label', text: labelText });
  wrap.append(span, control);
  return wrap;
}

/**
 * A collapsible side column: `content` plus a chevron toggle that hides it.
 * `side` places the toggle on the correct edge and flips the chevron glyph.
 */
export function collapsibleColumn(
  cls: string,
  content: HTMLElement,
  side: 'left' | 'right'
): HTMLElement {
  const col = el('div', { class: `iso-col ${cls}` });
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'iso-col-toggle';
  toggle.title = side === 'left' ? 'Collapse palette' : 'Collapse panels';
  toggle.textContent = side === 'left' ? '‹' : '›';
  toggle.addEventListener('click', () => {
    const collapsed = col.classList.toggle('is-collapsed');
    toggle.textContent = collapsed
      ? side === 'left' ? '›' : '‹'
      : side === 'left' ? '‹' : '›';
  });
  if (side === 'left') col.append(content, toggle);
  else col.append(toggle, content);
  return col;
}
