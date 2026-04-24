import type { QuickReply } from "../types";

export function QuickReplies({
  options,
  onPick,
  disabled,
}: {
  options: QuickReply[];
  onPick: (r: QuickReply) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 pl-2 fade-in-up">
      {options.map((o) => (
        <button
          key={o.id}
          disabled={disabled}
          onClick={() => onPick(o)}
          className="text-sm px-4 py-2 rounded-full bg-surface-container-lowest border border-outline-variant/60 hover:border-secondary hover:bg-secondary-soft/60 hover:text-secondary transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
