import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { InputPrompt } from "../types";

export function InputCard({
  prompt,
  onSubmit,
  disabled,
}: {
  prompt: InputPrompt;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prompt.autoFocus !== false) ref.current?.focus();
  }, [prompt.autoFocus]);

  function submit() {
    const v = value.trim();
    if (!v || disabled) return;
    onSubmit(v);
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl shadow-soft p-2 pl-4 pr-2 flex items-center gap-2 max-w-[520px] fade-in-up">
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder={prompt.placeholder}
        className="flex-1 bg-transparent outline-none text-[15px] py-2 min-w-0"
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="bg-secondary text-on-secondary font-semibold px-4 py-2 rounded-full hover:opacity-90 transition disabled:opacity-40 inline-flex items-center gap-1.5"
      >
        {prompt.submitLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
