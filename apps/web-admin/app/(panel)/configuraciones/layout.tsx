import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

// Tabs preparadas para futuras secciones de Configuraciones — hoy solo
// existe "Métodos de pago" (ver diseño acordado).
const TABS = [{ href: "/configuraciones/metodos-pago", label: "Métodos de pago" }];

export default async function LayoutConfiguraciones({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") redirect("/miembros");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Configuraciones</PageHeader>
      </div>

      <div className="mb-6 flex gap-1 border-b" style={{ borderColor: "var(--gx-edge)" }}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="min-h-11 content-center border-b-2 px-4 text-sm font-medium"
            style={{ borderColor: "var(--gx-accent)", color: "var(--gx-ink)" }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
