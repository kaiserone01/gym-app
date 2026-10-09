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
        className={`min-h-11 rounded-lg border px-3 ${className} gx-campo`}
        {...props}
      />
    </label>
  );
}
