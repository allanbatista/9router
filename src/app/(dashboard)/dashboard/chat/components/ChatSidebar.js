"use client";

import { createElement as h, useState, useRef, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import Button from "@/shared/components/Button";
import DeleteSessionConfirmModal from "./DeleteSessionConfirmModal";

/**
 * Group sessions chronologically into categories:
 * - Hoje (Today)
 * - Ontem (Yesterday)
 * - Últimos 7 dias (Previous 7 Days)
 * - Últimos 30 dias (Previous 30 Days)
 * - Anteriores (Older)
 *
 * @param {Array} sessions
 * @param {Date} now
 * @returns {Array<{ label: string, key: string, sessions: Array }>}
 */
export function groupSessionsChronologically(sessions = [], now = new Date()) {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  const nowDate = new Date(now);
  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  ).getTime();

  const oneDayMs = 24 * 60 * 60 * 1000;
  const startOfYesterday = startOfToday - oneDayMs;
  const startOf7Days = startOfToday - 6 * oneDayMs;
  const startOf30Days = startOfToday - 29 * oneDayMs;

  const groups = {
    today: { key: "today", label: "Hoje", sessions: [] },
    yesterday: { key: "yesterday", label: "Ontem", sessions: [] },
    last7: { key: "last7", label: "Últimos 7 dias", sessions: [] },
    last30: { key: "last30", label: "Últimos 30 dias", sessions: [] },
    older: { key: "older", label: "Anteriores", sessions: [] },
  };

  for (const session of sessions) {
    const timeStr = session.updatedAt || session.createdAt;
    const sessionTime = timeStr ? new Date(timeStr).getTime() : 0;

    if (sessionTime >= startOfToday) {
      groups.today.sessions.push(session);
    } else if (sessionTime >= startOfYesterday && sessionTime < startOfToday) {
      groups.yesterday.sessions.push(session);
    } else if (sessionTime >= startOf7Days && sessionTime < startOfYesterday) {
      groups.last7.sessions.push(session);
    } else if (sessionTime >= startOf30Days && sessionTime < startOf7Days) {
      groups.last30.sessions.push(session);
    } else {
      groups.older.sessions.push(session);
    }
  }

  return [groups.today, groups.yesterday, groups.last7, groups.last30, groups.older].filter(
    (g) => g.sessions.length > 0
  );
}

