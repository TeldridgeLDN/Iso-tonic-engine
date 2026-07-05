// Pure filename helpers. No DOM — unit-tested in node.

/**
 * Kebab-case an arbitrary title for use as a filename base:
 * lowercase, non-alphanumeric runs → single '-', trimmed of leading/trailing
 * '-'. Diacritics are folded to ASCII. Empty result → '' (caller supplies a
 * fallback).
 *
 * Examples:
 *   'Demo Service Map'      → 'demo-service-map'
 *   'Café / Ops (2026)!!'   → 'cafe-ops-2026'
 *   '  ---  '               → ''
 */
export function kebabCase(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric runs → single dash
    .replace(/^-+|-+$/g, ''); // trim leading/trailing dashes
}
