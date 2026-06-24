import { describe, it, expect } from "vitest";
import { adfToMarkdown, adfToPlainText } from "../adf";

describe("adfToMarkdown", () => {
  it("returns empty string for null/undefined", () => {
    expect(adfToMarkdown(null)).toBe("");
    expect(adfToMarkdown(undefined)).toBe("");
  });

  it("returns string input as-is", () => {
    expect(adfToMarkdown("hello world")).toBe("hello world");
  });

  it("converts paragraph", () => {
    const node = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    };
    expect(adfToMarkdown(node)).toBe("Hello");
  });

  it("converts headings with levels", () => {
    const h1 = {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Title" }],
    };
    expect(adfToMarkdown(h1)).toBe("# Title");

    const h3 = {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Sub" }],
    };
    expect(adfToMarkdown(h3)).toBe("### Sub");
  });

  it("converts bullet list", () => {
    const node = {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Beta" }] }] },
      ],
    };
    expect(adfToMarkdown(node)).toBe("- Alpha\n- Beta");
  });

  it("converts ordered list", () => {
    const node = {
      type: "orderedList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }] },
      ],
    };
    expect(adfToMarkdown(node)).toBe("1. First\n2. Second");
  });

  it("converts blockquote", () => {
    const node = {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted" }] }],
    };
    expect(adfToMarkdown(node)).toBe("> Quoted");
  });

  it("converts code block with language", () => {
    const node = {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "const x = 1;" }],
    };
    expect(adfToMarkdown(node)).toBe("```ts\nconst x = 1;\n```");
  });

  it("converts text marks", () => {
    expect(adfToMarkdown({ type: "text", text: "bold", marks: [{ type: "strong" }] })).toBe(
      "**bold**",
    );
    expect(adfToMarkdown({ type: "text", text: "italic", marks: [{ type: "em" }] })).toBe(
      "*italic*",
    );
    expect(adfToMarkdown({ type: "text", text: "code", marks: [{ type: "code" }] })).toBe(
      "`code`",
    );
    expect(adfToMarkdown({ type: "text", text: "gone", marks: [{ type: "strike" }] })).toBe(
      "~~gone~~",
    );
    expect(
      adfToMarkdown({
        type: "text",
        text: "click",
        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
      }),
    ).toBe("[click](https://example.com)");
  });

  it("stacks multiple marks", () => {
    const node = {
      type: "text",
      text: "wow",
      marks: [{ type: "strong" }, { type: "em" }],
    };
    expect(adfToMarkdown(node)).toBe("***wow***");
  });

  it("converts hardBreak", () => {
    expect(adfToMarkdown({ type: "hardBreak" })).toBe("\n");
  });

  it("converts mention with @", () => {
    expect(adfToMarkdown({ type: "mention", attrs: { text: "@tanjiro" } })).toBe("@tanjiro");
    expect(adfToMarkdown({ type: "mention", attrs: { text: "nezuko" } })).toBe("@nezuko");
    expect(adfToMarkdown({ type: "mention", attrs: { id: "abc123" } })).toBe("@abc123");
  });

  it("converts inlineCard to URL", () => {
    expect(adfToMarkdown({ type: "inlineCard", attrs: { url: "https://jira.example.com/PROJ-42" } })).toBe(
      "https://jira.example.com/PROJ-42",
    );
  });

  it("converts rule to ---", () => {
    expect(adfToMarkdown({ type: "rule" })).toBe("---");
  });

  it("converts table", () => {
    const node = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Score" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Zenitsu" }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "9001" }] }] },
          ],
        },
      ],
    };
    const result = adfToMarkdown(node);
    expect(result).toContain("| Name | Score |");
    expect(result).toContain("| Zenitsu | 9001 |");
  });

  it("ignores media nodes", () => {
    expect(adfToMarkdown({ type: "media" })).toBe("");
    expect(adfToMarkdown({ type: "mediaSingle" })).toBe("");
  });

  it("falls back for unknown types with content", () => {
    const node = {
      type: "unknownBlock",
      content: [{ type: "text", text: "fallback" }],
    };
    expect(adfToMarkdown(node)).toBe("fallback");
  });
});

describe("adfToPlainText", () => {
  it("strips marks and returns plain text", () => {
    const node = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "strong" }] },
            { type: "text", text: " and " },
            { type: "text", text: "italic", marks: [{ type: "em" }] },
          ],
        },
      ],
    };
    expect(adfToPlainText(node)).toBe("bold and italic");
  });

  it("returns empty for null", () => {
    expect(adfToPlainText(null)).toBe("");
  });
});