export default function ChatSidebar({
  sessions = [],
  activeSessionId = "",
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
  isOpen = true,
  onToggle,
  isMobile = false,
  loading = false,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [deletingSession, setDeletingSession] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const editInputRef = useRef(null);

  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase().trim();
    return sessions.filter(
      (s) =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.modelId && s.modelId.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  const grouped = useMemo(() => {
    return groupSessionsChronologically(filteredSessions);
  }, [filteredSessions]);

  const handleStartRename = (session, e) => {
    e?.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitleValue(session.title || "New chat");
  };

  const handleSaveRename = async () => {
    if (!editingSessionId) return;
    const trimmed = editTitleValue.trim();
    if (trimmed && onRenameSession) {
      await onRenameSession(editingSessionId, trimmed);
    }
    setEditingSessionId(null);
    setEditTitleValue("");
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditTitleValue("");
  };

  const handleKeyDownRename = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelRename();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSession || !onDeleteSession) return;
    setIsDeleting(true);
    try {
      await onDeleteSession(deletingSession.id);
      setDeletingSession(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const content = h(
    "aside",
    {
      className: `flex h-full flex-col bg-surface border-r border-border transition-all duration-300 select-none ${
        isMobile
          ? "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl"
          : isOpen
          ? "w-64 min-w-[16rem] max-w-[16rem]"
          : "w-0 min-w-0 overflow-hidden border-r-0"
      }`,
      "aria-label": "Histórico de conversas",
      role: "navigation",
    },
    // Top Header & New Chat button
    h(
      "div",
      { className: "p-3 border-b border-border/60 flex flex-col gap-2" },
      h(
        "div",
        { className: "flex items-center justify-between gap-1" },
        h(
          Button,
          {
            type: "button",
            variant: "primary",
            size: "md",
            icon: "add",
            onClick: onNewChat,
            fullWidth: true,
            className: "justify-start px-3 font-medium text-sm shadow-sm",
          },
          "Novo Chat"
        ),
        onToggle &&
          h(
            "button",
            {
              type: "button",
              onClick: onToggle,
              className:
                "flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-2 hover:text-text-main transition-colors shrink-0",
              title: "Recolher barra lateral",
              "aria-label": "Recolher barra lateral",
            },
            h(
              "span",
              { className: "material-symbols-outlined text-[20px]" },
              isMobile ? "close" : "dock_to_right"
            )
          )
      ),
      sessions.length > 5 &&
        h(
          "div",
          { className: "relative mt-1" },
          h(
            "span",
            {
              className:
                "material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle text-[16px] pointer-events-none",
            },
            "search"
          ),
          h("input", {
            type: "text",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value),
            placeholder: "Buscar conversas...",
            className:
              "w-full rounded-lg border border-border/80 bg-surface-2 pl-8 pr-7 py-1.5 text-xs text-text-main placeholder:text-text-subtle focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30 transition-all",
            "aria-label": "Filtrar histórico",
          }),
          searchQuery &&
            h(
              "button",
              {
                type: "button",
                onClick: () => setSearchQuery(""),
                className:
                  "absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-main",
                title: "Limpar busca",
              },
              h("span", { className: "material-symbols-outlined text-[14px]" }, "close")
            )
        )
    ),
    // Session groups list
    h(
      "div",
      { className: "flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4" },
      loading
        ? h(
            "div",
            { className: "space-y-2 p-2" },
            [1, 2, 3, 4].map((n) =>
              h("div", {
                key: n,
                className: "h-9 w-full animate-pulse rounded-lg bg-surface-2",
              })
            )
          )
        : sessions.length === 0
        ? h(
            "div",
            {
              className:
                "flex flex-col items-center justify-center p-6 text-center text-text-muted",
            },
            h(
              "span",
              { className: "material-symbols-outlined mb-2 text-3xl text-text-subtle" },
              "forum"
            ),
            h("p", { className: "text-xs" }, "Nenhuma conversa ainda"),
            h(
              "p",
              { className: "mt-1 text-[11px] text-text-subtle" },
              "Inicie um chat para ver seu histórico aqui."
            )
          )
        : filteredSessions.length === 0
        ? h(
            "div",
            { className: "p-4 text-center text-xs text-text-muted" },
            `Nenhuma conversa encontrada para "${searchQuery}"`
          )
        : grouped.map((group) =>
            h(
              "div",
              { key: group.key, className: "space-y-1" },
              h(
                "div",
                {
                  className:
                    "px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-subtle",
                },
                group.label
              ),
              h(
                "div",
                { className: "space-y-0.5" },
                group.sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isEditing = session.id === editingSessionId;

                  if (isEditing) {
                    return h(
                      "div",
                      {
                        key: session.id,
                        className:
                          "flex items-center gap-1 rounded-lg border border-brand-500/50 bg-surface-2 p-1.5",
                      },
                      h("input", {
                        ref: editInputRef,
                        type: "text",
                        value: editTitleValue,
                        onChange: (e) => setEditTitleValue(e.target.value),
                        onKeyDown: handleKeyDownRename,
                        className:
                          "flex-1 bg-transparent px-1 text-xs text-text-main focus:outline-none",
                        "aria-label": "Editar título da conversa",
                      }),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: handleSaveRename,
                          className:
                            "flex h-6 w-6 items-center justify-center rounded text-green-600 hover:bg-green-500/10 transition-colors",
                          title: "Salvar (Enter)",
                        },
                        h(
                          "span",
                          { className: "material-symbols-outlined text-[16px]" },
                          "check"
                        )
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: handleCancelRename,
                          className:
                            "flex h-6 w-6 items-center justify-center rounded text-text-subtle hover:bg-surface-3 transition-colors",
                          title: "Cancelar (Esc)",
                        },
                        h(
                          "span",
                          { className: "material-symbols-outlined text-[16px]" },
                          "close"
                        )
                      )
                    );
                  }

                  return h(
                    "div",
                    {
                      key: session.id,
                      onClick: () => onSelectSession && onSelectSession(session.id),
                      className: `group relative flex items-center justify-between rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-all duration-150 ${
                        isActive
                          ? "bg-surface-2 font-medium text-text-main shadow-xs"
                          : "text-text-muted hover:bg-surface-2/60 hover:text-text-main"
                      }`,
                      role: "button",
                      tabIndex: 0,
                      onKeyDown: (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectSession && onSelectSession(session.id);
                        }
                      },
                      title: session.title || "New chat",
                    },
                    h(
                      "div",
                      { className: "flex items-center gap-2 overflow-hidden pr-2" },
                      h(
                        "span",
                        {
                          className: `material-symbols-outlined text-[16px] shrink-0 ${
                            isActive
                              ? "text-brand-500"
                              : "text-text-subtle group-hover:text-text-muted"
                          }`,
                        },
                        "chat_bubble"
                      ),
                      h("span", { className: "truncate" }, session.title || "New chat")
                    ),
                    h(
                      "div",
                      {
                        className: `flex items-center gap-0.5 shrink-0 ${
                          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        } transition-opacity`,
                        onClick: (e) => e.stopPropagation(),
                      },
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: (e) => handleStartRename(session, e),
                          className:
                            "flex h-6 w-6 items-center justify-center rounded text-text-subtle hover:bg-surface-3 hover:text-text-main transition-colors",
                          title: "Renomear",
                          "aria-label": "Renomear conversa",
                        },
                        h(
                          "span",
                          { className: "material-symbols-outlined text-[14px]" },
                          "edit"
                        )
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: (e) => {
                            e.stopPropagation();
                            setDeletingSession(session);
                          },
                          className:
                            "flex h-6 w-6 items-center justify-center rounded text-text-subtle hover:bg-red-500/10 hover:text-red-600 transition-colors",
                          title: "Excluir",
                          "aria-label": "Excluir conversa",
                        },
                        h(
                          "span",
                          { className: "material-symbols-outlined text-[14px]" },
                          "delete"
                        )
                      )
                    )
                  );
                })
              )
            )
          )
    ),
    // Footer count info
    sessions.length > 0 &&
      h(
        "div",
        {
          className:
            "p-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-text-subtle",
        },
        h(
          "span",
          null,
          `${sessions.length} ${sessions.length === 1 ? "conversa" : "conversas"}`
        ),
        h(
          "span",
          { className: "flex items-center gap-1" },
          h("span", { className: "size-1.5 rounded-full bg-green-500" }),
          "9Router"
        )
      ),
    // Delete confirm modal
    h(DeleteSessionConfirmModal, {
      isOpen: Boolean(deletingSession),
      onClose: () => setDeletingSession(null),
      onConfirm: handleDeleteConfirm,
      sessionTitle: deletingSession?.title || "esta conversa",
      loading: isDeleting,
    })
  );

  if (isMobile && isOpen) {
    return h(
      h(
        "div",
        {
          className:
            "fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in",
          onClick: onToggle,
          "aria-hidden": "true",
        }
      ),
      content
    );
  }

  return content;
}

ChatSidebar.propTypes = {
  sessions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string,
      modelId: PropTypes.string,
      providerId: PropTypes.string,
      systemPrompt: PropTypes.string,
      messageCount: PropTypes.number,
      createdAt: PropTypes.string,
      updatedAt: PropTypes.string,
    })
  ),
  activeSessionId: PropTypes.string,
  onSelectSession: PropTypes.func.isRequired,
  onNewChat: PropTypes.func.isRequired,
  onRenameSession: PropTypes.func.isRequired,
  onDeleteSession: PropTypes.func.isRequired,
  isOpen: PropTypes.bool,
  onToggle: PropTypes.func,
  isMobile: PropTypes.bool,
  loading: PropTypes.bool,
};
