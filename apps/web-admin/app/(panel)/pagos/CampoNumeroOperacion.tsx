// Últimos 4 dígitos de la operación: casilla angosta y destacada (no de ancho completo) que solo admite dígitos.
export function CampoNumeroOperacion({
  value,
  onChange,
  form,
}: {
  value: string;
  onChange: (valor: string) => void;
  form?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--gx-ink)" }}>
          Número de operación
        </span>
        <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
          últimos 4 dígitos
        </span>
      </span>
      <input
        form={form}
        required
        maxLength={4}
        pattern="[0-9]{4}"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0000"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-14 w-40 rounded-lg border-2 pl-[0.4em] text-center text-2xl font-bold tabular-nums tracking-[0.4em] outline-none transition-colors duration-150 placeholder:opacity-30 focus:border-[var(--gx-accent)]"
        style={{
          background: "var(--gx-surface-2)",
          borderColor: value.length === 4 ? "var(--gx-accent)" : "var(--gx-edge)",
          color: "var(--gx-ink)",
        }}
      />
    </label>
  );
}
