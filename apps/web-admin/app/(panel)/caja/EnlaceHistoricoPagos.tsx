import Link from "next/link";

export function EnlaceHistoricoPagos() {
  return (
    <Link
      href="/pagos"
      className="inline-flex min-h-11 items-center rounded-lg border border-[var(--gx-field-edge)] bg-[var(--gx-surface-elevada)] px-4 text-sm font-semibold text-[var(--gx-ink)] outline-none transition-all duration-150 hover:border-[var(--gx-field-edge-hover)] hover:bg-[var(--gx-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--gx-accent)] active:scale-95"
    >
      Histórico de pagos
    </Link>
  );
}
