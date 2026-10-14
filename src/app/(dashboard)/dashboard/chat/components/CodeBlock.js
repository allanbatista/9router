"use client";

import { createElement as h, useState, useCallback, useEffect } from "react";
import PropTypes from "prop-types";

export default function CodeBlock({ code = "", language = "", className = "" }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
    } catch {
      // Fallback silent failure prevention
      setCopied(false);
    }
  }, [code]);

  const displayLang = (language || "text").toLowerCase().trim();

  return h(
    "div",
    {
      className: `my-3 overflow-hidden rounded-xl border border-white/10 bg-[#1e1e1e] text-text-main dark:bg-[#121316] ${className}`,
      "data-testid": "code-block",
    },
    h(
      "div",
      {
        className:
          "flex items-center justify-between border-b border-white/10 bg-black/30 px-4 py-2 text-xs text-white/70",
      },
      h("span", { className: "font-mono lowercase" }, displayLang),
      h(
        "button",
        {
          type: "button",
          onClick: handleCopy,
          "aria-label": copied ? "Code copied to clipboard" : "Copy code to clipboard",
          "aria-live": "polite",
          className:
            "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        },
        h(
          "span",
          { className: "material-symbols-outlined text-[15px]" },
          copied ? "check" : "content_copy"
        ),
        h("span", null, copied ? "Copied!" : "Copy code")
      )
    ),
    h(
      "div",
      { className: "overflow-x-auto p-4 custom-scrollbar" },
      h(
        "pre",
        { className: "font-mono text-[13px] leading-6 text-white/90" },
        h("code", null, code)
      )
    )
  );
}

CodeBlock.propTypes = {
  code: PropTypes.string,
  language: PropTypes.string,
  className: PropTypes.string,
};
