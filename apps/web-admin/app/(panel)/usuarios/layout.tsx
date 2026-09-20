import { TabsConfiguraciones } from "../configuraciones/TabsConfiguraciones";
import { TABS_CONFIGURACIONES } from "../configuraciones/tabs";

// Usuarios vive en su propia ruta (fuera de /configuraciones) pero
// comparte la misma barra de tabs — ver diseño acordado. Este layout NO
// exige rol SOCIO: la propia página valida el permiso USUARIOS/VER, que
// algunos roles sin ser SOCIO también pueden tener.
export default function LayoutUsuarios({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="px-6 pt-6 lg:px-8 lg:pt-8">
        <TabsConfiguraciones tabs={TABS_CONFIGURACIONES} />
      </div>
      {children}
    </>
  );
}
