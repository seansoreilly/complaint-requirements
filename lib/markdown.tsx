import { Fragment, type ReactNode } from "react";

/**
 * The model writes its replies in light markdown — mostly `**bold**` for the
 * name of a thing it is about to explain. Rendered as plain text those marks
 * showed up as literal asterisks in the chat bubble.
 *
 * This handles inline marks only. The assistant's replies are line-oriented
 * prose (see composeReply in lib/mock-brain.ts): blank lines separate
 * paragraphs and list items sit on consecutive lines. The bubble lays that out
 * with `whitespace-pre-wrap`, so newlines are passed through untouched rather
 * than parsed as block structure — a full markdown parser would fold those
 * single newlines into spaces and run the numbered items together.
 *
 * Output is React elements, never HTML, so untrusted model output cannot inject
 * markup.
 */

/** Ordered by precedence: code spans win, so `**` inside them stays literal. */
const RULES: { pattern: RegExp; render: (body: string, key: number) => ReactNode }[] = [
  {
    pattern: /`([^`\n]+)`/,
    render: (body, key) => (
      <code key={key} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em]">
        {body}
      </code>
    ),
  },
  {
    pattern: /\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/,
    render: (body, key) => <strong key={key} className="font-semibold">{body}</strong>,
  },
  {
    pattern: /\*([^\s*](?:[^*]*[^\s*])?)\*/,
    render: (body, key) => <em key={key}>{body}</em>,
  },
  // Underscores only count at a word boundary, so snake_case survives intact.
  {
    pattern: /(?<![A-Za-z0-9_])_([^\s_](?:[^_]*[^\s_])?)_(?![A-Za-z0-9_])/,
    render: (body, key) => <em key={key}>{body}</em>,
  },
];

/** The earliest match across every rule, so precedence follows position first. */
function firstMatch(text: string): { index: number; length: number; node: (key: number) => ReactNode } | null {
  let best: { index: number; length: number; node: (key: number) => ReactNode } | null = null;
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match === null) continue;
    if (best !== null && match.index >= best.index) continue;
    const body = match[1];
    best = {
      index: match.index,
      length: match[0].length,
      node: (key) => rule.render(body, key),
    };
  }
  return best;
}

/**
 * Turn light inline markdown into React nodes. Unmatched marks (a lone `*`, an
 * unclosed `**`) are left exactly as the person sees them typed.
 */
export function renderInlineMarkdown(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;

  while (rest.length > 0) {
    const match = firstMatch(rest);
    if (match === null) break;
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    nodes.push(match.node(key));
    key += 1;
    rest = rest.slice(match.index + match.length);
  }
  if (rest.length > 0) nodes.push(rest);

  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </>
  );
}
