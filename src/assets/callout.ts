// Arup-style annotation ribbon: angled ACCENT text with a thin accent
// underline/frame and an optional leader line. Free-placed (origin at the
// ribbon's anchor point / start of the underline).

import { text, line, group, type Pt } from './primitives.ts';
import { ACCENT, FONT, n } from './style.ts';

export interface CalloutParams {
  text: string;
  angle?: number; // degrees; default follows iso axis ≈ 26.57
  leader?: boolean; // draw a leader line down to the anchor target
}

// iso axis angle: the +x screen step is (32,16) → atan2(16,32) ≈ 26.565°.
const ISO_ANGLE = 26.565;

function normalize(params?: Record<string, unknown>): CalloutParams {
  return {
    text: (params?.text as string) ?? 'Annotation',
    angle: typeof params?.angle === 'number' ? (params!.angle as number) : ISO_ANGLE,
    leader: Boolean(params?.leader),
  };
}

/**
 * Ribbon drawn along a line at `angle` degrees (screen space, +x to the right,
 * y down; positive angle tilts downward to the right to match the iso axis).
 * Text sits above a thin accent underline. Leader line drops from the start.
 */
export function renderCallout(params?: Record<string, unknown>): string {
  const p = normalize(params);
  const angle = p.angle ?? ISO_ANGLE;
  const len = Math.max(40, p.text.length * 5.4 + 8);

  // underline vector
  const rad = (angle * Math.PI) / 180;
  const end: Pt = { x: Math.cos(rad) * len, y: Math.sin(rad) * len };

  const frags: string[] = [];
  // leader line: a short accent stub dropping to the anchor (down-left)
  if (p.leader) {
    frags.push(line({ x: 0, y: 0 }, { x: -6, y: 14 }, 1, ACCENT));
  }
  // underline
  frags.push(line({ x: 0, y: 0 }, end, 1, ACCENT));
  // rotated text sitting just above the underline start
  const esc = p.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  frags.push(
    `<text x="2" y="-3" font-family="${FONT}" font-size="9" font-weight="bold" fill="${ACCENT}" text-anchor="start" letter-spacing="0.5" transform="rotate(${n(angle)} 0 0)">${esc}</text>`
  );
  void text;
  return group(0, 0, frags);
}
