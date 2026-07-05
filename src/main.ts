// App entrypoint. Boots the App shell with the demo scene.
// (Phase E will gate the demo behind autosave presence.)

import './app.css';
import { App } from './app.ts';
import { buildDemoScene } from './demo.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');

const app = new App(root, buildDemoScene());
app.mount();

// Expose for interactive debugging / smoke tests.
(window as unknown as { __isoApp?: App }).__isoApp = app;
