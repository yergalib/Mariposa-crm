"use client";

import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import type { ChatCard } from "@/lib/assistant/chat/contracts";
import type { OutfitSlot } from "@/lib/assistant/chat/outfit-contracts";

export type MariposaMessage = {
  role: "user" | "assistant";
  content: string;
  cards?: ChatCard[];
  slot?: OutfitSlot;
  historical?: boolean;
};
const convertMessage = (message: ThreadMessageLike): ThreadMessageLike => message;

// The existing MARIPOSA store and controlled API remain authoritative.
// No cloud adapter, client-side model/tool execution or independent history store.
export function AssistantThread({ messages, pending, onSend, onCancel, renderMessage }: {
  messages: MariposaMessage[];
  pending: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => void;
  renderMessage: (message: MariposaMessage) => ReactNode;
}) {
  const converted = useMemo<ThreadMessageLike[]>(() => messages.map((message, index) => ({
    id: `mariposa-${index}-${message.role}`,
    role: message.role,
    content: [{ type: "text", text: message.content }],
    metadata: { custom: { sourceIndex: index } },
  })), [messages]);
  const runtime = useExternalStoreRuntime({
    messages: converted,
    convertMessage,
    isRunning: pending,
    onNew: async message => {
      const text = message.content.filter(part => part.type === "text").map(part => part.text).join("\n");
      if (text.trim()) await onSend(text);
    },
    onCancel: async () => { onCancel(); },
  });
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className="mariposa-assistant-thread" aria-busy={pending}>
      <ThreadPrimitive.Messages>{({ message }) => {
        const index = message.metadata.custom.sourceIndex;
        const original = typeof index === "number" ? messages[index] : undefined;
        return original ? renderMessage(original) : null;
      }}</ThreadPrimitive.Messages>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
