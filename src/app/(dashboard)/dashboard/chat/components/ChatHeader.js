"use client";

import { createElement as h } from "react";
import PropTypes from "prop-types";
import Button from "@/shared/components/Button";
import ModelSelectorDropdown from "./ModelSelectorDropdown";

export default function ChatHeader({
  sidebarOpen = true,
  onToggleSidebar,
  selectedModel = "",
  selectedProvider = "",
  providerGroups = [],
  combos = [],
  onSelectModel,
  systemPrompt = "",
  onOpenSystemPrompt,
  onNewChat,
  isMobile = false,
  isStreaming = false,
}) {
  const hasCustomSystemPrompt = Boolean(systemPrompt && systemPrompt.trim());

  return h(
    "header",
    {
      className:
        "flex h-14 w-full items-center justify-between border-b border-border/80 bg-surface/95 px-4 backdrop-blur-xs select-none",
    },
    // Left side: Toggle Sidebar + Model Selector
    h(
      "div",
      { className: "flex items-center gap-2" },
      h(
        "button",
        {
          type: "button",
          onClick: onToggleSidebar,
          className:
            "flex h-9 w-9 items-center justify-center rounded-xl text-text-muted hover:bg-surface-2 hover:text-text-main transition-colors",
          title: sidebarOpen ? "Recolher histórico" : "Expandir histórico",
          "aria-label": sidebarOpen ? "Recolher histórico" : "Expandir histórico",
        },
        h(
          "span",
          { className: "material-symbols-outlined text-[22px]" },
          sidebarOpen ? "menu_open" : "menu"
        )
      ),
      h(ModelSelectorDropdown, {
        selectedModel,
        selectedProvider,
        providerGroups,
        combos,
        onSelectModel,
        disabled: isStreaming,
      })
    ),
    // Right side: System Prompt trigger + New Chat Button
    h(
      "div",
      { className: "flex items-center gap-2" },
      h(
        "button",
        {
          type: "button",
          onClick: onOpenSystemPrompt,
          className: `flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
            hasCustomSystemPrompt
              ? "border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-300 shadow-xs"
              : "border-border/80 bg-surface text-text-muted hover:bg-surface-2 hover:text-text-main"
          }`,
          title: "Configurar Instruções do Sistema (System Prompt)",
          "aria-label": "Configurar Instruções do Sistema",
        },
        h(
          "span",
          { className: "material-symbols-outlined text-[18px]" },
          hasCustomSystemPrompt ? "psychology" : "tune"
        ),
        h("span", { className: "hidden sm:inline" }, "System Prompt"),
        hasCustomSystemPrompt &&
          h("span", { className: "size-2 rounded-full bg-brand-500 animate-pulse" })
      ),
      h(
        Button,
        {
          type: "button",
          variant: "secondary",
          size: "sm",
          icon: "add",
          onClick: onNewChat,
          disabled: isStreaming,
          className: "rounded-xl text-xs font-medium px-3 h-8 shadow-xs",
          title: "Iniciar nova conversa",
        },
        h("span", { className: "hidden md:inline" }, "Novo Chat")
      )
    )
  );
}

ChatHeader.propTypes = {
  sidebarOpen: PropTypes.bool,
  onToggleSidebar: PropTypes.func.isRequired,
  selectedModel: PropTypes.string,
  selectedProvider: PropTypes.string,
  providerGroups: PropTypes.arrayOf(PropTypes.object),
  combos: PropTypes.arrayOf(PropTypes.object),
  onSelectModel: PropTypes.func.isRequired,
  systemPrompt: PropTypes.string,
  onOpenSystemPrompt: PropTypes.func.isRequired,
  onNewChat: PropTypes.func.isRequired,
  isMobile: PropTypes.bool,
  isStreaming: PropTypes.bool,
};
