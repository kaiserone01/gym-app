import { TabsConfiguraciones } from "../configuraciones/TabsConfiguraciones";
import { TABS_CONFIGURACIONES } from "../configuraciones/tabs";

// Planes vive en su propia ruta (fuera de /configuraciones) pero comparte
// la misma barra de tabs para que se sienta como una sola sección — ver
// diseño acordado. A diferencia de /configuraciones, este layout NO exige
// rol SOCIO (Planes es visible para cualquier rol, ver layout del panel) y
// no envuelve en un contenedor con padding — cada página hija ya trae el suyo.
export default function LayoutPlanes({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="px-6 pt-6 lg:px-8 lg:pt-8">
        <TabsConfiguraciones tabs={TABS_CONFIGURACIONES} />
      </div>
      {children}
    </>
  );
}
