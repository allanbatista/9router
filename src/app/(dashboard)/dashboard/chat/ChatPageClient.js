"use client";

import { createElement as h, useState, useEffect, useRef, useMemo, useCallback } from "react";
import ChatSidebar from "./components/ChatSidebar";
import ChatHeader from "./components/ChatHeader";
import ChatMessageList, { resolveActiveConversationPath } from "./components/ChatMessageList";
import ChatInputArea from "./components/ChatInputArea";
import SystemPromptModal from "./components/SystemPromptModal";

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseSSEEventChunks(textChunk) {
  const lines = textChunk.split(/\r?\n/);
  const deltas = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const dataStr = trimmed.slice(5).trim();
    if (dataStr === "[DONE]") continue;

    try {
      const parsed = JSON.parse(dataStr);
      const choice = parsed?.choices?.[0];
      const deltaContent =
        choice?.delta?.content ??
        choice?.message?.content ??
        choice?.text ??
        parsed?.output_text ??
        parsed?.text;
      if (deltaContent) {
        deltas.push(typeof deltaContent === "string" ? deltaContent : String(deltaContent));
      }
    } catch {
      // ignore partial json
    }
  }

  return deltas.join("");
}

export default function ChatPageClient() {
  // State: Sessions & Active Session
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingActiveSession, setLoadingActiveSession] = useState(false);

  // State: Model Selection & Providers
  const [providerGroups, setProviderGroups] = useState([]);
  const [combos, setCombos] = useState([]);
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [selectedProvider, setSelectedProvider] = useState("");

  // State: UI Shell
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [systemPromptModalOpen, setSystemPromptModalOpen] = useState(false);
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);

  // State: Conversation Tree & Branching
  const [selectedBranches, setSelectedBranches] = useState({});

  // State: Streaming
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef(null);
  const currentStreamingTextRef = useRef("");

  // Detect Mobile Viewport
  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Global Keyboard Shortcuts (Ctrl+Shift+O for New Chat)
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleNewChat();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch Providers & Combos on mount
  useEffect(() => {
    async function loadProvidersAndCombos() {
      try {
        const [providersRes, combosRes] = await Promise.all([
          fetch("/api/providers", { cache: "no-store" }),
          fetch("/api/combos", { cache: "no-store" }),
        ]);

        const providersData = await providersRes.json().catch(() => ({}));
        const combosData = await combosRes.json().catch(() => ({}));

        const connections = Array.isArray(providersData?.connections)
          ? providersData.connections.filter((c) => c?.isActive !== false)
          : [];

        const loadedCombos = Array.isArray(combosData?.combos) ? combosData.combos : [];
        setCombos(loadedCombos);

        const groups = [];
        for (const conn of connections) {
          const providerId = conn.provider || conn.id;
          const providerName = conn.name || providerId;

          // Fetch models per connection
          let models = [];
          try {
            const mRes = await fetch(`/api/providers/${encodeURIComponent(conn.id)}/models`);
            const mData = await mRes.json().catch(() => ({}));
            const list = Array.isArray(mData?.models) ? mData.models : [];
            models = list.map((m) => {
              const mId = typeof m === "string" ? m : m.id || m.name;
              return {
                id: mId,
                name: m.name || mId,
                requestModel: mId,
                providerId,
              };
            });
          } catch {
            models = [];
          }

          groups.push({
            providerId,
            providerName,
            models,
          });
        }

        setProviderGroups(groups);

        // Pick initial model if available
        if (loadedCombos.length > 0) {
          setSelectedModel(`combo:${loadedCombos[0].name || loadedCombos[0].id}`);
          setSelectedProvider("combo");
        } else if (groups.length > 0 && groups[0].models?.length > 0) {
          setSelectedModel(groups[0].models[0].id);
          setSelectedProvider(groups[0].providerId);
        }
      } catch (err) {
        console.error("Failed to load providers/combos:", err);
      }
    }

    loadProvidersAndCombos();
  }, []);

  // Fetch Chat Sessions on mount
  useEffect(() => {
    async function loadSessions() {
      setLoadingSessions(true);
      try {
        const res = await fetch("/api/chat/sessions", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.sessions) ? data.sessions : [];
        setSessions(list);

        if (list.length > 0) {
          // Select most recent session
          selectSession(list[0].id);
        } else {
          // Create initial empty session
          createNewSession();
        }
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
      } finally {
        setLoadingSessions(false);
      }
    }

    loadSessions();
  }, []);

  // Create a new session via API
  const createNewSession = async () => {
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New chat",
          modelId: selectedModel || "gpt-4o",
          providerId: selectedProvider || null,
          messages: [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.session) {
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        setActiveSession(data.session);
        setSelectedBranches({});
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  // Select an existing session and fetch full details (messages)
  const selectSession = async (sessionId) => {
    if (!sessionId) return;
    setActiveSessionId(sessionId);
    setLoadingActiveSession(true);

    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (data?.session) {
        setActiveSession(data.session);
        if (data.session.modelId) {
          setSelectedModel(data.session.modelId);
          setSelectedProvider(data.session.providerId || "");
        }
        setSelectedBranches({});
      }
    } catch (err) {
      console.error("Failed to fetch session detail:", err);
    } finally {
      setLoadingActiveSession(false);
    }
  };

  // Handle "+ New Chat" button click
  const handleNewChat = () => {
    if (isStreaming) return;
    createNewSession();
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  // Handle Session Rename
  const handleRenameSession = async (sessionId, newTitle) => {
    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.session) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
        );
        if (activeSessionId === sessionId) {
          setActiveSession((prev) => (prev ? { ...prev, title: newTitle } : prev));
        }
      }
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  };

  // Handle Session Delete
  const handleDeleteSession = async (sessionId) => {
    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        setSessions(remaining);

        if (activeSessionId === sessionId) {
          if (remaining.length > 0) {
            selectSession(remaining[0].id);
          } else {
            createNewSession();
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  // Handle System Prompt Save
  const handleSaveSystemPrompt = async (prompt) => {
    if (!activeSessionId) return;
    setSavingSystemPrompt(true);
    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(activeSessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.session) {
        setActiveSession((prev) => (prev ? { ...prev, systemPrompt: prompt } : prev));
      }
    } catch (err) {
      console.error("Failed to save system prompt:", err);
    } finally {
      setSavingSystemPrompt(false);
    }
  };

  // Handle Model Selection
  const handleSelectModel = async (modelId, providerId) => {
    setSelectedModel(modelId);
    setSelectedProvider(providerId);

    if (activeSessionId) {
      try {
        await fetch(`/api/chat/sessions/${encodeURIComponent(activeSessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, providerId }),
        });
        setActiveSession((prev) => (prev ? { ...prev, modelId, providerId } : prev));
      } catch (err) {
        console.error("Failed to update session model:", err);
      }
    }
  };

  // Branch Selection: when user clicks `< 1/2 >`
  const handleSelectSibling = (childId) => {
    const allMsgs = activeSession?.messages || [];
    const targetMsg = allMsgs.find((m) => m.id === childId);
    if (!targetMsg) return;

    const parentId = targetMsg.parentId ?? "root";
    setSelectedBranches((prev) => ({
      ...prev,
      [parentId]: childId,
    }));
  };

  // Active linear message chain resolved from branching tree
  const activeMessageList = useMemo(() => {
    const allMsgs = activeSession?.messages || [];
    return resolveActiveConversationPath(allMsgs, selectedBranches);
  }, [activeSession?.messages, selectedBranches]);

  // Execute SSE Chat Streaming Request
  const executeChatStream = async (updatedMessages, currentSessionId) => {
    if (!currentSessionId) return;

    setIsStreaming(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    currentStreamingTextRef.current = "";

    // Assistant message node
    const lastUserMsg = updatedMessages[updatedMessages.length - 1];
    const assistantMsgId = generateId();
    const assistantMsg = {
      id: assistantMsgId,
      parentId: lastUserMsg.id,
      role: "assistant",
      content: "",
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    // Append streaming assistant message to local session
    const messagesWithAssistant = [...updatedMessages, assistantMsg];
    setActiveSession((prev) => (prev ? { ...prev, messages: messagesWithAssistant } : prev));

    // Prepare API completions payload
    const systemPrompt = activeSession?.systemPrompt;
    const requestMessages = [];

    if (systemPrompt && systemPrompt.trim()) {
      requestMessages.push({ role: "system", content: systemPrompt.trim() });
    }

    // Build linear messages for completion
    for (const msg of updatedMessages) {
      if (msg.role === "user") {
        const text = typeof msg.content === "string" ? msg.content : "";
        const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];

        if (attachments.length > 0) {
          const parts = [];
          if (text) parts.push({ type: "text", text });
          for (const att of attachments) {
            if (att?.dataUrl) {
              parts.push({ type: "image_url", image_url: { url: att.dataUrl } });
            }
          }
          requestMessages.push({ role: "user", content: parts });
        } else {
          requestMessages.push({ role: "user", content: text });
        }
      } else if (msg.role === "assistant") {
        requestMessages.push({
          role: "assistant",
          content: typeof msg.content === "string" ? msg.content : "",
        });
      }
    }

    try {
      const response = await fetch("/api/dashboard/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: requestMessages,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const errMsg =
          errJson?.error?.message ||
          errJson?.error ||
          errJson?.message ||
          `HTTP ${response.status}`;
        const errorContent = `Error: ${errMsg}`;

        setActiveSession((prev) => {
          if (!prev) return prev;
          const updated = prev.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, content: errorContent } : m
          );
          return { ...prev, messages: updated };
        });

        const finalMessages = activeSession?.messages || messagesWithAssistant;
        const finalWithAssistant = finalMessages.map((m) =>
          m.id === assistantMsgId ? { ...m, content: errorContent } : m
        );

        await fetch(`/api/chat/sessions/${encodeURIComponent(currentSessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalWithAssistant }),
        }).catch(() => {});
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            const choice = parsed?.choices?.[0];
            const deltaContent =
              choice?.delta?.content ??
              choice?.message?.content ??
              choice?.text ??
              parsed?.output_text ??
              parsed?.text;
            if (deltaContent) {
              accumulatedText += typeof deltaContent === "string" ? deltaContent : String(deltaContent);
              currentStreamingTextRef.current = accumulatedText;

              setActiveSession((prev) => {
                if (!prev) return prev;
                const updated = prev.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
                );
                return { ...prev, messages: updated };
              });
            }
          } catch {
            // ignore partial json
          }
        }
      }

      // Handle remaining buffer after the loop
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr !== "[DONE]") {
            try {
              const parsed = JSON.parse(dataStr);
              const choice = parsed?.choices?.[0];
              const deltaContent =
                choice?.delta?.content ??
                choice?.message?.content ??
                choice?.text ??
                parsed?.output_text ??
                parsed?.text;
              if (deltaContent) {
                accumulatedText += typeof deltaContent === "string" ? deltaContent : String(deltaContent);
                currentStreamingTextRef.current = accumulatedText;

                setActiveSession((prev) => {
                  if (!prev) return prev;
                  const updated = prev.messages.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
                  );
                  return { ...prev, messages: updated };
                });
              }
            } catch {
              // ignore partial json
            }
          }
        }
      }

      // Persist final session state to MongoDB
      const finalMessages = activeSession?.messages || messagesWithAssistant;
      const finalWithAssistant = finalMessages.map((m) =>
        m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
      );

      await fetch(`/api/chat/sessions/${encodeURIComponent(currentSessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: finalWithAssistant }),
      });
    } catch (err) {
      if (err.name === "AbortError") {
        // User clicked Stop: save partial received text
        const partialText = currentStreamingTextRef.current;
        const currentMsgs = activeSession?.messages || messagesWithAssistant;
        const finalWithPartial = currentMsgs.map((m) =>
          m.id === assistantMsgId ? { ...m, content: partialText } : m
        );

        await fetch(`/api/chat/sessions/${encodeURIComponent(currentSessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalWithPartial }),
        }).catch(() => {});
      } else {
        console.error("Streaming inference error:", err);
        const errorContent = `Error: ${err.message || String(err)}`;
        setActiveSession((prev) => {
          if (!prev) return prev;
          const updated = prev.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, content: errorContent } : m
          );
          return { ...prev, messages: updated };
        });

        const currentMsgs = activeSession?.messages || messagesWithAssistant;
        const finalWithError = currentMsgs.map((m) =>
          m.id === assistantMsgId ? { ...m, content: errorContent } : m
        );

        await fetch(`/api/chat/sessions/${encodeURIComponent(currentSessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalWithError }),
        }).catch(() => {});
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Handle New Message Submission
  const handleSendMessage = async (text, attachments = []) => {
    if ((!text && attachments.length === 0) || isStreaming || !activeSessionId) return;

    const allMsgs = activeSession?.messages || [];
    const activePath = resolveActiveConversationPath(allMsgs, selectedBranches);
    const lastMsg = activePath[activePath.length - 1];

    const userMsg = {
      id: generateId(),
      parentId: lastMsg ? lastMsg.id : null,
      role: "user",
      content: text,
      attachments: attachments.map((a) => ({
        id: a.id || generateId(),
        name: a.name || "imagem.png",
        type: a.type || "image/png",
        dataUrl: a.dataUrl,
      })),
      createdAt: new Date().toISOString(),
    };

    // Auto-update session title if it's the first message
    if (allMsgs.length === 0 && text) {
      const shortTitle = text.slice(0, 48).trim();
      handleRenameSession(activeSessionId, shortTitle);
    }

    const updatedAllMessages = [...allMsgs, userMsg];
    setActiveSession((prev) => (prev ? { ...prev, messages: updatedAllMessages } : prev));

    // Linear active messages + new message
    const updatedActivePath = [...activePath, userMsg];
    executeChatStream(updatedActivePath, activeSessionId);
  };

  // Handle Edit User Turn with Branching
  const handleEditMessage = async (messageId, newContent) => {
    if (isStreaming || !activeSessionId) return;

    const allMsgs = activeSession?.messages || [];
    const originalMsg = allMsgs.find((m) => m.id === messageId);
    if (!originalMsg) return;

    // Create a new branched user message with the SAME parentId
    const branchedUserMsg = {
      id: generateId(),
      parentId: originalMsg.parentId ?? null,
      role: "user",
      content: newContent,
      attachments: originalMsg.attachments || [],
      createdAt: new Date().toISOString(),
    };

    const updatedAllMessages = [...allMsgs, branchedUserMsg];

    // Set new branch selection for this parent
    const parentKey = originalMsg.parentId ?? "root";
    setSelectedBranches((prev) => ({
      ...prev,
      [parentKey]: branchedUserMsg.id,
    }));

    setActiveSession((prev) => (prev ? { ...prev, messages: updatedAllMessages } : prev));

    // Recompute path up to this new branch and stream
    const pathUpToBranch = resolveActiveConversationPath(updatedAllMessages, {
      ...selectedBranches,
      [parentKey]: branchedUserMsg.id,
    });

    executeChatStream(pathUpToBranch, activeSessionId);
  };

  // Handle Stop Streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return h(
    "div",
    { className: "flex h-screen w-full overflow-hidden bg-bg text-text-main" },
    // Historical Chat Sidebar
    h(ChatSidebar, {
      sessions,
      activeSessionId,
      onSelectSession: (id) => {
        selectSession(id);
        if (isMobile) setSidebarOpen(false);
      },
      onNewChat: handleNewChat,
      onRenameSession: handleRenameSession,
      onDeleteSession: handleDeleteSession,
      isOpen: sidebarOpen,
      onToggle: () => setSidebarOpen((prev) => !prev),
      isMobile,
      loading: loadingSessions,
    }),
    // Main Chat Central Container
    h(
      "div",
      { className: "flex flex-1 flex-col overflow-hidden bg-bg" },
      // Header
      h(ChatHeader, {
        sidebarOpen,
        onToggleSidebar: () => setSidebarOpen((prev) => !prev),
        selectedModel,
        selectedProvider,
        providerGroups,
        combos,
        onSelectModel: handleSelectModel,
        systemPrompt: activeSession?.systemPrompt || "",
        onOpenSystemPrompt: () => setSystemPromptModalOpen(true),
        onNewChat: handleNewChat,
        isMobile,
        isStreaming,
      }),
      // Message View Area or Empty State
      activeMessageList.length === 0
        ? h(
            "div",
            {
              className:
                "flex flex-1 flex-col items-center justify-center p-6 text-center select-none",
            },
            h(
              "div",
              {
                className:
                  "flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500 shadow-xs mb-4",
              },
              h(
                "span",
                { className: "material-symbols-outlined text-[32px]" },
                "smart_toy"
              )
            ),
            h(
              "h2",
              { className: "text-xl font-bold text-text-main" },
              "Como posso ajudar hoje?"
            ),
            h(
              "p",
              { className: "mt-1.5 max-w-md text-xs text-text-muted" },
              "Envie uma pergunta técnica, solicite criação de código ou anexe imagens para análise multimodal."
            )
          )
        : h(ChatMessageList, {
            messages: activeMessageList,
            allMessages: activeSession?.messages || [],
            selectedBranches,
            onSelectSibling: handleSelectSibling,
            onEditMessage: handleEditMessage,
            isStreaming,
            modelName: selectedModel,
          }),
      // Bottom Chat Input Form
      h(ChatInputArea, {
        onSendMessage: handleSendMessage,
        onStopStreaming: handleStopStreaming,
        isStreaming,
        disabled: loadingActiveSession,
      })
    ),
    // System Prompt Configuration Modal
    h(SystemPromptModal, {
      isOpen: systemPromptModalOpen,
      onClose: () => setSystemPromptModalOpen(false),
      systemPrompt: activeSession?.systemPrompt || "",
      onSave: handleSaveSystemPrompt,
      loading: savingSystemPrompt,
    })
  );
}
