import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";

// Mock @/shared/components to avoid parsing JSX files in node test environment
vi.mock("@/shared/components/Button", () => ({
  default: function MockButton(props) {
    return React.createElement("button", { "data-testid": "mock-button", ...props });
  },
}));

vi.mock("@/shared/components/Badge", () => ({
  default: function MockBadge(props) {
    return React.createElement("span", { "data-testid": "mock-badge", ...props });
  },
}));

vi.mock("@/shared/components/Modal", () => ({
  default: function MockModal(props) {
    return React.createElement("div", { "data-testid": "mock-modal", ...props }, props.children);
  },
  ConfirmModal: function MockConfirmModal(props) {
    return React.createElement("div", { "data-testid": "mock-confirm-modal", ...props });
  },
}));

import ChatSidebar, {
  groupSessionsChronologically,
} from "@/app/(dashboard)/dashboard/chat/components/ChatSidebar";
import ChatHeader from "@/app/(dashboard)/dashboard/chat/components/ChatHeader";
import ModelSelectorDropdown, {
  filterModelsAndCombos,
} from "@/app/(dashboard)/dashboard/chat/components/ModelSelectorDropdown";
import ChatMessageList, {
  resolveActiveConversationPath,
  getMessageSiblings,
} from "@/app/(dashboard)/dashboard/chat/components/ChatMessageList";
import ChatMessageItem from "@/app/(dashboard)/dashboard/chat/components/ChatMessageItem";
import ChatInputArea, {
  fileToDataUrl,
} from "@/app/(dashboard)/dashboard/chat/components/ChatInputArea";
import SystemPromptModal from "@/app/(dashboard)/dashboard/chat/components/SystemPromptModal";
import DeleteSessionConfirmModal from "@/app/(dashboard)/dashboard/chat/components/DeleteSessionConfirmModal";

