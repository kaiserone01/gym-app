import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaProductoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaProductoRepository";
import { obtenerTasaActual } from "../tasaActual";
import { FormularioProducto } from "../FormularioProducto";
import { actualizarProductoAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaEditarProducto({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const { id } = await params;
  const producto = await new PrismaProductoRepository(prisma).buscarPorId(usuario.organizacionId, id);
  if (!producto) notFound();

  return (
    <div className="max-w-lg p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Editar producto</PageHeader>
      </div>
      <FormularioProducto
        accion={actualizarProductoAction.bind(null, id)}
        tasaActual={await obtenerTasaActual()}
        valoresIniciales={{
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          costoUSD: producto.costoUSD,
          fotoUrl: producto.fotoUrl,
          activo: producto.activo,
        }}
      />
    </div>
  );
}
