import { LogoBadge } from "@gym-app/ui/components/LogoBadge";

// Mismo esquema visual del logo/nombre del gym que la pantalla de login
// (ver apps/web-admin/app/login/page.tsx) — acá en tamaño reducido, arriba
// del menú del sidebar, con la sucursal activa de la sesión debajo.
export function EncabezadoSidebar({ sucursalNombre }: { sucursalNombre: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <LogoBadge src="/branding/logo-adrenalina-gym.jpg" alt="Adrenalina Xtreme Gym" size={64} />
      <div>
        <div className="text-lg leading-none" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.04em" }}>
          ADRENALINA <span style={{ color: "var(--gx-accent)" }}>XTREME</span>
        </div>
        <div
          className="mt-1 text-[10px] uppercase"
          style={{
            fontFamily: '"Barlow Condensed", sans-serif',
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "var(--gx-muted-dim)",
          }}
        >
          Gym · Panel de administración
        </div>
      </div>
      <div
        className="mt-1 rounded px-2 py-1 text-xs font-medium"
        style={{ background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}
      >
        {sucursalNombre}
      </div>
    </div>
  );
}