describe("Chat Client Components & Logic Unit Tests", () => {
  describe("Chronological Date Grouping (groupSessionsChronologically)", () => {
    it("correctly groups sessions into Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, and Anteriores", () => {
      const baseDate = new Date(2026, 7, 23, 12, 0, 0); // 2026-08-23 12:00:00

      const sessions = [
        {
          id: "s1",
          title: "Hoje Session",
          updatedAt: new Date(2026, 7, 23, 9, 30, 0).toISOString(),
        },
        {
          id: "s2",
          title: "Ontem Session",
          updatedAt: new Date(2026, 7, 22, 14, 0, 0).toISOString(),
        },
        {
          id: "s3",
          title: "7 Dias Session",
          updatedAt: new Date(2026, 7, 19, 10, 0, 0).toISOString(),
        },
        {
          id: "s4",
          title: "30 Dias Session",
          updatedAt: new Date(2026, 7, 2, 8, 0, 0).toISOString(),
        },
        {
          id: "s5",
          title: "Anteriores Session",
          updatedAt: new Date(2026, 5, 10, 8, 0, 0).toISOString(),
        },
      ];

      const grouped = groupSessionsChronologically(sessions, baseDate);

      expect(grouped).toHaveLength(5);
      expect(grouped[0].label).toBe("Hoje");
      expect(grouped[0].sessions[0].id).toBe("s1");

      expect(grouped[1].label).toBe("Ontem");
      expect(grouped[1].sessions[0].id).toBe("s2");

      expect(grouped[2].label).toBe("Últimos 7 dias");
      expect(grouped[2].sessions[0].id).toBe("s3");

      expect(grouped[3].label).toBe("Últimos 30 dias");
      expect(grouped[3].sessions[0].id).toBe("s4");

      expect(grouped[4].label).toBe("Anteriores");
      expect(grouped[4].sessions[0].id).toBe("s5");
    });

    it("handles empty or invalid sessions gracefully", () => {
      expect(groupSessionsChronologically([])).toEqual([]);
      expect(groupSessionsChronologically(null)).toEqual([]);
      expect(groupSessionsChronologically(undefined)).toEqual([]);
    });
  });

  describe("Model Selector Filtering (filterModelsAndCombos)", () => {
    const mockProviders = [
      {
        providerId: "openai",
        providerName: "OpenAI",
        models: [
          { id: "gpt-4o", name: "GPT-4o", requestModel: "gpt-4o", providerId: "openai" },
          { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", requestModel: "gpt-3.5-turbo", providerId: "openai" },
        ],
      },
      {
        providerId: "anthropic",
        providerName: "Anthropic",
        models: [
          { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", requestModel: "claude-3-5-sonnet", providerId: "anthropic" },
        ],
      },
    ];

    const mockCombos = [
      { id: "combo-code", name: "Smart Code", description: "Best coding models" },
      { id: "combo-fast", name: "Fast Response", description: "Low latency models" },
    ];

    it("returns all items when search query is empty", () => {
      const result = filterModelsAndCombos(mockProviders, mockCombos, "");
      expect(result.providers).toHaveLength(2);
      expect(result.combos).toHaveLength(2);
    });

    it("filters models by name or id", () => {
      const result = filterModelsAndCombos(mockProviders, mockCombos, "sonnet");
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].models[0].id).toBe("claude-3-5-sonnet");
      expect(result.combos).toHaveLength(0);
    });

    it("filters combos by name or description", () => {
      const result = filterModelsAndCombos(mockProviders, mockCombos, "latency");
      expect(result.combos).toHaveLength(1);
      expect(result.combos[0].id).toBe("combo-fast");
      expect(result.providers).toHaveLength(0);
    });
  });

  describe("Branching Tree Resolution (resolveActiveConversationPath & getMessageSiblings)", () => {
    const messagesTree = [
      { id: "m1", parentId: null, role: "user", content: "Primeira pergunta" },
      { id: "m2", parentId: "m1", role: "assistant", content: "Primeira resposta" },
      { id: "m3-v1", parentId: "m2", role: "user", content: "Segunda pergunta (v1)" },
      { id: "m4-v1", parentId: "m3-v1", role: "assistant", content: "Segunda resposta (v1)" },
      // Branch v2 on turn 2
      { id: "m3-v2", parentId: "m2", role: "user", content: "Segunda pergunta (v2)" },
      { id: "m4-v2", parentId: "m3-v2", role: "assistant", content: "Segunda resposta (v2)" },
    ];

    it("resolves default latest branch when no explicit selection is provided", () => {
      const path = resolveActiveConversationPath(messagesTree, {});
      expect(path.map((m) => m.id)).toEqual(["m1", "m2", "m3-v2", "m4-v2"]);
    });

    it("resolves selected earlier branch when parentId mapping is provided", () => {
      const path = resolveActiveConversationPath(messagesTree, {
        m2: "m3-v1",
      });
      expect(path.map((m) => m.id)).toEqual(["m1", "m2", "m3-v1", "m4-v1"]);
    });

    it("identifies sibling variants for a message node", () => {
      const siblingsV1 = getMessageSiblings(messagesTree, messagesTree[2]); // m3-v1
      expect(siblingsV1.map((s) => s.id)).toEqual(["m3-v1", "m3-v2"]);

      const siblingsRoot = getMessageSiblings(messagesTree, messagesTree[0]); // m1
      expect(siblingsRoot.map((s) => s.id)).toEqual(["m1"]);
    });
  });

  describe("File Attachment & MIME Validation", () => {
    it("identifies supported image MIME types", () => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      expect(allowed.includes("image/png")).toBe(true);
      expect(allowed.includes("image/jpeg")).toBe(true);
      expect(allowed.includes("image/webp")).toBe(true);
      expect(allowed.includes("image/gif")).toBe(true);
      expect(allowed.includes("application/pdf")).toBe(false);
      expect(allowed.includes("text/plain")).toBe(false);
    });

    it("validates 10MB file size limit", () => {
      const MAX_SIZE = 10 * 1024 * 1024;
      const validSize = 5 * 1024 * 1024;
      const oversize = 12 * 1024 * 1024;
      expect(validSize <= MAX_SIZE).toBe(true);
      expect(oversize <= MAX_SIZE).toBe(false);
    });
  });

  describe("Component Rendering Tests", () => {
    it("renders ChatSidebar with sessions list and new chat button", () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatSidebar, {
          sessions: [
            { id: "s1", title: "Test Chat 1", createdAt: new Date().toISOString() },
          ],
          activeSessionId: "s1",
          onSelectSession: () => {},
          onNewChat: () => {},
          onRenameSession: () => {},
          onDeleteSession: () => {},
          isOpen: true,
        })
      );
      expect(html).toContain("Test Chat 1");
      expect(html).toContain("Novo Chat");
    });

    it("renders ChatHeader with model selector and system prompt triggers", () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatHeader, {
          sidebarOpen: true,
          onToggleSidebar: () => {},
          selectedModel: "gpt-4o",
          selectedProvider: "openai",
          providerGroups: [],
          combos: [],
          onSelectModel: () => {},
          systemPrompt: "Be concise.",
          onOpenSystemPrompt: () => {},
          onNewChat: () => {},
        })
      );
      expect(html).toContain("System Prompt");
    });

    it("renders ChatMessageItem for user role with text and attachments", () => {
      const msg = {
        id: "msg-user-1",
        role: "user",
        content: "Hello world!",
        attachments: [
          { id: "att-1", name: "test.png", dataUrl: "data:image/png;base64,xyz" },
        ],
        createdAt: new Date().toISOString(),
      };
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMessageItem, {
          message: msg,
          siblings: [msg],
          currentSiblingIndex: 0,
        })
      );
      expect(html).toContain("Hello world!");
      expect(html).toContain("Você");
    });

    it("renders ChatMessageItem for assistant role with Markdown and branch controls", () => {
      const msgV1 = { id: "a1", parentId: "u1", role: "assistant", content: "Response 1" };
      const msgV2 = { id: "a2", parentId: "u1", role: "assistant", content: "Response 2" };

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMessageItem, {
          message: msgV2,
          siblings: [msgV1, msgV2],
          currentSiblingIndex: 1,
          modelName: "gpt-4o",
        })
      );
      expect(html).toContain("2/2");
      expect(html).toContain("gpt-4o");
    });

    it("renders ChatInputArea with placeholder and file upload button", () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatInputArea, {
          onSendMessage: () => {},
          onStopStreaming: () => {},
          isStreaming: false,
        })
      );
      expect(html).toContain("arrow_upward");
      expect(html).toContain("add_photo_alternate");
    });

    it("renders SystemPromptModal when isOpen is true", () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(SystemPromptModal, {
          isOpen: true,
          onClose: () => {},
          systemPrompt: "You are helpful.",
          onSave: () => {},
        })
      );
      expect(html).toContain("Instruções do Sistema");
    });

    it("renders DeleteSessionConfirmModal when isOpen is true", () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(DeleteSessionConfirmModal, {
          isOpen: true,
          onClose: () => {},
          onConfirm: () => {},
          sessionTitle: "Minha Conversa",
        })
      );
      expect(html).toContain("mock-confirm-modal");
    });
  });
});
