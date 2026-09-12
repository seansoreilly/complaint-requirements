import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderInlineMarkdown } from "@/lib/markdown";

/** The assistant's replies are line-oriented prose, so the renderer only has to
 *  handle the inline marks the brain actually emits — not block structure. */
function html(text: string): string {
  return renderToStaticMarkup(<>{renderInlineMarkdown(text)}</>);
}

/** Styling hooks (Tailwind classes) are noise for these assertions. */
function structure(text: string): string {
  return html(text).replace(/ class="[^"]*"/g, "");
}

describe("renderInlineMarkdown", () => {
  it("renders **bold** as <strong>", () => {
    expect(structure("**Authority to act**")).toBe(
      "<strong>Authority to act</strong>",
    );
  });

  it("keeps the text around a bold run", () => {
    expect(structure("1. **Authority to act** — you agree")).toBe(
      "1. <strong>Authority to act</strong> — you agree",
    );
  });

  it("renders more than one bold run on a line", () => {
    expect(structure("**one** and **two**")).toBe(
      "<strong>one</strong> and <strong>two</strong>",
    );
  });

  it("renders *italic* as <em>", () => {
    expect(html("*emphasis*")).toBe("<em>emphasis</em>");
  });

  it("renders _italic_ as <em>", () => {
    expect(html("_emphasis_")).toBe("<em>emphasis</em>");
  });

  it("renders `code` as <code>", () => {
    expect(html("`AFCA-123`")).toContain("<code");
    expect(html("`AFCA-123`")).toContain("AFCA-123");
  });

  it("leaves plain text untouched", () => {
    expect(html("Are you happy to agree to both?")).toBe(
      "Are you happy to agree to both?",
    );
  });

  it("preserves newlines so whitespace-pre-wrap still lays out the reply", () => {
    expect(structure("1. **a**\n2. **b**")).toBe(
      "1. <strong>a</strong>\n2. <strong>b</strong>",
    );
  });

  it("leaves an unmatched asterisk as a literal character", () => {
    expect(html("2 * 3 is six")).toBe("2 * 3 is six");
    expect(html("**unclosed")).toBe("**unclosed");
  });

  it("does not treat an intra-word underscore as emphasis", () => {
    expect(html("firm_reference_number")).toBe("firm_reference_number");
  });

  it("escapes nothing as raw HTML", () => {
    // LLM output is untrusted: angle brackets must survive as text, never markup.
    expect(html("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("returns an empty render for an empty string", () => {
    expect(html("")).toBe("");
  });
});
