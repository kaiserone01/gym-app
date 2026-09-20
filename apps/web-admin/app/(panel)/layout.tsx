import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { Sidebar } from "@gym-app/ui/components/Sidebar";
import { BarraUsuario } from "./BarraUsuario";
import { NavegacionMobile } from "./NavegacionMobile";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioDeSesionActual();

  if (!usuario) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" style={{ background: "var(--gx-ground)" }}>
      <div className="hidden lg:block">
        <Sidebar
          items={[
            { href: "/miembros", label: "Miembros" },
            { href: "/pagos", label: "Pagos" },
            { href: "/planes", label: "Planes" },
            { href: "/caja", label: "Caja" },
            { href: "/usuarios", label: "Usuarios" },
            { href: "/sucursales", label: "Sucursales" },
            { href: "/estadisticas", label: "Estadísticas" },
            ...(usuario.rol === "SOCIO" ? [{ href: "/configuraciones", label: "Configuraciones" }] : []),
          ]}
          pie={<BarraUsuario nombre={usuario.nombre} email={usuario.email} fotoUrl={usuario.fotoUrl} />}
        />
      </div>
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      <NavegacionMobile nombre={usuario.nombre} email={usuario.email} rol={usuario.rol} />
    </div>
  );
}
