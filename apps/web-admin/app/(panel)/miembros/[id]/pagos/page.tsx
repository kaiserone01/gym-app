import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";

export default async function PaginaHistorialPagos({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { id } = await params;

  const miembro = await obtenerMiembro(
    { miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, id }
  ).catch((error) => {
    if (error instanceof MiembroNoEncontradoError) return null;
    throw error;
  });

  if (!miembro) notFound();

  const pagos = await listarPagos(
    { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, miembroId: id }
  );

  return (
    <div className="max-w-2xl p-8">
      <Link href={`/miembros/${id}`} className="mb-4 inline-block text-sm font-medium text-blue-600 hover:underline">
        ← Volver a {miembro.nombre}
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">Historial de pagos</h1>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Fecha</th>
            <th className="py-2">Monto (USD)</th>
            <th className="py-2">Método</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((pago) => (
            <tr key={pago.id} className="border-b">
              <td className="py-2">{new Date(pago.fechaPago).toLocaleDateString("es-VE")}</td>
              <td className="py-2">${pago.monto.toFixed(2)}</td>
              <td className="py-2">{pago.metodo}</td>
            </tr>
          ))}

          {pagos.length === 0 && (
            <tr>
              <td colSpan={3} className="py-8 text-center text-neutral-500">
                Todavía no hay pagos registrados para este miembro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
