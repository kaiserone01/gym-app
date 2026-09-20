import type { InputHTMLAttributes } from "react";

export function Input({
  label,
  name,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
      {label}
      <input
        name={name}
        className={`min-h-11 rounded-lg border px-3 outline-none transition-colors duration-150 focus:border-[var(--gx-accent)] disabled:opacity-50 ${className}`}
        style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        {...props}
      />
    </label>
  );
}
