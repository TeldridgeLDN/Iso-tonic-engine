// Public IO contract (Phase E). This barrel is the fixed surface the app shell
// consumes; nothing else in src/io/ is imported outside this module.

export { saveDocument, openDocument } from './persistence.ts';
export { checkAutosave, setupAutosave, clearAutosave } from './autosave.ts';
export {
  exportSVG,
  exportPNG,
  exportPDF,
  exportDescription,
  type ExportOptions,
} from './export.ts';
export { buildWrittenDescription } from './description.ts';
