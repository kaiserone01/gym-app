import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { Sidebar } from "@gym-app/ui/components/Sidebar";
import { FeedbackProvider } from "@gym-app/ui/components/FeedbackOverlay";
import { FeedbackDesdeUrl } from "@gym-app/ui/components/FeedbackDesdeUrl";
import { RelojYTasa } from "@gym-app/ui/components/RelojYTasa";
import { BarraUsuario } from "./BarraUsuario";
import { EncabezadoSidebar } from "./EncabezadoSidebar";
import { NavegacionMobile } from "./NavegacionMobile";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerUsuarioDeSesionActual();

  if (!sesion) {
    redirect("/login");
  }
  const { usuario, sucursalActivaId } = sesion;

  const sucursalActiva = await new PrismaSucursalRepository(prisma).buscarPorId(
    usuario.organizacionId,
    sucursalActivaId
  );

  return (
    <FeedbackProvider>
      <Suspense fallback={null}>
        <FeedbackDesdeUrl />
      </Suspense>
      <RelojYTasa />
      <div className="flex min-h-dvh flex-col lg:flex-row" style={{ background: "var(--gx-ground)" }}>
        <div className="hidden lg:block">
          <Sidebar
            encabezado={<EncabezadoSidebar sucursalNombre={sucursalActiva?.nombre ?? "—"} />}
            items={[
              { href: "/miembros", label: "Miembros" },
              { href: "/caja", label: "Caja" },
              { href: "/pagos", label: "Histórico de Pagos" },
              { href: "/estadisticas", label: "Estadísticas" },
              // Planes, Sucursales y Usuarios se administran desde las tabs
              // de Configuraciones (ver diseño acordado) — solo SOCIO llega
              // a ellas desde ahí.
              ...(usuario.rol === "SOCIO" ? [{ href: "/configuraciones", label: "Configuraciones" }] : []),
            ]}
            pie={<BarraUsuario nombre={usuario.nombre} email={usuario.email} fotoUrl={usuario.fotoUrl} />}
          />
        </div>
        {/* pt-16 reserva el espacio del badge de RelojYTasa (fixed,
            arriba a la derecha) — sin esto tapaba controles de página
            que también viven en esa esquina (ej. "Nuevo miembro" en
            /miembros). Se aplica acá, una sola vez, en vez de que cada
            página tenga que acordarse de dejarle margen. */}
        <main className="flex-1 pt-16 pb-16 lg:pb-0">{children}</main>
        <NavegacionMobile nombre={usuario.nombre} email={usuario.email} rol={usuario.rol} />
      </div>
    </FeedbackProvider>
  );
}
