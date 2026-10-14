import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import CodeBlock from "@/app/(dashboard)/dashboard/chat/components/CodeBlock";
import MarkdownRenderer, {
  parseMarkdownBlocks,
} from "@/app/(dashboard)/dashboard/chat/components/MarkdownRenderer";

describe("MarkdownRenderer & CodeBlock unit tests", () => {
  describe("parseMarkdownBlocks", () => {
    it("handles empty or non-string input safely", () => {
      expect(parseMarkdownBlocks("")).toEqual([]);
      expect(parseMarkdownBlocks(null)).toEqual([]);
      expect(parseMarkdownBlocks(undefined)).toEqual([]);
      expect(parseMarkdownBlocks(123)).toEqual([]);
      expect(parseMarkdownBlocks({})).toEqual([]);
    });

    it("parses plain markdown paragraph and inline elements", () => {
      const input = "Hello **world** with *italic* and `inline_code`.";
      const blocks = parseMarkdownBlocks(input);
      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe("html");
      expect(blocks[0].content).toContain("<strong>world</strong>");
      expect(blocks[0].content).toContain("<em>italic</em>");
      expect(blocks[0].content).toContain("<code>inline_code</code>");
    });

    it("extracts code blocks as structured objects with language and raw code", () => {
      const input = `# Title

Paragraph before code.

\`\`\`javascript
const msg = "Hello 9Router";
console.log(msg);
\`\`\`

Paragraph after code.`;

      const blocks = parseMarkdownBlocks(input);
      expect(blocks.length).toBe(3);

      expect(blocks[0].type).toBe("html");
      expect(blocks[0].content).toContain("<h1>Title</h1>");
      expect(blocks[0].content).toContain("<p>Paragraph before code.</p>");

      expect(blocks[1].type).toBe("code");
      expect(blocks[1].language).toBe("javascript");
      expect(blocks[1].code).toBe('const msg = "Hello 9Router";\nconsole.log(msg);');

      expect(blocks[2].type).toBe("html");
      expect(blocks[2].content).toContain("<p>Paragraph after code.</p>");
    });

    it("handles multiple consecutive and interleaved code blocks", () => {
      const input = `\`\`\`python
def foo():
    return 1
\`\`\`
\`\`\`typescript
const bar: number = 2;
\`\`\``;

      const blocks = parseMarkdownBlocks(input);
      expect(blocks.length).toBe(2);
      expect(blocks[0].type).toBe("code");
      expect(blocks[0].language).toBe("python");
      expect(blocks[0].code).toBe("def foo():\n    return 1");

      expect(blocks[1].type).toBe("code");
      expect(blocks[1].language).toBe("typescript");
      expect(blocks[1].code).toBe("const bar: number = 2;");
    });

    it("renders tables with GFM format", () => {
      const input = `| Header 1 | Header 2 |
|---|---|
| Cell 1 | Cell 2 |`;

      const blocks = parseMarkdownBlocks(input);
      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe("html");
      expect(blocks[0].content).toContain("<table");
      expect(blocks[0].content).toContain("Header 1");
      expect(blocks[0].content).toContain("Header 2");
      expect(blocks[0].content).toContain("Cell 1");
      expect(blocks[0].content).toContain("Cell 2");
    });

    it("renders ordered and unordered lists", () => {
      const input = `- Item A
- Item B
- Item C

1. First
2. Second`;

      const blocks = parseMarkdownBlocks(input);
      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe("html");
      expect(blocks[0].content).toContain("<ul");
      expect(blocks[0].content).toContain("Item A");
      expect(blocks[0].content).toContain("<ol");
      expect(blocks[0].content).toContain("First");
    });

    it("renders blockquotes", () => {
      const input = `> This is a blockquote message.`;
      const blocks = parseMarkdownBlocks(input);
      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe("html");
      expect(blocks[0].content).toContain("<blockquote");
      expect(blocks[0].content).toContain("This is a blockquote message.");
    });

    it("sanitizes unsafe links and enforces safe attributes on valid links", () => {
      const input = `[Safe Link](https://example.com) and [Dangerous Link](javascript:alert('xss')) and [Relative](/dashboard/chat)`;
      const blocks = parseMarkdownBlocks(input);
      expect(blocks.length).toBe(1);

      const html = blocks[0].content;
      // Safe link has target="_blank" and rel="noopener noreferrer"
      expect(html).toContain('href="https://example.com"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');

      // Relative safe link
      expect(html).toContain('href="/dashboard/chat"');

      // Javascript pseudo-protocol is sanitized to safe '#'
      expect(html).not.toContain('href="javascript:');
      expect(html).toContain('href="#"');
    });
  });

  describe("CodeBlock React component rendering", () => {
    it("renders code block element with language header, code and aria-labels", () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(CodeBlock, {
          code: 'console.log("hello 9router");',
          language: "javascript",
        })
      );

      expect(html).toContain('data-testid="code-block"');
      expect(html).toContain("javascript");
      expect(html).toContain('aria-label="Copy code to clipboard"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain("Copy code");
      expect(html).toContain('console.log(&quot;hello 9router&quot;);');
    });

    it("defaults language to text when empty or undefined", () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(CodeBlock, {
          code: "plain text block",
        })
      );

      expect(html).toContain("text");
      expect(html).toContain("plain text block");
    });
  });

  describe("MarkdownRenderer React component rendering", () => {
    it("returns empty markup when content is empty", () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(MarkdownRenderer, { content: "" })
      );
      expect(html).toBe("");
    });

    it("renders HTML blocks, headings, lists, tables, and CodeBlock elements in container", () => {
      const content = `# Header 1

Paragraph with **bold text**.

\`\`\`python
def add(a, b):
    return a + b
\`\`\`

| Key | Value |
|---|---|
| A | 100 |

- List Item 1
- List Item 2`;

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(MarkdownRenderer, {
          content,
          className: "chat-bubble-custom",
        })
      );

      expect(html).toContain('data-testid="markdown-renderer"');
      expect(html).toContain("chat-bubble-custom");
      expect(html).toContain("<h1>Header 1</h1>");
      expect(html).toContain("<strong>bold text</strong>");
      expect(html).toContain('data-testid="code-block"');
      expect(html).toContain("python");
      expect(html).toContain("def add(a, b):");
      expect(html).toContain("<table");
      expect(html).toContain("Key");
      expect(html).toContain("Value");
      expect(html).toContain("<ul");
      expect(html).toContain("List Item 1");
    });
  });
});
