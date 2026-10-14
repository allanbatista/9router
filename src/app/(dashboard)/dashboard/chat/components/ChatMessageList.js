"use client";

import { createElement as h, useRef, useEffect, useState, useCallback } from "react";
import PropTypes from "prop-types";
import ChatMessageItem from "./ChatMessageItem";

/**
 * Resolve linear message path from tree array and active message selections
 *
 * @param {Array} allMessages - Flat array of message nodes with `id` and `parentId`
 * @param {Object} selectedBranches - Map of parentId -> active child id
 * @returns {Array} Linear path of messages from root to leaf
 */
export function resolveActiveConversationPath(allMessages = [], selectedBranches = {}) {
  if (!Array.isArray(allMessages) || allMessages.length === 0) return [];

  // Group messages by parentId
  const childrenMap = new Map();
  for (const msg of allMessages) {
    const pId = msg.parentId ?? "root";
    if (!childrenMap.has(pId)) {
      childrenMap.set(pId, []);
    }
    childrenMap.get(pId).push(msg);
  }

  // Traverse from root
  const path = [];
  let currentParentId = "root";

  while (childrenMap.has(currentParentId)) {
    const siblings = childrenMap.get(currentParentId);
    if (!siblings || siblings.length === 0) break;

    // Pick selected sibling or latest one
    const selectedChildId = selectedBranches[currentParentId];
    let activeMsg = siblings.find((s) => s.id === selectedChildId);
    if (!activeMsg) {
      activeMsg = siblings[siblings.length - 1];
    }

    path.push(activeMsg);
    currentParentId = activeMsg.id;
  }

  return path;
}

/**
 * Get siblings for a given message node
 */
export function getMessageSiblings(allMessages = [], message) {
  if (!message) return [];
  const parentId = message.parentId ?? "root";
  return allMessages.filter((m) => (m.parentId ?? "root") === parentId);
}

export default function ChatMessageList({
  messages = [],
  allMessages = [],
  selectedBranches = {},
  onSelectSibling,
  onEditMessage,
  isStreaming = false,
  modelName = "",
  className = "",
}) {
  const containerRef = useRef(null);
  const bottomAnchorRef = useRef(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isAutoScrollEnabledRef = useRef(true);

  // Handle manual scroll to decouple autoscroll when user scrolls up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user scrolled up more than 80px, decouple autoscroll
    if (distanceFromBottom > 80) {
      isAutoScrollEnabledRef.current = false;
      setShowScrollBottom(true);
    } else {
      isAutoScrollEnabledRef.current = true;
      setShowScrollBottom(false);
    }
  }, []);

  const scrollToBottom = (smooth = true) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      isAutoScrollEnabledRef.current = true;
      setShowScrollBottom(false);
    }
  };

  // Scroll to bottom when messages update or streaming tokens arrive (if autoscroll enabled)
  useEffect(() => {
    if (isAutoScrollEnabledRef.current) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  return h(
    "div",
    { className: `relative flex flex-1 flex-col overflow-hidden ${className}` },
    // Scrollable message container
    h(
      "div",
      {
        ref: containerRef,
        onScroll: handleScroll,
        className: "flex-1 overflow-y-auto custom-scrollbar px-2 py-4",
        role: "log",
        "aria-live": "polite",
      },
      messages.map((msg, index) => {
        const siblings = getMessageSiblings(allMessages, msg);
        const currentSiblingIndex = siblings.findIndex((s) => s.id === msg.id);
        const isLastMessage = index === messages.length - 1;

        return h(ChatMessageItem, {
          key: msg.id,
          message: msg,
          siblings,
          currentSiblingIndex: Math.max(0, currentSiblingIndex),
          onSelectSibling,
          onEditMessage,
          isStreaming: isStreaming && isLastMessage && msg.role === "assistant",
          modelName,
        });
      }),
      h("div", { ref: bottomAnchorRef, className: "h-4" })
    ),
    // Floating "Scroll to bottom" button
    showScrollBottom &&
      h(
        "button",
        {
          type: "button",
          onClick: () => scrollToBottom(true),
          className:
            "absolute bottom-4 right-8 z-20 flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-main shadow-lg hover:bg-surface-2 transition-all animate-in fade-in slide-in-from-bottom-2",
          "aria-label": "Rolar para o final",
        },
        h(
          "span",
          { className: "material-symbols-outlined text-[16px] text-brand-500" },
          "arrow_downward"
        ),
        h("span", null, "Rolar para o final")
      )
  );
}

ChatMessageList.propTypes = {
  messages: PropTypes.arrayOf(PropTypes.object).isRequired,
  allMessages: PropTypes.arrayOf(PropTypes.object),
  selectedBranches: PropTypes.object,
  onSelectSibling: PropTypes.func,
  onEditMessage: PropTypes.func,
  isStreaming: PropTypes.bool,
  modelName: PropTypes.string,
  className: PropTypes.string,
};
