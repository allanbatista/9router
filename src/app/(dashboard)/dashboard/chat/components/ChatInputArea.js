"use client";

import { createElement as h, useState, useRef, useEffect, useCallback } from "react";
import PropTypes from "prop-types";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Convert file to base64 Data URL
 */
export async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export default function ChatInputArea({
  onSendMessage,
  onStopStreaming,
  isStreaming = false,
  disabled = false,
  placeholder = "Envie uma mensagem ou cole imagens...",
  className = "",
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-resize textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 44), 200);
    textarea.style.height = `${newHeight}px`;
  }, [text]);

  // Focus textarea on load
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Keyboard shortcut Esc to stop generation
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isStreaming && onStopStreaming) {
        e.preventDefault();
        onStopStreaming();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isStreaming, onStopStreaming]);

  const validateAndAddFiles = useCallback(async (files) => {
    setErrorMessage("");
    const validAttachments = [];

    for (const file of Array.from(files)) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setErrorMessage("Apenas imagens (JPEG, PNG, WebP, GIF) são suportadas.");
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage("Cada imagem deve ter menos de 10MB.");
        continue;
      }

      try {
        const dataUrl = await fileToDataUrl(file);
        validAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          name: file.name || "imagem.png",
          type: file.type,
          dataUrl,
        });
      } catch (err) {
        console.error("Erro ao converter arquivo:", err);
      }
    }

    if (validAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...validAttachments]);
    }
  }, []);

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndAddFiles(files);
    }
    e.target.value = "";
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of Array.from(items)) {
      if (item.type && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      validateAndAddFiles(imageFiles);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = () => {
    const trimmedText = text.trim();
    if ((!trimmedText && attachments.length === 0) || isStreaming || disabled) return;

    if (onSendMessage) {
      onSendMessage(trimmedText, attachments);
    }

    setText("");
    setAttachments([]);
    setErrorMessage("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !disabled;

  return h(
    "div",
    {
      className: `relative w-full max-w-4xl mx-auto px-4 pb-4 select-none ${className}`,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    // Drag & Drop visual overlay
    isDragging &&
      h(
        "div",
        {
          className:
            "absolute inset-x-4 inset-y-0 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-500 bg-surface/90 backdrop-blur-xs",
        },
        h(
          "span",
          { className: "material-symbols-outlined text-4xl text-brand-500 animate-bounce" },
          "upload_file"
        ),
        h(
          "p",
          { className: "mt-2 text-sm font-medium text-text-main" },
          "Solte as imagens aqui para anexar"
        )
      ),
    // Main input container
    h(
      "div",
      {
        className:
          "relative flex flex-col rounded-2xl border border-border/80 bg-surface shadow-sm focus-within:border-brand-500/50 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all",
      },
      // Attachments preview row
      attachments.length > 0 &&
        h(
          "div",
          { className: "flex flex-wrap gap-2 p-3 pb-1 border-b border-border/40" },
          attachments.map((att) =>
            h(
              "div",
              {
                key: att.id,
                className:
                  "group relative flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 p-1.5 pr-2",
              },
              h("img", {
                src: att.dataUrl,
                alt: att.name || "Anexo",
                className: "h-10 w-10 rounded-lg object-cover",
              }),
              h(
                "span",
                { className: "max-w-[120px] truncate text-[11px] font-medium text-text-main" },
                att.name
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => removeAttachment(att.id),
                  className:
                    "flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-text-muted hover:bg-danger hover:text-white transition-colors",
                  "aria-label": "Remover anexo",
                  title: "Remover anexo",
                },
                h("span", { className: "material-symbols-outlined text-[13px]" }, "close")
              )
            )
          )
        ),
      // Text Input Row
      h(
        "div",
        { className: "flex items-end gap-2 p-2 sm:p-3" },
        // File picker button
        h(
          "button",
          {
            type: "button",
            onClick: () => fileInputRef.current?.click(),
            disabled: isStreaming || disabled,
            className:
              "flex h-9 w-9 items-center justify-center rounded-xl text-text-muted hover:bg-surface-2 hover:text-text-main transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0",
            title: "Anexar imagem",
            "aria-label": "Anexar imagem",
          },
          h(
            "span",
            { className: "material-symbols-outlined text-[20px]" },
            "add_photo_alternate"
          )
        ),
        h("input", {
          ref: fileInputRef,
          type: "file",
          accept: "image/*",
          multiple: true,
          onChange: handleFileChange,
          className: "hidden",
        }),
        // Textarea
        h("textarea", {
          ref: textareaRef,
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: handleKeyDown,
          onPaste: handlePaste,
          placeholder,
          disabled,
          rows: 1,
          className:
            "custom-scrollbar max-h-48 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 px-2 text-sm text-text-main placeholder:text-text-subtle focus:outline-none leading-relaxed",
          "aria-label": "Mensagem do chat",
        }),
        // Send / Stop button
        isStreaming
          ? h(
              "button",
              {
                type: "button",
                onClick: onStopStreaming,
                className:
                  "flex h-9 w-9 items-center justify-center rounded-xl bg-danger hover:bg-red-600 text-white transition-all shadow-xs shrink-0 active:scale-95",
                title: "Parar geração (Esc)",
                "aria-label": "Parar geração da resposta",
              },
              h("span", { className: "material-symbols-outlined text-[18px]" }, "stop")
            )
          : h(
              "button",
              {
                type: "button",
                onClick: handleSubmit,
                disabled: !canSend,
                className:
                  "flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-surface-3 disabled:text-text-subtle text-white transition-all shadow-xs shrink-0 disabled:cursor-not-allowed active:scale-95",
                title: "Enviar mensagem (Enter)",
                "aria-label": "Enviar mensagem",
              },
              h(
                "span",
                { className: "material-symbols-outlined text-[18px]" },
                "arrow_upward"
              )
            )
      )
    ),
    // Error notification
    errorMessage &&
      h(
        "div",
        { className: "mt-1.5 flex items-center gap-1.5 px-2 text-xs text-danger" },
        h("span", { className: "material-symbols-outlined text-[14px]" }, "error"),
        h("span", null, errorMessage)
      ),
    // Helper hint
    h(
      "div",
      {
        className:
          "mt-1.5 flex items-center justify-center text-center text-[11px] text-text-subtle",
      },
      h("span", null, "O 9Router pode cometer erros. Verifique informações importantes.")
    )
  );
}

ChatInputArea.propTypes = {
  onSendMessage: PropTypes.func.isRequired,
  onStopStreaming: PropTypes.func,
  isStreaming: PropTypes.bool,
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
  className: PropTypes.string,
};
