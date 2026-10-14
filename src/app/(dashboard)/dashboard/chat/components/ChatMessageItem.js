"use client";

import { createElement as h, useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import MarkdownRenderer from "./MarkdownRenderer";

export default function ChatMessageItem({
  message,
  siblings = [],
  currentSiblingIndex = 0,
  onSelectSibling,
  onEditMessage,
  isStreaming = false,
  modelName = "",
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);
  const editInputRef = useRef(null);

  const isUser = message.role === "user";
  const rawContent = message.content;
  const textContent =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
      ? rawContent
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("\n")
      : String(rawContent || "");

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const hasSiblings = siblings.length > 1;

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.style.height = "auto";
      editInputRef.current.style.height = `${editInputRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditText(textContent);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText("");
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== textContent && onEditMessage) {
      onEditMessage(message.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCopyMessage = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textContent);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handlePrevSibling = () => {
    if (currentSiblingIndex > 0 && onSelectSibling) {
      onSelectSibling(siblings[currentSiblingIndex - 1].id);
    }
  };

  const handleNextSibling = () => {
    if (currentSiblingIndex < siblings.length - 1 && onSelectSibling) {
      onSelectSibling(siblings[currentSiblingIndex + 1].id);
    }
  };

  return h(
    "div",
    {
      className: `group relative flex w-full py-4 transition-colors ${
        isUser ? "justify-end" : "justify-start bg-transparent"
      }`,
      "data-testid": "chat-message-item",
    },
    h(
      "div",
      {
        className: `flex w-full max-w-4xl gap-3 px-4 ${
          isUser ? "flex-row-reverse" : "flex-row"
        }`,
      },
      // Avatar
      h(
        "div",
        { className: "flex shrink-0 items-start pt-1" },
        isUser
          ? h(
              "div",
              {
                className:
                  "flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-white shadow-xs",
              },
              h("span", { className: "material-symbols-outlined text-[18px]" }, "person")
            )
          : h(
              "div",
              {
                className:
                  "flex h-8 w-8 items-center justify-center rounded-xl bg-surface-3 text-text-main shadow-xs border border-border",
              },
              h(
                "span",
                { className: "material-symbols-outlined text-[18px] text-brand-500" },
                "smart_toy"
              )
            )
      ),
      // Bubble & Content
      h(
        "div",
        {
          className: `flex min-w-0 flex-1 flex-col ${
            isUser ? "items-end" : "items-start"
          }`,
        },
        // Header title
        h(
          "div",
          {
            className:
              "mb-1 flex items-center gap-2 text-xs font-semibold text-text-muted",
          },
          h("span", null, isUser ? "Você" : modelName || "9Router Assistente")
        ),
        // Image attachments
        attachments.length > 0 &&
          h(
            "div",
            { className: "mb-2 flex flex-wrap gap-2" },
            attachments.map((att) =>
              h(
                "div",
                {
                  key: att.id,
                  className:
                    "overflow-hidden rounded-xl border border-border/80 shadow-xs",
                },
                h("img", {
                  src: att.dataUrl,
                  alt: att.name || "Imagem anexada",
                  className:
                    "max-h-56 max-w-sm rounded-xl object-cover hover:scale-[1.02] transition-transform",
                })
              )
            )
          ),
        // Message Body
        isEditing
          ? h(
              "div",
              {
                className:
                  "w-full max-w-2xl rounded-2xl border border-brand-500/50 bg-surface p-3 shadow-lg",
              },
              h("textarea", {
                ref: editInputRef,
                value: editText,
                onChange: (e) => {
                  setEditText(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                },
                className:
                  "w-full resize-none bg-transparent text-sm text-text-main focus:outline-none custom-scrollbar leading-relaxed",
                rows: 2,
                "aria-label": "Editar mensagem enviada",
              }),
              h(
                "div",
                { className: "mt-3 flex items-center justify-end gap-2" },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: handleCancelEdit,
                    className:
                      "rounded-xl px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-2 transition-colors",
                  },
                  "Cancelar"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: handleSaveEdit,
                    className:
                      "rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 transition-colors shadow-xs",
                  },
                  "Salvar e Reenviar"
                )
              )
            )
          : h(
              "div",
              {
                className: `rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUser
                    ? "bg-brand-500/10 text-text-main border border-brand-500/20 max-w-2xl"
                    : "w-full text-text-main bg-transparent"
                }`,
              },
              isUser
                ? h(
                    "div",
                    { className: "whitespace-pre-wrap break-words" },
                    textContent
                  )
                : h(
                    "div",
                    { className: "prose prose-neutral dark:prose-invert max-w-none" },
                    h(MarkdownRenderer, { content: textContent }),
                    isStreaming &&
                      h("span", {
                        className:
                          "inline-block size-2.5 ml-1.5 animate-pulse rounded-full bg-brand-500 align-middle",
                      })
                  )
            ),
        // Action Bar (Branching Controls, Copy, Edit)
        h(
          "div",
          {
            className: `mt-1.5 flex items-center gap-2 text-xs text-text-subtle ${
              isUser ? "justify-end" : "justify-start"
            }`,
          },
          // Message Branch Pagination: < 1/2 >
          hasSiblings &&
            h(
              "div",
              {
                className:
                  "flex items-center gap-1 rounded-lg border border-border/80 bg-surface px-1.5 py-0.5 text-[11px] font-medium shadow-2xs",
                "aria-label": `Versão ${currentSiblingIndex + 1} de ${siblings.length}`,
              },
              h(
                "button",
                {
                  type: "button",
                  onClick: handlePrevSibling,
                  disabled: currentSiblingIndex === 0,
                  className:
                    "flex h-4 w-4 items-center justify-center text-text-muted hover:text-text-main disabled:opacity-30 disabled:hover:text-text-muted",
                  title: "Versão anterior",
                  "aria-label": "Versão anterior",
                },
                h(
                  "span",
                  { className: "material-symbols-outlined text-[13px]" },
                  "chevron_left"
                )
              ),
              h(
                "span",
                { className: "px-1 text-text-main" },
                `${currentSiblingIndex + 1}/${siblings.length}`
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: handleNextSibling,
                  disabled: currentSiblingIndex === siblings.length - 1,
                  className:
                    "flex h-4 w-4 items-center justify-center text-text-muted hover:text-text-main disabled:opacity-30 disabled:hover:text-text-muted",
                  title: "Próxima versão",
                  "aria-label": "Próxima versão",
                },
                h(
                  "span",
                  { className: "material-symbols-outlined text-[13px]" },
                  "chevron_right"
                )
              )
            ),
          // Copy button
          !isEditing &&
            h(
              "button",
              {
                type: "button",
                onClick: handleCopyMessage,
                className:
                  "opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-text-main transition-all",
                title: "Copiar mensagem",
                "aria-label": "Copiar mensagem",
              },
              h(
                "span",
                { className: "material-symbols-outlined text-[14px]" },
                copied ? "check" : "content_copy"
              ),
              copied &&
                h("span", { className: "text-[10px] text-green-600" }, "Copiado!")
            ),
          // Edit button
          isUser &&
            !isEditing &&
            h(
              "button",
              {
                type: "button",
                onClick: handleStartEdit,
                className:
                  "opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-text-main transition-all",
                title: "Editar mensagem",
                "aria-label": "Editar mensagem",
              },
              h("span", { className: "material-symbols-outlined text-[14px]" }, "edit")
            )
        )
      )
    )
  );
}

ChatMessageItem.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.string.isRequired,
    parentId: PropTypes.string,
    role: PropTypes.string.isRequired,
    content: PropTypes.any.isRequired,
    attachments: PropTypes.array,
    createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  }).isRequired,
  siblings: PropTypes.arrayOf(PropTypes.object),
  currentSiblingIndex: PropTypes.number,
  onSelectSibling: PropTypes.func,
  onEditMessage: PropTypes.func,
  isStreaming: PropTypes.bool,
  modelName: PropTypes.string,
};
