import { useState } from "react";
import type { SliderPrompt } from "../types";
import { fmtNum } from "../lib/format";

export function SliderCard({
  prompt,
  onSubmit,
  disabled,
}: {
  prompt: SliderPrompt;
  onSubmit: (value: number) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(prompt.defaultValue);
  const pct = ((value - prompt.min) / (prompt.max - prompt.min)) * 100;

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl shadow-soft p-5 max-w-[520px] fade-in-up">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm text-on-surface-variant">{prompt.label}</div>
        <div className="font-display font-bold text-2xl text-primary-dark tabular-nums">
          {fmtNum(value)} <span className="text-sm text-on-surface-variant font-sans font-medium">{prompt.unit}</span>
        </div>
      </div>
      <div className="relative py-2">
        <input
          type="range"
          min={prompt.min}
          max={prompt.max}
          step={prompt.step}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full h-2 accent-secondary cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--color-secondary) 0%, var(--color-secondary) ${pct}%, var(--color-surface-container-high) ${pct}%, var(--color-surface-container-high) 100%)`,
            borderRadius: 999,
            WebkitAppearance: "none",
            appearance: "none",
          }}
        />
        <div className="flex justify-between text-xs text-on-surface-variant mt-1 tabular-nums">
          <span>{fmtNum(prompt.min)}</span>
          <span>{fmtNum(prompt.max)}</span>
        </div>
      </div>
      <button
        disabled={disabled}
        onClick={() => onSubmit(value)}
        className="mt-3 bg-secondary text-on-secondary font-semibold px-5 py-2.5 rounded-full hover:opacity-90 transition disabled:opacity-40 disabled:pointer-events-none"
      >
        Bevestigen
      </button>
    </div>
  );
}
