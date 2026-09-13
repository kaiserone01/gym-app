import type { InputHTMLAttributes } from "react";

export function Input({
  label,
  name,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-neutral-700">
      {label}
      <input
        name={name}
        className={`rounded border border-neutral-300 px-3 py-2 outline-none focus:border-blue-500 ${className}`}
        {...props}
      />
    </label>
  );
}
