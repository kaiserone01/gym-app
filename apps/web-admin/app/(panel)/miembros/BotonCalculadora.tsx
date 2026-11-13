// Abre la Calculadora de Windows mediante su protocolo `calculator:` (el navegador
// pide permiso la primera vez). Solo funciona en equipos Windows 10/11.
export function BotonCalculadora() {
  return (
    <a
      href="calculator:"
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[var(--gx-accent)] px-4 text-sm font-semibold text-[var(--gx-accent-ink)] outline-none transition-all duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--gx-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gx-surface)] active:scale-95"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="1.5" width="18" height="21" rx="3" fill="#2b3340" />
        <rect x="5.5" y="4" width="13" height="5" rx="1.2" fill="#9fe5ff" />
        <rect x="5.5" y="11" width="3.4" height="3" rx=".8" fill="#ffd166" />
        <rect x="10.3" y="11" width="3.4" height="3" rx=".8" fill="#ffd166" />
        <rect x="15.1" y="11" width="3.4" height="3" rx=".8" fill="#ff7a59" />
        <rect x="5.5" y="15.5" width="3.4" height="3" rx=".8" fill="#ffd166" />
        <rect x="10.3" y="15.5" width="3.4" height="3" rx=".8" fill="#ffd166" />
        <rect x="15.1" y="15.5" width="3.4" height="5" rx=".8" fill="#4cc9a0" />
      </svg>
      CALCULADORA
    </a>
  );
}
