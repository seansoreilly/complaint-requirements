/**
 * The assistant's face, shown beside its messages in the chat.
 *
 * Deliberately a small original character, not a logo: this demo must never be
 * mistaken for AFCA's own service (see the note at the top of app/globals.css),
 * so there is no shield, no scales, nothing that reads as an official mark. The
 * yellow is the palette the rest of the demo already uses.
 *
 * Inline SVG rather than an animation runtime — at 30px a dependency would cost
 * more than the element is worth, and CSS keyframes can key off the chat's
 * existing `pending` flag directly. Motion rules live in app/globals.css.
 */

/**
 * `still` is the resting pose with no animation at all. Older messages use it so
 * a long conversation isn't a column of moving characters.
 */
export type AssistantState = "still" | "thinking" | "speaking";

export function Assistant({
  state,
  size = 30,
}: {
  state: AssistantState;
  size?: number;
}): React.JSX.Element {
  return (
    // Decorative: the assistant is already identified by its message text, and
    // "Thinking…" carries the pending state for screen readers.
    <span className={`assistant assistant-${state}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <g className="assistant-rays">
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
        <g className="assistant-face">
          <circle cx="24" cy="24" r="13" fill="var(--color-afca-yellow)" />
          <circle cx="24" cy="24" r="13" fill="none" stroke="var(--color-afca-amber)" strokeWidth="1.2" />
          <circle className="assistant-eye" cx="19.5" cy="22.5" r="1.8" fill="var(--color-afca-ink)" />
          <circle className="assistant-eye" cx="28.5" cy="22.5" r="1.8" fill="var(--color-afca-ink)" />
          {/* A settled half-smile, not a grin: the person on the other side is
              mid-dispute, and a beaming face reads as breezy rather than kind. */}
          <path
            className="assistant-smile"
            d="M20.5 28 Q24 30.3 27.5 28"
            stroke="var(--color-afca-ink)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="16.8" cy="26.5" r="1.6" fill="var(--color-afca-amber)" opacity="0.45" />
          <circle cx="31.2" cy="26.5" r="1.6" fill="var(--color-afca-amber)" opacity="0.45" />
        </g>
      </svg>
    </span>
  );
}
