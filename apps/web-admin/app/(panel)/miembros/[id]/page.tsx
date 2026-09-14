import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaEntrenadorRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEntrenadorRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarEntrenadores } from "@gym-app/domain/use-cases/ListarEntrenadores";
import { FormularioMiembro } from "../FormularioMiembro";
import { actualizarMiembroAction } from "../actions";
import { FormularioPago } from "../../pagos/FormularioPago";
import { registrarPagoAction } from "../../pagos/actions";

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

  const [pagos, planes, entrenadores] = await Promise.all([
    listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId: id }
    ),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarEntrenadores({ entrenadores: new PrismaEntrenadorRepository(prisma) }, usuario.organizacionId),
  ]);

  const planesActivos = planes.filter((plan) => plan.activo);

  return (
    <div className="max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar miembro</h1>

      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        entrenadores={entrenadores}
        valoresIniciales={{
          nombre: miembro.nombre,
          cedula: miembro.cedula,
          celular: miembro.celular ?? "",
          fechaInscripcion: (miembro.fechaInscripcion ?? miembro.createdAt).toISOString().slice(0, 10),
          planTipo: miembro.planTipo,
          precioPlan: miembro.precioPlan,
          entrenadorId: miembro.entrenadorId,
          fotoUrl: miembro.fotoUrl,
        }}
        panelLateral={
          <div className="flex flex-col gap-6">
            <Link
              href={`/miembros/${id}/pagos`}
              className="block rounded px-4 py-2 text-center text-sm font-medium text-neutral-900 bg-neutral-200 hover:bg-neutral-300"
            >
              Ver historial de pagos ({pagos.length})
            </Link>

            <div className="rounded-xl border border-neutral-200 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Registrar pago
              </h2>
              <FormularioPago
                accion={registrarPagoAction}
                miembros={[]}
                planes={planesActivos}
                miembroIdFijo={id}
              />
            </div>
          </div>
        }
      />
    </div>
  );
}
