// Interview wizard modal. Data-driven from wizardQuestions.WIZARD_STEPS; builds
// the document via the pure wizardBuildDocument. Shown on first load (empty doc,
// no autosave) and via the toolbar "New map". Every step is skippable; there's
// a "Start blank" escape hatch and a footer "Load demo" link.

import {
  resolveSteps,
  stepById,
  DOMAIN_OPTIONS,
  type WizardStep,
  type StepId,
} from './wizardQuestions.ts';
import {
  wizardBuildDocument,
  emptyAnswers,
  type WizardAnswers,
  type WizardRow,
} from './wizardBuild.ts';
import { createEmptyDocument } from '../core/model.ts';
import type { SceneDocument } from '../core/model.ts';
import { el, button, clear } from './dom.ts';

export interface WizardCallbacks {
  /** Finish with a built document (already laid out). */
  onComplete(doc: SceneDocument): void;
  /** Start blank: an empty document with the given title. */
  onBlank(doc: SceneDocument): void;
  /** Load the bundled demo scene (footer link). */
  onLoadDemo(): void;
  /** Dismissed without choosing (backdrop / close). */
  onDismiss?(): void;
}

export class Wizard {
  private readonly overlay: HTMLElement;
  private readonly content: HTMLElement;
  private readonly cb: WizardCallbacks;
  private answers: WizardAnswers = emptyAnswers();
  private stepIndex = 0;
  private mounted = false;

