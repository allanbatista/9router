"use client";

import { createElement as h, useState, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "@/shared/components/Modal";
import Button from "@/shared/components/Button";

export default function SystemPromptModal({
  isOpen,
  onClose,
  systemPrompt = "",
  onSave,
  loading = false,
}) {
  const [prompt, setPrompt] = useState(systemPrompt || "");

  useEffect(() => {
    if (isOpen) {
      setPrompt(systemPrompt || "");
    }
  }, [isOpen, systemPrompt]);

  const handleSave = async () => {
    if (onSave) {
      await onSave(prompt.trim() || null);
    }
    if (onClose) {
      onClose();
    }
  };

  const handleClear = () => {
    setPrompt("");
  };

  return h(
    Modal,
    {
      isOpen,
      onClose,
      title: "Instruções do Sistema (System Prompt)",
      size: "md",
      footer: h(
        "div",
        { className: "flex w-full items-center justify-between" },
        h(
          Button,
          {
            type: "button",
            variant: "ghost",
            size: "sm",
            onClick: handleClear,
            disabled: loading || !prompt,
            className: "text-text-muted hover:text-danger",
          },
          "Limpar"
        ),
        h(
          "div",
          { className: "flex items-center gap-2" },
          h(
            Button,
            {
              type: "button",
              variant: "ghost",
              size: "md",
              onClick: onClose,
              disabled: loading,
            },
            "Cancelar"
          ),
          h(
            Button,
            {
              type: "button",
              variant: "primary",
              size: "md",
              onClick: handleSave,
              loading,
            },
            "Salvar"
          )
        )
      ),
    },
    h(
      "div",
      { className: "space-y-3" },
      h(
        "p",
        { className: "text-xs text-text-muted" },
        "Defina diretrizes e comportamentos personalizados para o assistente nesta conversa. O System Prompt será enviado no início de cada requisição."
      ),
      h(
        "div",
        { className: "relative" },
        h("textarea", {
          value: prompt,
          onChange: (e) => setPrompt(e.target.value),
          placeholder:
            "Exemplo: Você é um assistente sênior especialista em JavaScript e Node.js. Responda sempre de forma concisa e com código limpo.",
          rows: 7,
          className:
            "w-full resize-y rounded-xl border border-border bg-surface-2 p-3 text-sm text-text-main placeholder:text-text-subtle focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-mono transition-all",
          "aria-label": "Instruções do Sistema",
        })
      ),
      h(
        "div",
        { className: "flex items-center justify-between text-[11px] text-text-subtle" },
        h("span", null, `${prompt.length} caracteres`),
        h("span", null, "Dica: deixe em branco para usar o comportamento padrão do modelo.")
      )
    )
  );
}

SystemPromptModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  systemPrompt: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};
