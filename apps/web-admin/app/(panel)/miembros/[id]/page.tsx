import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { obtenerMiembro, MiembroNoEncontradoError, MiembroFueraDeSucursalError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { obtenerSucursalesVisiblesParaMiembro } from "../obtenerSucursalesVisibles";
import { obtenerEntrenadoresPorSucursal } from "../obtenerEntrenadoresPorSucursal";
import { MiembroFueraDeSucursal } from "./MiembroFueraDeSucursal";
import { FormularioMiembro } from "../FormularioMiembro";
import { actualizarMiembroAction } from "../actions";
import { PanelPagoYCambioPlan } from "../PanelPagoYCambioPlan";
import { registrarPagoAction, cambiarPlanAction } from "../../pagos/actions";
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
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const { id } = await params;

  let miembro;
  try {
    miembro = await obtenerMiembro(
      { miembros: new PrismaMemberRepository(prisma), sucursales: new PrismaSucursalRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, sucursalActivaId }
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) notFound();
    if (error instanceof MiembroFueraDeSucursalError) {
      return <MiembroFueraDeSucursal mensaje={error.message} />;
    }
    throw error;
  }

  const [pagos, planes, sucursales, metodosPago, turnoAbierto] = await Promise.all([
    listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId: id }
    ),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
    obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id),
  ]);
  const entrenadoresPorSucursal = await obtenerEntrenadoresPorSucursal(usuario.organizacionId, sucursales);

  const planesActivos = planes.filter((plan) => plan.activo);
  // Solo tiene sentido cobrar "la diferencia" cuando el ciclo actual todavía
  // no venció — vencido, el próximo pago ya es el precio completo del plan
  // que sea (ver diseño acordado).
  const tieneCicloVigente = miembro.fechaVencimiento !== null && miembro.fechaVencimiento > new Date();
  const frecuenciaActual = planes.find((p) => p.id === miembro.planId)?.frecuencia ?? "MENSUAL";

  // Últimos 5 ciclos con datos de rango — listarPagos ya devuelve los
  // pagos ordenados por fechaPago desc (ver PrismaPagoRepository), así
  // que basta filtrar y tomar los primeros 5.
  const ultimosCiclos = pagos
    .filter((pago) => pago.fechaInicioCiclo !== null && pago.fechaFinCiclo !== null)
    .slice(0, 5)
    .map((pago) => ({ id: pago.id, fechaInicioCiclo: pago.fechaInicioCiclo, fechaFinCiclo: pago.fechaFinCiclo }));

  // Entrenadores elegibles para "Cambiar de plan" (panel de pago) — mismo
  // criterio que FormularioMiembro: si el miembro es de una sede fija, solo
  // los de esa sede; si es "Ambas" (sucursalId null), los de todas.
  const entrenadoresDelMiembro = miembro.sucursalId
    ? entrenadoresPorSucursal[miembro.sucursalId] ?? []
    : Object.values(entrenadoresPorSucursal)
        .flat()
        .filter((e, i, lista) => lista.findIndex((otro) => otro.id === e.id) === i);

  return (
    <div className="max-w-7xl p-6 lg:px-8 lg:py-6">
      <div className="mb-4">
        <PageHeader>Editar miembro</PageHeader>
      </div>

      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        entrenadoresPorSucursal={entrenadoresPorSucursal}
        planes={planes}
        sucursales={sucursales}
        sucursalActivaNombre={sucursales.find((s) => s.id === sucursalActivaId)?.nombre ?? "—"}
        sucursalIdDefault={sucursalActivaId}
        metodosPago={metodosPago}
        miembroId={id}
        ultimosCiclos={ultimosCiclos}
        tieneCicloVigente={tieneCicloVigente}
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
            <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
              Registrar pago y Cambiar de plan se aplican al instante — no hace falta tocar &quot;Guardar&quot;
              primero.
            </p>

            <Link
              href={`/miembros/${id}/pagos`}
              className="block min-h-11 content-center rounded-lg px-4 text-center text-sm font-medium transition-colors duration-150 active:scale-95"
              style={{ background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}
            >
              Ver historial de pagos ({pagos.length})
            </Link>

            {turnoAbierto?.esPropio && (
              <PanelPagoYCambioPlan
                miembroId={id}
                accionRegistrarPago={registrarPagoAction}
                accionCambiarPlan={cambiarPlanAction}
                planes={planesActivos}
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
                metodosPago={metodosPago}
                tieneCicloVigente={tieneCicloVigente}
                planActualId={miembro.planId}
                precioActual={miembro.precioPlan}
                frecuenciaActual={frecuenciaActual}
                entrenadores={entrenadoresDelMiembro}
                entrenadorActualId={miembro.entrenadorId}
              />
            )}

            {!turnoAbierto?.esPropio && (
              // Cobrar una mensualidad es una operación de caja — no se
              // puede sin turno abierto (ver diseño acordado). Editar los
              // datos del miembro (el formulario principal) sí sigue
              // disponible, esto solo bloquea el bloque de cobro. Si la
              // caja está abierta pero por OTRO usuario, se avisa quién la
              // tiene en vez del genérico "abrí la caja".
              <AvisoCajaCerrada
                mensaje={
                  turnoAbierto
                    ? `No puedes registrar pagos: la caja está abierta por ${turnoAbierto.turno.usuarioNombre ?? "otro usuario"}.`
                    : "Para registrar un pago primero tenés que abrir la caja."
                }
              />
            )}
          </div>
        }
      />
    </div>
  );
}
