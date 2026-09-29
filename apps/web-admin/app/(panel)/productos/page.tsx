import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaProductoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaProductoRepository";
import { listarProductos } from "@gym-app/domain/use-cases/ListarProductos";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { formatearBs } from "../tasaBcvFija";
import { obtenerTasaActual } from "./tasaActual";
import { BotonEliminarProducto } from "./BotonEliminarProducto";

function Miniatura({ fotoUrl }: { fotoUrl: string | null }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg" style={{ background: "var(--gx-surface-2)" }}>
      {fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- foto en R2 (dominio externo)
        <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

export default async function PaginaProductos() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const [productos, tasaActual] = await Promise.all([
    listarProductos({ productos: new PrismaProductoRepository(prisma) }, usuario.organizacionId),
    obtenerTasaActual(),
  ]);

  const equivalenteBs = (costoUSD: number) => (tasaActual !== null ? `Bs. ${formatearBs(costoUSD * tasaActual)}` : "—");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <PageHeader>Productos</PageHeader>
        <Link href="/productos/nuevo">
          <Button>Nuevo producto</Button>
        </Link>
      </div>

      <div className="hidden lg:block">
        <Card>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                <th className="py-2"></th>
                <th className="py-2">Nombre</th>
                <th className="py-2">Costo (USD)</th>
                <th className="py-2">Equivalente (Bs)</th>
                <th className="py-2">Estado</th>
                <th className="py-2"></th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((producto) => (
                <tr key={producto.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                  <td className="py-2 pr-3">
                    <Miniatura fotoUrl={producto.fotoUrl} />
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {producto.nombre}
                    {producto.descripcion && (
                      <span className="block text-xs" style={{ color: "var(--gx-muted)" }}>
                        {producto.descripcion}
                      </span>
                    )}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    ${producto.costoUSD.toFixed(2)}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {equivalenteBs(producto.costoUSD)}
                  </td>
                  <td className="py-2">
                    <Badge tono={producto.activo ? "verde" : "gris"}>{producto.activo ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/productos/${producto.id}`}
                      className="text-sm font-medium hover:underline"
                      style={{ color: "var(--gx-accent)" }}
                    >
                      Editar
                    </Link>
                  </td>
                  <td className="py-2">
                    <BotonEliminarProducto id={producto.id} nombre={producto.nombre} />
                  </td>
                </tr>
              ))}

              {productos.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Todavía no hay productos. Crea el primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {productos.map((producto) => (
          <Link key={producto.id} href={`/productos/${producto.id}`}>
            <Card className="transition-transform active:scale-[0.98]">
              <div className="flex items-center gap-3">
                <Miniatura fotoUrl={producto.fotoUrl} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium" style={{ color: "var(--gx-ink)" }}>
                    {producto.nombre}
                  </span>
                  <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
                    ${producto.costoUSD.toFixed(2)} · {equivalenteBs(producto.costoUSD)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge tono={producto.activo ? "verde" : "gris"}>{producto.activo ? "Activo" : "Inactivo"}</Badge>
                  <BotonEliminarProducto id={producto.id} nombre={producto.nombre} />
                </div>
              </div>
            </Card>
          </Link>
        ))}

        {productos.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Todavía no hay productos. Crea el primero.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
