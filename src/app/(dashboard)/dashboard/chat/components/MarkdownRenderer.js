"use client";

import { createElement as h, useMemo } from "react";
import PropTypes from "prop-types";
import { marked } from "marked";
import CodeBlock from "./CodeBlock";

/**
 * Configure marked with GFM, breaks, and safe link / table / list renderers.
 */
const customRenderer = new marked.Renderer();

// Ensure safe link rendering with target="_blank" rel="noopener noreferrer"
customRenderer.link = function ({ href, title, tokens }) {
  const text = this.parser ? this.parser.parseInline(tokens) : "";
  const isSafe =
    href &&
    (href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("/") ||
      href.startsWith("#") ||
      href.startsWith("mailto:"));
  const safeHref = isSafe ? href : "#";
  const titleAttr = title ? ` title="${title}"` : "";
  return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80 font-medium break-all">${text}</a>`;
};

// Configure custom table styling
customRenderer.table = function (token) {
  let headerCells = "";
  for (let r = 0; r < token.header.length; r++) {
    headerCells += this.tablecell(token.header[r]);
  }
  const headerRow = this.tablerow({ text: headerCells });

  let bodyRows = "";
  for (let r = 0; r < token.rows.length; r++) {
    const row = token.rows[r];
    let rowCells = "";
    for (let o = 0; o < row.length; o++) {
      rowCells += this.tablecell(row[o]);
    }
    bodyRows += this.tablerow({ text: rowCells });
  }

  const thead = `<thead>${headerRow}</thead>`;
  const tbody = bodyRows ? `<tbody>${bodyRows}</tbody>` : "";

  return `<div class="overflow-x-auto my-4 rounded-xl border border-black/10 dark:border-white/10"><table class="min-w-full divide-y divide-black/10 dark:divide-white/10 text-sm text-left">${thead}${tbody}</table></div>`;
};

customRenderer.tablerow = function ({ text }) {
  return `<tr class="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">${text}</tr>`;
};

customRenderer.tablecell = function (cell) {
  const text = this.parser
    ? this.parser.parseInline(cell.tokens)
    : cell.text || "";
  const Tag = cell.header ? "th" : "td";
  const alignClass = cell.align ? ` text-${cell.align}` : "";
  const padClass = cell.header
    ? "px-4 py-3 text-xs uppercase tracking-wider font-semibold"
    : "px-4 py-3";
  return `<${Tag} class="${padClass}${alignClass}">${text}</${Tag}>`;
};

// Configure blockquote styling
customRenderer.blockquote = function (token) {
  const body = this.parser ? this.parser.parse(token.tokens) : token.text;
  return `<blockquote class="border-l-4 border-primary/60 bg-black/[0.03] dark:bg-white/[0.03] pl-4 py-2 my-3 rounded-r-lg italic text-text-muted">${body}</blockquote>`;
};

// Configure list styling
customRenderer.list = function (token) {
  let body = "";
  for (let i = 0; i < token.items.length; i++) {
    body += this.listitem(token.items[i]);
  }
  const Tag = token.ordered ? "ol" : "ul";
  const listClass = token.ordered
    ? "list-decimal list-outside ml-6 my-3 space-y-1"
    : "list-disc list-outside ml-6 my-3 space-y-1";
  const startAttr =
    token.ordered && token.start && token.start !== 1
      ? ` start="${token.start}"`
      : "";
  return `<${Tag}${startAttr} class="${listClass}">${body}</${Tag}>`;
};

customRenderer.listitem = function (item) {
  const text = this.parser ? this.parser.parse(item.tokens) : item.text;
  return `<li>${text}</li>`;
};

// Set options on marked instance
marked.use({
  gfm: true,
  breaks: true,
  renderer: customRenderer,
});

/**
 * Parses markdown text into interleaved HTML fragments and CodeBlock components.
 * @param {string} content - Markdown source string
 * @returns {Array<{ type: "html"|"code", content?: string, code?: string, language?: string, key: string }>}
 */
export function parseMarkdownBlocks(content) {
  if (!content || typeof content !== "string") return [];

  try {
    const tokens = marked.lexer(content);
    const blocks = [];
    let currentTokens = [];
    let blockIndex = 0;

    const flushTokens = () => {
      if (currentTokens.length > 0) {
        const html = marked.parser(currentTokens);
        if (html.trim()) {
          blocks.push({
            type: "html",
            content: html,
            key: `html-${blockIndex++}`,
          });
        }
        currentTokens = [];
      }
    };

    for (const token of tokens) {
      if (token.type === "code") {
        flushTokens();
        blocks.push({
          type: "code",
          code: token.text,
          language: token.lang || "",
          key: `code-${blockIndex++}`,
        });
      } else {
        currentTokens.push(token);
      }
    }
    flushTokens();

    return blocks;
  } catch {
    // Fallback if parsing ever throws
    return [
      {
        type: "html",
        content: `<p class="whitespace-pre-wrap">${content}</p>`,
        key: "fallback-0",
      },
    ];
  }
}

/**
 * MarkdownRenderer component
 * Renders rich Markdown using marked with GFM, blockquotes, tables, lists, safe links,
 * and CodeBlock components for code fences with copy functionality.
 */
export default function MarkdownRenderer({ content = "", className = "" }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  if (!content) {
    return null;
  }

  return h(
    "div",
    {
      className: `markdown-body space-y-3 leading-relaxed text-[15px] ${className}`,
      "data-testid": "markdown-renderer",
    },
    blocks.map((block) => {
      if (block.type === "code") {
        return h(CodeBlock, {
          key: block.key,
          code: block.code,
          language: block.language,
        });
      }

      return h("div", {
        key: block.key,
        className:
          "prose prose-neutral dark:prose-invert max-w-none break-words [&>p]:mb-3 [&>p:last-child]:mb-0 [&>h1]:text-2xl [&>h1]:font-bold [&>h1]:my-4 [&>h2]:text-xl [&>h2]:font-bold [&>h2]:my-3 [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:my-2 [&>code]:rounded [&>code]:bg-black/10 dark:[&>code]:bg-white/10 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:text-xs [&>code]:font-mono",
        dangerouslySetInnerHTML: { __html: block.content },
      });
    })
  );
}

MarkdownRenderer.propTypes = {
  content: PropTypes.string,
  className: PropTypes.string,
};
