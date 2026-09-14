import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaPagos() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const pagos = await listarPagos(
    { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId }
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pagos</h1>
        <Link href="/pagos/nuevo">
          <Button>Registrar pago</Button>
        </Link>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Fecha</th>
            <th className="py-2">Miembro</th>
            <th className="py-2">Monto (USD)</th>
            <th className="py-2">Método</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((pago) => (
            <tr key={pago.id} className="border-b">
              <td className="py-2">{new Date(pago.fechaPago).toLocaleDateString("es-VE")}</td>
              <td className="py-2">
                <Link href={`/miembros/${pago.miembroId}`} className="text-blue-600 hover:underline">
                  {pago.miembroNombre ?? pago.miembroId}
                </Link>
              </td>
              <td className="py-2">${pago.monto.toFixed(2)}</td>
              <td className="py-2">{pago.metodo}</td>
            </tr>
          ))}

          {pagos.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-neutral-500">
                Todavía no hay pagos registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
