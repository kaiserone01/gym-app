import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { Sidebar } from "@gym-app/ui/components/Sidebar";
import { BarraUsuario } from "./BarraUsuario";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioDeSesionActual();

  if (!usuario) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-white text-neutral-900">
      <Sidebar
        items={[
          { href: "/miembros", label: "Miembros" },
          { href: "/pagos", label: "Pagos" },
          { href: "/planes", label: "Planes" },
          { href: "/caja", label: "Caja" },
          { href: "/usuarios", label: "Usuarios" },
          { href: "/sucursales", label: "Sucursales" },
          { href: "/estadisticas", label: "Estadísticas" },
        ]}
        pie={<BarraUsuario nombre={usuario.nombre} email={usuario.email} />}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
