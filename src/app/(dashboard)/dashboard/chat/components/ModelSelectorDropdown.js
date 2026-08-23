"use client";

import { createElement as h, useState, useRef, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import Badge from "@/shared/components/Badge";

/**
 * Filter models/combos by query
 */
export function filterModelsAndCombos(providerGroups = [], combos = [], query = "") {
  const q = (query || "").toLowerCase().trim();

  const filteredProviders = providerGroups
    .map((group) => {
      const groupMatches = (group.providerName || group.providerId || "").toLowerCase().includes(q);
      const matchedModels = (group.models || []).filter((model) => {
        if (!q || groupMatches) return true;
        const name = (model.name || "").toLowerCase();
        const id = (model.id || model.requestModel || "").toLowerCase();
        return name.includes(q) || id.includes(q);
      });

      return {
        ...group,
        models: matchedModels,
      };
    })
    .filter((group) => group.models.length > 0);

  const filteredCombos = (combos || []).filter((combo) => {
    if (!q) return true;
    const name = (combo.name || "").toLowerCase();
    const id = (combo.id || "").toLowerCase();
    const desc = (combo.description || "").toLowerCase();
    return name.includes(q) || id.includes(q) || desc.includes(q);
  });

  return {
    providers: filteredProviders,
    combos: filteredCombos,
  };
}

export default function ModelSelectorDropdown({
  selectedModel = "",
  selectedProvider = "",
  providerGroups = [],
  combos = [],
  onSelectModel,
  disabled = false,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Global Ctrl+K / Cmd+K listener to open model selector
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { providers: filteredProviders, combos: filteredCombos } = useMemo(() => {
    return filterModelsAndCombos(providerGroups, combos, searchQuery);
  }, [providerGroups, combos, searchQuery]);

  // Find active item display label
  const currentSelectionLabel = useMemo(() => {
    if (selectedModel?.startsWith("combo:")) {
      const comboId = selectedModel.replace("combo:", "");
      const found = combos.find((c) => c.id === comboId || c.name === comboId);
      return {
        title: found?.name || comboId,
        subtitle: "Combo Inteligente",
        isCombo: true,
      };
    }

    for (const group of providerGroups) {
      for (const m of group.models || []) {
        if (m.id === selectedModel || m.requestModel === selectedModel) {
          return {
            title: m.name || m.id,
            subtitle: group.providerName || group.providerId,
            isCombo: false,
          };
        }
      }
    }

    if (selectedModel) {
      return {
        title: selectedModel,
        subtitle: selectedProvider || "Modelo",
        isCombo: false,
      };
    }

    return {
      title: "Selecionar modelo...",
      subtitle: "",
      isCombo: false,
    };
  }, [selectedModel, selectedProvider, providerGroups, combos]);

  const handleSelect = (item, isCombo = false) => {
    if (isCombo) {
      onSelectModel(`combo:${item.name || item.id}`, "combo");
    } else {
      onSelectModel(item.requestModel || item.id, item.providerId);
    }
    setIsOpen(false);
    setSearchQuery("");
  };

  const totalOptionsCount =
    filteredCombos.length +
    filteredProviders.reduce((acc, g) => acc + g.models.length, 0);

  return h(
    "div",
    {
      className: `relative inline-block text-left ${className}`,
      ref: dropdownRef,
    },
    // Trigger button
    h(
      "button",
      {
        type: "button",
        onClick: () => !disabled && setIsOpen((prev) => !prev),
        disabled,
        className:
          "flex items-center gap-2 rounded-xl border border-border/80 bg-surface px-3 py-1.5 text-xs font-medium text-text-main shadow-xs hover:border-border hover:bg-surface-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20",
        "aria-haspopup": "listbox",
        "aria-expanded": isOpen,
        "aria-label": "Selecionar modelo de IA",
      },
      h(
        "span",
        { className: "material-symbols-outlined text-[18px] text-brand-500" },
        currentSelectionLabel.isCombo ? "alt_route" : "smart_toy"
      ),
      h(
        "div",
        { className: "flex flex-col items-start text-left max-w-[200px] sm:max-w-[260px]" },
        h(
          "span",
          { className: "truncate text-xs font-semibold leading-tight text-text-main" },
          currentSelectionLabel.title
        ),
        currentSelectionLabel.subtitle &&
          h(
            "span",
            { className: "truncate text-[10px] leading-tight text-text-subtle" },
            currentSelectionLabel.subtitle
          )
      ),
      h(
        "span",
        { className: "material-symbols-outlined text-[16px] text-text-subtle ml-1" },
        isOpen ? "expand_less" : "expand_more"
      )
    ),
    // Dropdown popover
    isOpen &&
      h(
        "div",
        {
          className:
            "absolute left-0 top-full z-50 mt-1.5 w-80 sm:w-96 rounded-2xl border border-border bg-surface p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100",
          role: "listbox",
        },
        // Search Input
        h(
          "div",
          { className: "relative mb-2 px-1" },
          h(
            "span",
            {
              className:
                "material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-text-subtle",
            },
            "search"
          ),
          h("input", {
            ref: searchInputRef,
            type: "text",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value),
            placeholder: "Buscar modelos ou combos... (Ctrl+K)",
            className:
              "w-full rounded-xl border border-border bg-surface-2 pl-8 pr-7 py-2 text-xs text-text-main placeholder:text-text-subtle focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30 transition-all",
            "aria-label": "Buscar modelos",
          }),
          searchQuery &&
            h(
              "button",
              {
                type: "button",
                onClick: () => setSearchQuery(""),
                className:
                  "absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-main",
              },
              h("span", { className: "material-symbols-outlined text-[14px]" }, "close")
            )
        ),
        // Options List
        h(
          "div",
          { className: "max-h-72 overflow-y-auto custom-scrollbar space-y-3 px-1" },
          totalOptionsCount === 0
            ? h(
                "div",
                { className: "py-6 text-center text-xs text-text-muted" },
                "Nenhum modelo ou combo encontrado."
              )
            : h(
                "div",
                { className: "space-y-3" },
                // Combos Section
                filteredCombos.length > 0 &&
                  h(
                    "div",
                    null,
                    h(
                      "div",
                      {
                        className:
                          "flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400",
                      },
                      h(
                        "span",
                        { className: "material-symbols-outlined text-[14px]" },
                        "alt_route"
                      ),
                      "Combos Inteligentes"
                    ),
                    h(
                      "div",
                      { className: "space-y-1 mt-1" },
                      filteredCombos.map((combo) => {
                        const comboKey = `combo:${combo.name || combo.id}`;
                        const isSelected = selectedModel === comboKey;

                        return h(
                          "button",
                          {
                            key: combo.id || combo.name,
                            type: "button",
                            onClick: () => handleSelect(combo, true),
                            className: `w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                              isSelected
                                ? "bg-brand-500/10 text-brand-600 dark:text-brand-300 font-medium"
                                : "text-text-main hover:bg-surface-2"
                            }`,
                            role: "option",
                            "aria-selected": isSelected,
                          },
                          h(
                            "div",
                            { className: "flex flex-col" },
                            h(
                              "span",
                              {
                                className:
                                  "font-semibold text-xs text-text-main flex items-center gap-1.5",
                              },
                              combo.name,
                              h(Badge, { variant: "primary", size: "sm" }, "Combo")
                            ),
                            combo.description &&
                              h(
                                "span",
                                {
                                  className:
                                    "text-[11px] text-text-subtle truncate max-w-[240px]",
                                },
                                combo.description
                              )
                          ),
                          isSelected &&
                            h(
                              "span",
                              {
                                className:
                                  "material-symbols-outlined text-[18px] text-brand-500 shrink-0",
                              },
                              "check"
                            )
                        );
                      })
                    )
                  ),
                // Provider Models Section
                filteredProviders.length > 0 &&
                  h(
                    "div",
                    null,
                    h(
                      "div",
                      {
                        className:
                          "flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-subtle",
                      },
                      h(
                        "span",
                        { className: "material-symbols-outlined text-[14px]" },
                        "psychology"
                      ),
                      "Modelos de Provedores"
                    ),
                    h(
                      "div",
                      { className: "space-y-3 mt-1" },
                      filteredProviders.map((group) =>
                        h(
                          "div",
                          { key: group.providerId, className: "space-y-0.5" },
                          h(
                            "div",
                            {
                              className:
                                "px-2 py-0.5 text-[10px] font-medium text-text-muted bg-surface-2/60 rounded-md",
                            },
                            group.providerName || group.providerId
                          ),
                          h(
                            "div",
                            { className: "space-y-0.5 pt-0.5" },
                            group.models.map((model) => {
                              const modelKey = model.requestModel || model.id;
                              const isSelected = selectedModel === modelKey;

                              return h(
                                "button",
                                {
                                  key: model.id || model.requestModel,
                                  type: "button",
                                  onClick: () => handleSelect(model, false),
                                  className: `w-full flex items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs transition-colors ${
                                    isSelected
                                      ? "bg-brand-500/10 text-brand-600 dark:text-brand-300 font-medium"
                                      : "text-text-main hover:bg-surface-2"
                                  }`,
                                  role: "option",
                                  "aria-selected": isSelected,
                                },
                                h(
                                  "div",
                                  { className: "flex flex-col truncate pr-2" },
                                  h(
                                    "span",
                                    {
                                      className: "truncate font-medium text-xs text-text-main",
                                    },
                                    model.name || model.id
                                  ),
                                  h(
                                    "span",
                                    { className: "truncate text-[10px] text-text-subtle" },
                                    model.id
                                  )
                                ),
                                isSelected &&
                                  h(
                                    "span",
                                    {
                                      className:
                                        "material-symbols-outlined text-[18px] text-brand-500 shrink-0",
                                    },
                                    "check"
                                  )
                              );
                            })
                          )
                        )
                      )
                    )
                  )
              )
        )
      )
  );
}

ModelSelectorDropdown.propTypes = {
  selectedModel: PropTypes.string,
  selectedProvider: PropTypes.string,
  providerGroups: PropTypes.arrayOf(PropTypes.object),
  combos: PropTypes.arrayOf(PropTypes.object),
  onSelectModel: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};
