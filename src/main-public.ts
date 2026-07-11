// Public view-only entrypoint (root page).
//
// Boots the App in viewer mode with the built-in demo scene: present mode is
// forced, no palette/panels/wizard, no autosave restore or wiring, no file
// buttons — visitors can pan/zoom, spotlight, and export. The full editor
// lives at /edit/ (built from edit/index.html via src/main.ts).

import './app.css';
import { App } from './app.ts';
import { buildDemoScene } from './demo.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');

const app = new App(root, buildDemoScene(), { viewer: true });
app.mount();

// Expose for interactive debugging / smoke tests.
(window as unknown as { __isoApp?: App }).__isoApp = app;
