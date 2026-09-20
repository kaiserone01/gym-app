import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { TabsConfiguraciones } from "./TabsConfiguraciones";
import { TABS_CONFIGURACIONES } from "./tabs";

export default async function LayoutConfiguraciones({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") redirect("/miembros");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Configuraciones</PageHeader>
      </div>

      <TabsConfiguraciones tabs={TABS_CONFIGURACIONES} />

      {children}
    </div>
  );
}
