import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { obtenerSucursalesVisiblesParaMiembro } from "../obtenerSucursalesVisibles";
import { obtenerEntrenadoresPorSucursal } from "../obtenerEntrenadoresPorSucursal";
import { FormularioMiembro } from "../FormularioMiembro";
import { actualizarMiembroAction } from "../actions";
import { FormularioPago } from "../../pagos/FormularioPago";
import { registrarPagoAction } from "../../pagos/actions";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { obtenerTurnoAbiertoParaUsuario } from "../../caja/obtenerTurnoAbiertoParaUsuario";
import { AvisoCajaCerrada } from "../../caja/AvisoCajaCerrada";

// OJO: nunca usar fecha.toISOString() acá — convierte a UTC primero, y de
// noche (pasadas las 8pm en Venezuela, UTC-4) eso salta al día siguiente.
function formatearFechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

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

  const [pagos, planes, sucursales, sucursalesOrganizacion, metodosPago, turnoAbierto] = await Promise.all([
    listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId: id }
    ),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
    obtenerTurnoAbiertoParaUsuario(usuario),
  ]);
  const entrenadoresPorSucursal = await obtenerEntrenadoresPorSucursal(usuario.organizacionId, sucursales);

  const planesActivos = planes.filter((plan) => plan.activo);

  // Últimos 5 ciclos con datos de rango — listarPagos ya devuelve los
  // pagos ordenados por fechaPago desc (ver PrismaPagoRepository), así
  // que basta filtrar y tomar los primeros 5.
  const ultimosCiclos = pagos
    .filter((pago) => pago.fechaInicioCiclo !== null && pago.fechaFinCiclo !== null)
    .slice(0, 5)
    .map((pago) => ({ id: pago.id, fechaInicioCiclo: pago.fechaInicioCiclo, fechaFinCiclo: pago.fechaFinCiclo }));

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Editar miembro</PageHeader>
      </div>

      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        entrenadoresPorSucursal={entrenadoresPorSucursal}
        planes={planes}
        sucursales={sucursales}
        sucursalesOrganizacion={sucursalesOrganizacion}
        sucursalIdDefault={usuario.sucursalId}
        metodosPago={metodosPago}
        miembroId={id}
        ultimosCiclos={ultimosCiclos}
        valoresIniciales={{
          nombre: miembro.nombre,
          cedula: miembro.cedula,
          celular: miembro.celular ?? "",
          fechaInscripcion: formatearFechaISO(miembro.fechaInscripcion ?? miembro.createdAt),
          sucursalId: miembro.sucursalId,
          planId: miembro.planId,
          precioPlan: miembro.precioPlan,
          entrenadorId: miembro.entrenadorId,
          fotoUrl: miembro.fotoUrl,
        }}
        panelLateral={
          <div className="flex flex-col gap-6">
            <Link
              href={`/miembros/${id}/pagos`}
              className="block min-h-11 content-center rounded-lg px-4 text-center text-sm font-medium transition-colors duration-150 active:scale-95"
              style={{ background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}
            >
              Ver historial de pagos ({pagos.length})
            </Link>

            {turnoAbierto ? (
              <Card>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
                  Registrar pago
                </h2>
                <FormularioPago
                  accion={registrarPagoAction}
                  miembros={[]}
                  planes={planesActivos}
                  metodosPago={metodosPago}
                  sucursalesVisibles={sucursales}
                  sucursalesOrganizacion={sucursalesOrganizacion}
                  sucursalIdDefault={usuario.sucursalId}
                  miembroIdFijo={id}
                  planFijo={
                    miembro.planId
                      ? {
                          id: miembro.planId,
                          nombre: planes.find((p) => p.id === miembro.planId)?.nombre ?? "Plan actual",
                          precioUSD: miembro.precioPlan,
                          multisede: planes.find((p) => p.id === miembro.planId)?.multisede ?? false,
                        }
                      : undefined
                  }
                  origen="miembro"
                />
              </Card>
            ) : (
              // Cobrar una mensualidad es una operación de caja — no se
              // puede sin turno abierto (ver diseño acordado). Editar los
              // datos del miembro (el formulario principal) sí sigue
              // disponible, esto solo bloquea el bloque de cobro.
              <AvisoCajaCerrada mensaje="Para registrar un pago primero tenés que abrir la caja." />
            )}
          </div>
        }
      />
    </div>
  );
}
