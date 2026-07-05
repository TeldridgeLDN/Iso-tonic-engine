// App entrypoint.
//
// Startup behaviour (Phase D):
//   1. If the io module offers a newer autosave, restore it.
//   2. Else start from an EMPTY document and, since it has no entities and no
//      autosave, open the interview wizard (demo reachable from its footer).
//   3. Wire io autosave to the history once mounted.
// io is optional: guarded via the io-bridge so the app still boots without it.

import './app.css';
import { App } from './app.ts';
import { createEmptyDocument } from './core/model.ts';
import { loadIo } from './ui/io-bridge.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');

async function boot(): Promise<void> {
  const io = await loadIo();

  // `?demo` loads the built-in demo scene directly (shareable demo link).
  const wantDemo = new URLSearchParams(location.search).has('demo');
  const demoDoc = wantDemo ? (await import('./demo.ts')).buildDemoScene() : null;

  // Try autosave restore first.
  const restored = demoDoc ? null : (io?.checkAutosave?.() ?? null);
  const startDoc = demoDoc ?? restored?.doc ?? createEmptyDocument('Untitled service');

  const app = new App(root!, startDoc);
  app.mount();

  // Wire autosave (guarded — no-op if io absent).
  io?.setupAutosave?.(app.history);

  // Open the wizard when there's nothing to show and no autosave was restored.
  if (!demoDoc && !restored && startDoc.entities.length === 0) {
    app.openWizard();
  }

  // Expose for interactive debugging / smoke tests.
  (window as unknown as { __isoApp?: App }).__isoApp = app;
}

void boot();