  constructor(cb: WizardCallbacks) {
    this.cb = cb;
    this.content = el('div', { class: 'iso-wizard' });
    this.overlay = el('div', { class: 'iso-wizard-overlay' }, [this.content]);
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.dismiss();
    });
  }

  /** Show the wizard, resetting to a fresh set of answers. */
  open(): void {
    this.answers = emptyAnswers();
    this.stepIndex = 0;
    if (!this.mounted) {
      document.body.appendChild(this.overlay);
      this.mounted = true;
    }
    this.overlay.hidden = false;
    this.renderStep();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  private dismiss(): void {
    this.close();
    this.cb.onDismiss?.();
  }

  // --- rendering ------------------------------------------------------------

  /** The steps for the current domain (base steps re-skinned by the choice). */
  private steps(): WizardStep[] {
    return resolveSteps(this.answers.domain);
  }

  private renderStep(): void {
    clear(this.content);
    const steps = this.steps();
    const step = steps[this.stepIndex];

    this.content.append(this.header(step));
    this.content.append(this.progress());
    this.content.append(el('p', { class: 'iso-wizard-prompt', text: step.prompt }));
    this.content.append(this.stepBody(step));
    this.content.append(this.footer(step));
  }

  private header(step: WizardStep): HTMLElement {
    const close = button('✕', () => this.dismiss(), 'iso-icon-btn iso-wizard-close');
    close.title = 'Close';
    return el('div', { class: 'iso-wizard-header' }, [
      el('h2', { class: 'iso-wizard-title', text: `New map · ${step.title}` }),
      close,
    ]);
  }

  private progress(): HTMLElement {
    const steps = this.steps();
    const wrap = el('div', { class: 'iso-wizard-progress' });
    steps.forEach((s, i) => {
      const dot = el('span', {
        class: 'iso-progress-dot',
        title: s.title,
      });
      if (i === this.stepIndex) dot.classList.add('is-current');
      if (i < this.stepIndex) dot.classList.add('is-done');
      wrap.append(dot);
    });
    wrap.append(
      el('span', {
        class: 'iso-progress-label',
        text: `Step ${this.stepIndex + 1} of ${steps.length}`,
      })
    );
    return wrap;
  }

  private stepBody(step: WizardStep): HTMLElement {
    if (step.id === 'domain') return this.domainBody();
    if (!step.multi) return this.serviceBody(step);
    return this.multiBody(step);
  }

  // Step 0: pick the service domain (re-skins the rest of the wizard).
  private domainBody(): HTMLElement {
    const body = el('div', { class: 'iso-wizard-body iso-domain-body' });
    for (const opt of DOMAIN_OPTIONS) {
      const card = el('button', {
        class: 'iso-domain-card',
        attrs: { type: 'button', 'data-domain': opt.value },
      });
      if (this.answers.domain === opt.value) card.classList.add('is-selected');
      card.append(
        el('span', { class: 'iso-domain-card-title', text: opt.label }),
        el('span', { class: 'iso-domain-card-blurb', text: opt.blurb })
      );
      card.addEventListener('click', () => {
        this.answers.domain = opt.value;
        this.renderStep(); // reflect selection immediately
      });
      body.append(card);
    }
    return body;
  }

  // Step 1: service name + description (stored on meta).
  private serviceBody(step: WizardStep): HTMLElement {
    const body = el('div', { class: 'iso-wizard-body' });
    const name = el('input', {
      class: 'iso-input',
      attrs: { type: 'text', placeholder: 'e.g. Kerbside recycling' },
    }) as HTMLInputElement;
    name.value = this.answers.service.name;
    name.addEventListener('input', () => {
      this.answers.service.name = name.value;
    });

    const desc = el('textarea', {
      class: 'iso-input iso-textarea',
      attrs: { placeholder: 'A short description (optional)' },
    }) as HTMLTextAreaElement;
    desc.rows = 3;
    desc.value = this.answers.service.description ?? '';
    desc.addEventListener('input', () => {
      this.answers.service.description = desc.value;
    });

    body.append(
      labelled(step.nameLabel, name),
      labelled('Description', desc)
    );
    return body;
  }

  // Multi-entry steps: an editable list of rows + "add row".
  private multiBody(step: WizardStep): HTMLElement {
    const body = el('div', { class: 'iso-wizard-body' });
    const list = el('div', { class: 'iso-wizard-rows' });
    const rows = this.rowsFor(step.id);

    const rebuild = (): void => {
      clear(list);
      rows.forEach((row, i) => list.append(this.rowEditor(step, row, i, rebuild)));
      if (rows.length === 0) {
        list.append(
          el('p', { class: 'iso-empty', text: 'Nothing added yet — this step is optional.' })
        );
      }
    };
    rebuild();

    const add = button(`+ Add ${step.nameLabel.toLowerCase()}`, () => {
      rows.push(this.blankRow(step));
      rebuild();
    }, 'iso-btn iso-btn-sm');

    body.append(list, add);
    return body;
  }

  private rowEditor(
    step: WizardStep,
    row: WizardRow,
    index: number,
    rebuild: () => void
  ): HTMLElement {
    const wrap = el('div', { class: 'iso-wizard-row' });

    // Territory steps take no name — territories are unlabeled ground plates.
    // The row is identified as "<nameLabel> N" in parent dropdowns instead.
    if (step.entityType === 'territory' && step.multi) {
      wrap.append(
        el('span', {
          class: 'iso-field-label',
          text: `${step.nameLabel} ${index + 1}`,
        })
      );
    } else {
      const name = el('input', {
        class: 'iso-input',
        attrs: { type: 'text', placeholder: step.nameLabel },
      }) as HTMLInputElement;
      name.value = row.name;
      name.addEventListener('input', () => {
        row.name = name.value;
      });
      wrap.append(name);
    }

    // Parent dropdown, if this step has a parentStep with options.
    if (step.parentStep) {
      const options = this.parentOptions(step.parentStep);
      const select = el('select', { class: 'iso-select' }) as HTMLSelectElement;
      const none = el('option', { text: '— no parent —', attrs: { value: '' } });
      select.append(none);
      options.forEach((opt) => {
        const o = el('option', { text: opt.label, attrs: { value: String(opt.index) } });
        if (row.parentRef === String(opt.index)) (o as HTMLOptionElement).selected = true;
        select.append(o);
      });
      if (options.length === 0) {
        (none as HTMLOptionElement).textContent = '(add some first)';
        select.disabled = true;
      }
      select.addEventListener('change', () => {
        row.parentRef = select.value || undefined;
      });
      wrap.append(select);
    }

    // Extra fields (headcount).
    for (const f of step.extraFields ?? []) {
      if (f.kind === 'number') {
        const input = el('input', {
          class: 'iso-input iso-input-num',
          attrs: { type: 'number', min: f.min, max: f.max, title: f.label },
        }) as HTMLInputElement;
        input.value = String(row.headcount ?? f.default ?? f.min ?? 1);
        input.addEventListener('input', () => {
          row.headcount = Number(input.value);
        });
        wrap.append(labelledInline(f.label, input));
      }
    }

    // Asset choice, if this step offers one.
    if (step.assetOptions && step.assetOptions.length) {
      const select = el('select', { class: 'iso-select' }) as HTMLSelectElement;
      step.assetOptions.forEach((opt) => {
        const o = el('option', { text: opt.label, attrs: { value: opt.value } });
        if (row.asset === opt.value) (o as HTMLOptionElement).selected = true;
        select.append(o);
      });
      select.addEventListener('change', () => {
        row.asset = select.value;
      });
      wrap.append(select);
    }

    const del = button('✕', () => {
      this.rowsFor(step.id).splice(index, 1);
      rebuild();
    }, 'iso-icon-btn');
    del.title = 'Remove';
    wrap.append(del);

    // (The zone userGoal/orgGoal inputs were removed with the territory
    // collapse, 2026-07 — goals are gone from the model.)

    return wrap;
  }

  private footer(step: WizardStep): HTMLElement {
    const back = button('Back', () => {
      if (this.stepIndex > 0) {
        this.stepIndex--;
        this.renderStep();
      }
    }, 'iso-btn iso-btn-sm');
    back.disabled = this.stepIndex === 0;

    const isLast = this.stepIndex === this.steps().length - 1;
    const next = button(
      isLast ? 'Finish' : 'Next',
      () => (isLast ? this.finish() : this.advance()),
      'iso-btn iso-btn-primary iso-btn-sm'
    );

    const skip = button('Skip', () => this.advance(), 'iso-btn iso-btn-sm iso-btn-ghost');
    // The single (service) step is skippable too, but skipping it leaves an
    // untitled service; still allowed per "every step skippable".
    void step;

    const blank = button('Start blank', () => this.startBlank(), 'iso-btn iso-btn-sm iso-btn-ghost');
    const demo = button('Load demo instead', () => {
      this.close();
      this.cb.onLoadDemo();
    }, 'iso-link');

    const nav = el('div', { class: 'iso-wizard-nav' }, [back, skip, next]);
    const escape = el('div', { class: 'iso-wizard-escape' }, [blank, demo]);
    return el('div', { class: 'iso-wizard-footer' }, [escape, nav]);
  }

  // --- actions --------------------------------------------------------------

  private advance(): void {
    if (this.stepIndex < this.steps().length - 1) {
      this.stepIndex++;
      this.renderStep();
    } else {
      this.finish();
    }
  }

  private finish(): void {
    const doc = wizardBuildDocument(this.answers);
    // Record the chosen domain on meta (preserved by the schema's unknown-field
    // pass) so a re-opened map remembers how it was framed.
    if (this.answers.domain) {
      (doc.meta as Record<string, unknown>).serviceDomain = this.answers.domain;
    }
    this.close();
    this.cb.onComplete(doc);
  }

  private startBlank(): void {
    const title = this.answers.service.name.trim() || 'Untitled service';
    const doc = createEmptyDocument(title);
    this.close();
    this.cb.onBlank(doc);
  }

  // --- answer plumbing ------------------------------------------------------

  private rowsFor(id: StepId): WizardRow[] {
    switch (id) {
      case 'organisations': return this.answers.organisations;
      case 'departments': return this.answers.departments;
      case 'teams': return this.answers.teams;
      case 'userGroups': return this.answers.userGroups;
      case 'digitalSystems': return this.answers.digitalSystems;
      case 'physicalInfra': return this.answers.physicalInfra;
      case 'annotations': return this.answers.annotations;
      default: return [];
    }
  }

  private blankRow(step: WizardStep): WizardRow {
    const row: WizardRow = { name: '' };
    const hc = step.extraFields?.find((f) => f.key === 'headcount');
    if (hc) row.headcount = Number(hc.default ?? hc.min ?? 1);
    if (step.assetOptions?.length) row.asset = step.assetOptions[0].value;
    return row;
  }

  /** Options for a parent dropdown: rows of the parent step, by index. */
  private parentOptions(parentStep: StepId): { index: number; label: string }[] {
    return this.rowsFor(parentStep).map((r, i) => ({
      index: i,
      label: r.name.trim() || `${labelForStep(parentStep)} ${i + 1}`,
    }));
  }
}

// --- small local helpers ----------------------------------------------------

function labelled(labelText: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', { class: 'iso-wizard-field' });
  wrap.append(el('span', { class: 'iso-field-label', text: labelText }), control);
  return wrap;
}

function labelledInline(labelText: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', { class: 'iso-wizard-field-inline' });
  wrap.append(el('span', { class: 'iso-field-label', text: labelText }), control);
  return wrap;
}

function labelForStep(id: StepId): string {
  const step = stepById(id);
  return step ? step.nameLabel : 'Item';
}
