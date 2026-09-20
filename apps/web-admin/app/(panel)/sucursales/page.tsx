import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaSucursales() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const esSocio = usuario.rol === "SOCIO";
  const permisos = new PrismaPermisoRepository(prisma);
  // Un SOCIO siempre tiene acceso total (no puede auto-bloquearse por permisos).
  const puedeVer = esSocio || (await permisos.tiene(usuario.id, "SUCURSALES", "VER"));
  if (!puedeVer) redirect("/miembros");

  const puedeCrear = esSocio || (await permisos.tiene(usuario.id, "SUCURSALES", "CREAR"));
  const sucursales = await listarSucursales(
    { sucursales: new PrismaSucursalRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <PageHeader>Sucursales</PageHeader>
        {puedeCrear && (
          <Link href="/sucursales/nuevo">
            <Button>Nueva sucursal</Button>
          </Link>
        )}
      </div>

      <div className="hidden lg:block">
        <Card>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                <th className="py-2">Nombre</th>
                <th className="py-2">Dirección</th>
                <th className="py-2">Días de gracia</th>
                <th className="py-2">Estado</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sucursales.map((sucursal) => (
                <tr key={sucursal.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {sucursal.nombre}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {sucursal.direccion || "—"}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {sucursal.diasGracia}
                  </td>
                  <td className="py-2">
                    <Badge tono={sucursal.activo ? "verde" : "gris"}>
                      {sucursal.activo ? "Activa" : "Inactiva"}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/sucursales/${sucursal.id}`}
                      className="text-sm font-medium hover:underline"
                      style={{ color: "var(--gx-accent)" }}
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}

              {sucursales.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Todavía no hay sucursales. Creá la primera.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {sucursales.map((sucursal) => (
          <Link key={sucursal.id} href={`/sucursales/${sucursal.id}`}>
            <Card className="transition-transform active:scale-[0.98]">
              <div className="flex items-center justify-between">
                <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                  {sucursal.nombre}
                </span>
                <Badge tono={sucursal.activo ? "verde" : "gris"}>
                  {sucursal.activo ? "Activa" : "Inactiva"}
                </Badge>
              </div>
              <div className="mt-2 flex justify-between text-sm" style={{ color: "var(--gx-muted)" }}>
                <span>{sucursal.direccion || "Sin dirección"}</span>
                <span>{sucursal.diasGracia} días de gracia</span>
              </div>
            </Card>
          </Link>
        ))}

        {sucursales.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Todavía no hay sucursales. Creá la primera.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
