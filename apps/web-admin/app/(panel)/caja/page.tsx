import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerResumenTurno, METODO_EFECTIVO_BS } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaVigente";
import { orquestadorTasa } from "@/lib/tasaBcv";
import { obtenerUltimoCierrePorSucursal } from "@gym-app/domain/use-cases/ObtenerUltimoCierrePorSucursal";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { PrismaReglaAbonoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaReglaAbonoRepository";
import { listarReglasAbono } from "@gym-app/domain/use-cases/ListarReglasAbono";
import { obtenerTurnoAbiertoParaUsuario } from "./obtenerTurnoAbiertoParaUsuario";
import { AvisoCajaAjena } from "./AvisoCajaAjena";
import { BotonRegistrarPagoCaja } from "./BotonRegistrarPagoCaja";
import { BotonRegistrarEgreso } from "./BotonRegistrarEgreso";

// El método ahora se guarda como snapshot legible ("Pago Móvil - Banesco")
// directo en Pago.metodo, ya no como código a traducir contra un catálogo
// estático — se mantiene esta función identidad para no tocar cada
// llamado existente.
function nombreMetodo(valor: string): string {
  return valor;
}

// Ref en USD del montoEsperado de una línea en Bs: el fondo inicial en
// efectivo no tiene tasa propia capturada (se fijó al abrir el turno, no
// es una transacción) así que su porción se convierte con la tasa BCV
// vigente AHORA — y solo aplica a la línea de efectivo en Bs, ningún otro
// método (Punto de Venta, Pago Móvil, etc.) tiene fondo inicial propio.
// Pagos y egresos ya traen su propia referencia capturada a SU tasa (ver
// ObtenerResumenTurno.totalPagosUSD/totalEgresosUSD). Devuelve null si la
// línea es en USD o si no hay tasa vigente disponible.
function calcularRefUSD(
  linea: { metodo: string; enBs: boolean; totalPagosUSD: number; totalEgresosUSD: number },
  fondoInicialEfectivoBs: number,
  tasaActual: number | null
): number | null {
  if (!linea.enBs || tasaActual === null) return null;
  const fondoBs = linea.metodo === METODO_EFECTIVO_BS ? fondoInicialEfectivoBs : 0;
  const fondoRefUSD = fondoBs / tasaActual;
  return fondoRefUSD + linea.totalPagosUSD - linea.totalEgresosUSD;
}
import { formatearBs, formatearBsConRef } from "../tasaBcvFija";
import { inicioDelDia, finDelDia, inicioDeSemana, finDeSemana, inicioDeMes, finDeMes, formatearFechaISO } from "../fechas";
import { FormularioAbrirTurno } from "./FormularioAbrirTurno";
import { FormularioArqueo } from "./FormularioArqueo";
import { abrirTurnoAction, registrarEgresoAction, cerrarTurnoAction } from "./actions";

export default async function PaginaCaja() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id);

  // La sucursal activa de esta sesión (elegida al loguearse) — ya no hace
  // falta distinguir "la del turno" vs "la fija del usuario": son siempre
  // la misma, porque el turno que se busca es justamente el de
  // sucursalActivaId (ver obtenerTurnoAbiertoParaUsuario).
  const sucursalId = sucursalActivaId;

  if (turnoAbierto) {
    const esPropio = turnoAbierto.esPropio;
    const [resumen, miembros, planes, metodosPago, tasaCambio, reglasAbono] = await Promise.all([
      obtenerResumenTurno(
        {
          turnos: turnoRepo,
          pagos: new PrismaPagoRepository(prisma),
          egresos: new PrismaEgresoRepository(prisma),
        },
        { organizacionId: usuario.organizacionId, turnoId: turnoAbierto.turno.id }
      ),
      listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId, sucursalActivaId),
      listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
      listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
      // Solo para mostrar la referencia en USD de la porción "fondo
      // inicial" de la línea en Bs (ver más abajo) — si no hay tasa
      // guardada todavía, simplemente se omite ese REF.
      orquestadorTasa.obtenerTasaVigenteFresca().catch((error) => {
        if (error instanceof SinTasaDisponibleError) return null;
        throw error;
      }),
      listarReglasAbono({ reglasAbono: new PrismaReglaAbonoRepository(prisma) }, usuario.organizacionId),
    ]);
    const tasaActual = tasaCambio?.tasa.valor ?? null;

    const miembrosActivos = miembros.filter((m) => m.activo);
    const planesActivos = planes.filter((p) => p.activo);

    return (
      <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
        <PageHeader>Turno activo</PageHeader>

        {/* Layout compacto: una sola barra de estado + acciones arriba
            (en vez de 3 cards del mismo ancho con la de "Registrar pago"
            casi vacía — el botón ahora abre un modal, no necesita todo el
            ancho de una card), resumen por método en grilla densa, pagos
            y egresos lado a lado con scroll interno propio, arqueo al
            final. Objetivo: que todo entre sin scroll excesivo (ver
            mockup acordado). En mobile se apila igual que antes. */}
        <div className="flex flex-col gap-4">
          {esPropio ? (
            <Card className="flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                    Abierto desde
                  </p>
                  <p className="font-medium" style={{ color: "var(--gx-ink)" }}>
                    {resumen.turno.abiertoEn.toLocaleString("es-VE")}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                    Fondo inicial en efectivo
                  </p>
                  <p className="font-medium" style={{ color: "var(--gx-ink)" }}>
                    ${resumen.turno.fondoInicialEfectivoUSD.toFixed(2)} /{" "}
                    {formatearBsConRef(
                      resumen.turno.fondoInicialEfectivoBs,
                      tasaActual !== null ? resumen.turno.fondoInicialEfectivoBs / tasaActual : null
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <BotonRegistrarPagoCaja
                  miembros={miembrosActivos}
                  planes={planesActivos}
                  metodosPago={metodosPago}
                  tasaActual={tasaActual}
                  lineasResumenTurno={resumen.lineas}
                  reglasAbono={reglasAbono}
                />
                <BotonRegistrarEgreso accion={registrarEgresoAction} turnoId={resumen.turno.id} />
              </div>
            </Card>
          ) : (
            <AvisoCajaAjena
              usuarioNombre={turnoAbierto.turno.usuarioNombre ?? "otro usuario"}
              abiertoEn={turnoAbierto.turno.abiertoEn}
            />
          )}

          <Card className="text-sm">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
              Resumen por método
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resumen.lineas.map((linea) => {
                const refUSD = calcularRefUSD(linea, resumen.turno.fondoInicialEfectivoBs, tasaActual);

                return (
                  <div
                    key={linea.metodo}
                    className="flex justify-between gap-3 rounded-lg px-3 py-2.5"
                    style={{ background: "var(--gx-surface-2)" }}
                  >
                    <span style={{ color: "var(--gx-muted)" }}>{nombreMetodo(linea.metodo)}</span>
                    <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                      {linea.enBs ? formatearBsConRef(linea.montoEsperado, refUSD) : `$${linea.montoEsperado.toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {(resumen.pagos.length > 0 || resumen.egresos.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {resumen.pagos.length > 0 && (
                <Card className="text-sm">
                  <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
                    Pagos del turno
                  </h2>
                  <div className="max-h-80 overflow-y-auto overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse text-left">
                      <thead>
                        <tr className="border-b text-xs" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                          <th className="py-2">Miembro</th>
                          <th className="py-2">Método</th>
                          <th className="py-2">USD</th>
                          <th className="py-2">Bs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumen.pagos
                          .filter((pago) => !pago.anuladoEn)
                          .map((pago) => (
                            <tr key={pago.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                              <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                                {pago.miembroNombre ?? pago.miembroId}
                              </td>
                              <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                                {nombreMetodo(pago.metodo)}
                              </td>
                              <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                                ${pago.monto.toFixed(2)}
                              </td>
                              <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                                {pago.montoBs !== null ? `Bs. ${formatearBs(pago.montoBs)}` : "—"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {resumen.egresos.length > 0 && (
                <Card className="text-sm">
                  <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
                    Egresos del turno
                  </h2>
                  <div className="max-h-80 overflow-y-auto">
                    {resumen.egresos.map((egreso) => (
                      <div
                        key={egreso.id}
                        className="flex justify-between border-b py-2"
                        style={{ borderColor: "var(--gx-edge)" }}
                      >
                        <span style={{ color: "var(--gx-muted)" }}>{egreso.motivo}</span>
                        <span style={{ color: "var(--gx-ink)" }}>
                          {egreso.moneda === "BS"
                            ? formatearBsConRef(egreso.monto, egreso.montoUSD)
                            : `$${egreso.monto.toFixed(2)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {esPropio && (
            <FormularioArqueo
              accion={cerrarTurnoAction}
              turnoId={resumen.turno.id}
              lineas={resumen.lineas.map((linea) => ({
                metodo: linea.metodo,
                enBs: linea.enBs,
                montoEsperado: linea.montoEsperado,
                refUSD: calcularRefUSD(linea, resumen.turno.fondoInicialEfectivoBs, tasaActual),
              }))}
            />
          )}
        </div>
      </div>
    );
  }

  // sucursalActivaId siempre está resuelta desde el login (ver plan de
  // selección de sucursal) — ya no hace falta preguntar la sucursal acá
  // ni consultar sucursalesVisibles: el operador ya la eligió (o era la
  // única) al iniciar sesión, antes de llegar a esta pantalla.
  const ultimoCierre = await obtenerUltimoCierrePorSucursal(
    { turnos: turnoRepo, arqueo: new PrismaArqueoRepository(prisma) },
    { sucursalId: sucursalActivaId }
  );

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
      <PageHeader>Abrir turno</PageHeader>

      <FormularioAbrirTurno
        accion={abrirTurnoAction}
        requiereSucursal={false}
        sucursales={[]}
        ultimoCierre={ultimoCierre ? { ...ultimoCierre, cerradoEn: ultimoCierre.cerradoEn.toISOString() } : null}
      />
    </div>
  );
}
