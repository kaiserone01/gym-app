import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { TabsConfiguraciones } from "../configuraciones/TabsConfiguraciones";
import { TABS_KIOSKO } from "./tabs";

export default async function LayoutKiosko({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  if (!puedeEditarKiosko(sesion.usuario.rol)) redirect("/miembros");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Kiosko</PageHeader>
      </div>

      <TabsConfiguraciones tabs={TABS_KIOSKO} />

      {children}
    </div>
  );
}
