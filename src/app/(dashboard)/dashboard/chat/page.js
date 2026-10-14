import { createElement as h } from "react";
import ChatPageClient from "./ChatPageClient";

export const metadata = {
  title: "Chat - 9Router",
  description: "Chat com histórico e inteligência artificial multimodal no 9Router",
};

export default function ChatPage() {
  return h(ChatPageClient);
}
