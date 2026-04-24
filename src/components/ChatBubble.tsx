import type { ChatMessage } from "../types";

export function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} fade-in-up`}>
      <div
        className={[
          "max-w-[78%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary-dark text-on-primary rounded-br-sm"
            : "bg-surface-container-lowest text-on-surface shadow-soft border border-outline-variant/40 rounded-bl-sm",
        ].join(" ")}
      >
        {msg.content}
      </div>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-surface-container-lowest shadow-soft border border-outline-variant/40 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant typing-dot" />
        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant typing-dot" />
        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant typing-dot" />
      </div>
    </div>
  );
}
