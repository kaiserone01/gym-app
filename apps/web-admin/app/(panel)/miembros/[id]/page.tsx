import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { FormularioMiembro } from "../FormularioMiembro";
import { actualizarMiembroAction, darDeBajaAction, reactivarAction } from "../actions";
import { FormularioPago } from "../../pagos/FormularioPago";
import { registrarPagoAction } from "../../pagos/actions";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaEditarMiembro({ params }: { params: Promise<{ id: string }> }) {
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

  const [pagos, planes] = await Promise.all([
    listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId: id }
    ),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
  ]);

  const planesActivos = planes.filter((plan) => plan.activo);

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar miembro</h1>

      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        valoresIniciales={{
          nombre: miembro.nombre,
          cedula: miembro.cedula,
          celular: miembro.celular ?? "",
          planTipo: miembro.planTipo,
          precioPlan: miembro.precioPlan,
        }}
      />

      {miembro.activo ? (
        <form action={darDeBajaAction.bind(null, id)} className="mt-6">
          <Button variant="peligro" type="submit">
            Dar de baja
          </Button>
        </form>
      ) : (
        <form action={reactivarAction.bind(null, id)} className="mt-6">
          <Button variant="secundario" type="submit">
            Reactivar
          </Button>
        </form>
      )}

      <hr className="my-8 border-neutral-200" />

      <h2 className="mb-4 text-xl font-semibold">Pagos</h2>

      <table className="mb-6 w-full border-collapse text-left">
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
              <td colSpan={3} className="py-6 text-center text-neutral-500">
                Todavía no hay pagos registrados para este miembro.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 className="mb-4 text-lg font-semibold">Registrar pago</h3>
      <FormularioPago
        accion={registrarPagoAction}
        miembros={[]}
        planes={planesActivos}
        miembroIdFijo={id}
      />
    </div>
  );
}
