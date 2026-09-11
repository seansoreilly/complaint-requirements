"use client";

/*
 * PROTOTYPE — three character concepts for the assistant's avatar.
 * Question: "what should the chatbot icon look like as a cute animated character?"
 * Switchable on `/` via ?variant=A|B|C. Delete this file once one wins.
 *
 * All three are inline SVG + CSS keyframes: no runtime dependency, states driven
 * by the same `pending` flag the chat already has, colours from the --color-afca-*
 * tokens so they theme with the rest of the demo.
 *
 * Deliberately original shapes — no shield, scales, crest or anything that could
 * read as an official ombudsman mark (see the note at app/globals.css:6).
 */

export type AvatarState = "idle" | "thinking" | "speaking";

export interface AvatarProps {
  state: AvatarState;
  size?: number;
}

export const VARIANT_NAMES: Record<string, string> = {
  A: "Pip — the paper crane",
  B: "Nib — the pen nib",
  C: "Sunny — the little sun",
};

/* ------------------------------------------------------------------ *
 * A — Pip, a folded paper crane. Papercraft, calm, "we fold your
 * story into a form". Blinks when idle, dips its head when thinking.
 * ------------------------------------------------------------------ */
export function AvatarA({ state, size = 32 }: AvatarProps) {
  return (
    <span className={`pa-root pa-${state}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <g className="pa-body">
          {/* wing behind */}
          <path className="pa-wing-back" d="M24 26 L8 16 L22 30 Z" fill="var(--color-afca-sky)" />
          {/* body */}
          <path d="M24 10 L38 30 L24 38 L10 30 Z" fill="var(--color-afca-skylight)" />
          <path d="M24 10 L38 30 L24 38 Z" fill="#ffffff" />
          {/* head + beak */}
          <g className="pa-head">
            <path d="M24 10 L31 14 L24 20 L17 14 Z" fill="var(--color-afca-navy)" />
            <path d="M31 14 L38 12 L31 17 Z" fill="var(--color-afca-yellow)" />
            <circle className="pa-eye" cx="25.5" cy="14.5" r="1.6" fill="#ffffff" />
          </g>
          {/* front wing lifts when speaking */}
          <path
            className="pa-wing-front"
            d="M24 26 L40 16 L26 30 Z"
            fill="var(--color-afca-blue)"
          />
        </g>
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * B — Nib, a fountain-pen nib with a face. The most "clerical" of the
 * three: it is literally the thing filling in your form. Ink drop
 * forms and falls while thinking.
 * ------------------------------------------------------------------ */
export function AvatarB({ state, size = 32 }: AvatarProps) {
  return (
    <span className={`pb-root pb-${state}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <g className="pb-body">
          {/* nib */}
          <path d="M24 4 C34 14 36 24 34 32 L14 32 C12 24 14 14 24 4 Z" fill="var(--color-afca-navy)" />
          <path d="M24 4 C29 10 31 18 30.5 24 L17.5 24 C17 18 19 10 24 4 Z" fill="var(--color-afca-blue)" />
          {/* slit */}
          <rect x="23.2" y="20" width="1.6" height="12" rx="0.8" fill="var(--color-afca-skylight)" />
          <circle cx="24" cy="19" r="2.6" fill="var(--color-afca-skylight)" />
          {/* face */}
          <g className="pb-face">
            <circle className="pb-eye" cx="19.5" cy="13" r="2" fill="#ffffff" />
            <circle className="pb-eye" cx="28.5" cy="13" r="2" fill="#ffffff" />
            <path className="pb-smile" d="M20.5 17 Q24 19.4 27.5 17" stroke="#ffffff" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </g>
          {/* ink drop — only visible while thinking */}
          <circle className="pb-drop" cx="24" cy="34" r="3" fill="var(--color-afca-sky)" />
        </g>
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * C — Sunny, a rounded sun. Warmest and least literal; leans on the
 * existing yellow. Rays rotate gently while thinking.
 * ------------------------------------------------------------------ */
export function AvatarC({ state, size = 32 }: AvatarProps) {
  return (
    <span className={`pc-root pc-${state}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <g className="pc-rays">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <rect
              key={angle}
              x="22.6"
              y="2"
              width="2.8"
              height="7"
              rx="1.4"
              fill="var(--color-afca-yellow)"
              transform={`rotate(${angle} 24 24)`}
            />
          ))}
        </g>
        <g className="pc-face">
          <circle cx="24" cy="24" r="13" fill="var(--color-afca-yellow)" />
          <circle cx="24" cy="24" r="13" fill="none" stroke="var(--color-afca-amber)" strokeWidth="1.2" />
          <circle className="pc-eye" cx="19.5" cy="22.5" r="1.8" fill="var(--color-afca-ink)" />
          <circle className="pc-eye" cx="28.5" cy="22.5" r="1.8" fill="var(--color-afca-ink)" />
          {/* A settled half-smile, not a grin: the user is mid-dispute, and a
              beaming face reads as breezy rather than reassuring. */}
          <path className="pc-smile" d="M20.5 28 Q24 30.3 27.5 28" stroke="var(--color-afca-ink)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="16.8" cy="26.5" r="1.6" fill="var(--color-afca-amber)" opacity="0.45" />
          <circle cx="31.2" cy="26.5" r="1.6" fill="var(--color-afca-amber)" opacity="0.45" />
        </g>
      </svg>
    </span>
  );
}

export const AVATARS: Record<string, (props: AvatarProps) => React.JSX.Element> = {
  A: AvatarA,
  B: AvatarB,
  C: AvatarC,
};
