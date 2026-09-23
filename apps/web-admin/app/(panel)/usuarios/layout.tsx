import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { Button } from "@gym-app/ui/components/Button";
import { TabsConfiguraciones } from "../configuraciones/TabsConfiguraciones";
import { TABS_CONFIGURACIONES } from "../configuraciones/tabs";

// Usuarios vive en su propia ruta (fuera de /configuraciones) pero
// comparte la misma barra de tabs — ver diseño acordado. Este layout NO
// exige rol SOCIO: la propia página valida el permiso USUARIOS/VER, que
// algunos roles sin ser SOCIO también pueden tener.
export default async function LayoutUsuarios({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerUsuarioDeSesionActual();
  // El título "Usuarios" de la página ya lo cubre la tab activa — el botón
  // "Nuevo usuario" sube a la misma fila que las tabs para no repetir la
  // palabra dos veces en la pantalla (ver diseño acordado).
  const puedeCrear =
    !!sesion &&
    (sesion.usuario.rol === "SOCIO" ||
      (await new PrismaPermisoRepository(prisma).tiene(sesion.usuario.id, "USUARIOS", "CREAR")));

  return (
    <>
      <div className="px-6 pt-6 lg:px-8 lg:pt-8">
        <TabsConfiguraciones
          tabs={TABS_CONFIGURACIONES}
          accion={
            puedeCrear && (
              <Link href="/usuarios/nuevo">
                <Button>Nuevo usuario</Button>
              </Link>
            )
          }
        />
      </div>
      {children}
    </>
  );
}
